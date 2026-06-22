#!/usr/bin/env python3
"""Generate HailuPK app icons (PNG + ICO) with no external dependencies.

Draws a rounded-square gradient tile with a white lightning bolt.
Outputs:
  build/icon.png        (512x512, used by electron-builder / Linux)
  build/icon.ico        (multi-size Windows icon)
  src/renderer/assets/logo.png (256x256, used inside the UI)
"""
import os
import struct
import zlib
import math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lerp(a, b, t):
    return a + (b - a) * t


def hex_rgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


# Palette
C_TL = hex_rgb("#7C3AED")  # violet (top-left)
C_BR = hex_rgb("#06B6D4")  # cyan (bottom-right)
C_BOLT = (255, 255, 255)

BOLT = [
    (0.52, 0.08),
    (0.30, 0.52),
    (0.46, 0.52),
    (0.40, 0.92),
    (0.72, 0.44),
    (0.54, 0.44),
    (0.64, 0.08),
]


def point_in_poly(px, py, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > py) != (yj > py)) and (
            px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def render(size, ss=2):
    """Render an RGBA image of given size with `ss`x supersampling."""
    big = size * ss
    radius = big * 0.22  # corner radius
    # supersampled buffer
    buf = bytearray(big * big * 4)
    for y in range(big):
        ny = y / (big - 1)
        for x in range(big):
            nx = x / (big - 1)
            idx = (y * big + x) * 4
            # rounded-rect alpha (inside the tile?)
            ax = min(x, big - 1 - x)
            ay = min(y, big - 1 - y)
            inside_tile = True
            if ax < radius and ay < radius:
                dx = radius - ax
                dy = radius - ay
                if dx * dx + dy * dy > radius * radius:
                    inside_tile = False
            if not inside_tile:
                continue
            # diagonal gradient
            t = max(0.0, min(1.0, (nx + ny) / 2.0))
            r = int(lerp(C_TL[0], C_BR[0], t))
            g = int(lerp(C_TL[1], C_BR[1], t))
            b = int(lerp(C_TL[2], C_BR[2], t))
            # subtle radial glow toward top-left
            glow = max(0.0, 1.0 - math.hypot(nx - 0.3, ny - 0.3) * 1.1)
            r = min(255, int(r + glow * 40))
            g = min(255, int(g + glow * 40))
            b = min(255, int(b + glow * 50))
            # bolt
            if point_in_poly(nx, ny, BOLT):
                r, g, b = C_BOLT
            buf[idx] = r
            buf[idx + 1] = g
            buf[idx + 2] = b
            buf[idx + 3] = 255

    # downsample ssxss -> 1x (box filter, averages alpha for AA edges)
    out = bytearray(size * size * 4)
    area = ss * ss
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for dy in range(ss):
                for dx in range(ss):
                    sidx = ((y * ss + dy) * big + (x * ss + dx)) * 4
                    sa = buf[sidx + 3]
                    r += buf[sidx] * sa
                    g += buf[sidx + 1] * sa
                    b += buf[sidx + 2] * sa
                    a += sa
            oidx = (y * size + x) * 4
            if a > 0:
                out[oidx] = r // a
                out[oidx + 1] = g // a
                out[oidx + 2] = b // a
            out[oidx + 3] = a // area
    return out


def write_png(path, size, rgba):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        raw += rgba[y * size * 4:(y + 1) * size * 4]
    comp = zlib.compress(bytes(raw), 9)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", comp)
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    return png


def png_bytes(size, rgba):
    import io
    tmp = io.BytesIO()

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw += rgba[y * size * 4:(y + 1) * size * 4]
    comp = zlib.compress(bytes(raw), 9)
    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", comp)
    out += chunk(b"IEND", b"")
    return out


def write_ico(path, sizes):
    images = []
    for s in sizes:
        rgba = render(s, ss=2 if s <= 256 else 1)
        images.append((s, png_bytes(s, rgba)))
    # ICO header
    data = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b""
    blobs = b""
    for s, png in images:
        w = 0 if s >= 256 else s
        h = 0 if s >= 256 else s
        entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png), offset)
        blobs += png
        offset += len(png)
    with open(path, "wb") as f:
        f.write(data + entries + blobs)


def main():
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "src/renderer/assets"), exist_ok=True)

    print("rendering 512 ...")
    rgba512 = render(512, ss=2)
    write_png(os.path.join(ROOT, "build/icon.png"), 512, rgba512)

    print("rendering 256 (logo) ...")
    rgba256 = render(256, ss=2)
    write_png(os.path.join(ROOT, "src/renderer/assets/logo.png"), 256, rgba256)

    print("building ico ...")
    write_ico(os.path.join(ROOT, "build/icon.ico"), [16, 32, 48, 64, 128, 256])
    print("done")


if __name__ == "__main__":
    main()
