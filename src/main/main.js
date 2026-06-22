'use strict';
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  shell,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { Store } = require('./store');

const isWindows = process.platform === 'win32';
function wasOpenedAtLogin() {
  try {
    return !!app.getLoginItemSettings().wasOpenedAtLogin;
  } catch (e) {
    return false;
  }
}
const STARTED_HIDDEN = process.argv.includes('--hidden');

const DEFAULTS = {
  apps: [],
  profiles: [],
  settings: {
    autostart: false,
    startMinimized: false,
    minimizeToTray: true,
    closeToTray: true,
    theme: 'midnight',
    autoRunProfileId: null,
  },
  stats: { launches: 0, lastLaunch: null },
};

let store;
let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#0d0e14',
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    const startHidden =
      STARTED_HIDDEN || wasOpenedAtLogin() || store.all.settings.startMinimized;
    if (!startHidden) mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting && store.all.settings.closeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('minimize', (e) => {
    if (store.all.settings.minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function buildTrayMenu() {
  const profiles = store.all.profiles || [];
  const profileItems = profiles.length
    ? profiles.map((p) => ({
        label: `▶  ${p.name}`,
        click: () => launchProfile(p.id),
      }))
    : [{ label: 'Нет профилей', enabled: false }];

  return Menu.buildFromTemplate([
    { label: 'HailuPK', enabled: false },
    { type: 'separator' },
    { label: 'Открыть окно', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Запустить профиль', submenu: profileItems },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  const img = nativeImage.createFromPath(
    path.join(__dirname, '../../build/icon.png')
  );
  tray = new Tray(img.resize({ width: 18, height: 18 }));
  tray.setToolTip('HailuPK — лаунчер приложений');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => showWindow());
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function showWindow() {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function applyAutostart(enabled) {
  if (!app.isPackaged && isWindows) {
    // setLoginItemSettings is only meaningful for packaged builds
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: ['--hidden'],
    });
  } catch (e) {
    /* noop on unsupported platforms */
  }
}

/* ----------------------------- Launching ----------------------------- */

function launchPath(target, args) {
  return new Promise((resolve) => {
    if (!target) return resolve({ ok: false, error: 'Пустой путь' });
    const exists = fs.existsSync(target);
    try {
      const argv = parseArgs(args);
      if (exists && /\.(exe|bat|cmd|com)$/i.test(target)) {
        const child = spawn(target, argv, {
          detached: true,
          stdio: 'ignore',
          cwd: path.dirname(target),
        });
        child.on('error', (err) =>
          resolve({ ok: false, error: err.message })
        );
        child.unref();
        // give spawn a tick to emit potential error
        setTimeout(() => resolve({ ok: true }), 60);
      } else {
        // URLs, steam:// uris, folders, documents, non-exe targets
        shell
          .openPath(target)
          .then((res) => {
            if (res) {
              // openPath returns error string on failure; try openExternal
              shell.openExternal(target).then(
                () => resolve({ ok: true }),
                (err) => resolve({ ok: false, error: res || String(err) })
              );
            } else {
              resolve({ ok: true });
            }
          })
          .catch((err) => resolve({ ok: false, error: err.message }));
      }
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

/* ----------------------- Auto-detect installed apps ----------------------- */
let installedCache = null;

function expandEnv(p) {
  return p.replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);
}

// Resolve a path that may contain a single '*' wildcard directory segment.
function globResolve(pattern) {
  const parts = pattern.split(/[\\/]/);
  let bases = [parts[0] ? parts[0] + path.sep : path.sep];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    const next = [];
    if (seg.includes('*')) {
      const re = new RegExp(
        '^' +
          seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') +
          '$',
        'i'
      );
      for (const base of bases) {
        let entries = [];
        try {
          entries = fs.readdirSync(base);
        } catch (e) {
          continue;
        }
        for (const name of entries)
          if (re.test(name)) next.push(path.join(base, name));
      }
    } else {
      for (const base of bases) next.push(path.join(base, seg));
    }
    bases = next;
  }
  return bases.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch (e) {
      return false;
    }
  });
}

// Catalogue of popular apps and the locations they usually live in.
const POPULAR = [
  { name: 'Steam', c: ['%ProgramFiles(x86)%\\Steam\\steam.exe', '%ProgramFiles%\\Steam\\steam.exe'] },
  { name: 'Discord', c: ['%LOCALAPPDATA%\\Discord\\app-*\\Discord.exe', '%LOCALAPPDATA%\\Discord\\Update.exe'] },
  { name: 'Telegram', c: ['%APPDATA%\\Telegram Desktop\\Telegram.exe', '%LOCALAPPDATA%\\Programs\\Telegram Desktop\\Telegram.exe'] },
  { name: 'Google Chrome', c: ['%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe', '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe'] },
  { name: 'Microsoft Edge', c: ['%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe', '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe'] },
  { name: 'Mozilla Firefox', c: ['%ProgramFiles%\\Mozilla Firefox\\firefox.exe', '%ProgramFiles(x86)%\\Mozilla Firefox\\firefox.exe'] },
  { name: 'Opera GX', c: ['%LOCALAPPDATA%\\Programs\\Opera GX\\opera.exe', '%LOCALAPPDATA%\\Programs\\Opera GX\\launcher.exe'] },
  { name: 'Opera', c: ['%LOCALAPPDATA%\\Programs\\Opera\\opera.exe', '%LOCALAPPDATA%\\Programs\\Opera\\launcher.exe'] },
  { name: 'Brave', c: ['%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'] },
  { name: 'Yandex Browser', c: ['%LOCALAPPDATA%\\Yandex\\YandexBrowser\\Application\\browser.exe'] },
  { name: 'Spotify', c: ['%APPDATA%\\Spotify\\Spotify.exe'] },
  { name: 'Epic Games Launcher', c: ['%ProgramFiles%\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe', '%ProgramFiles(x86)%\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe'] },
  { name: 'Battle.net', c: ['%ProgramFiles(x86)%\\Battle.net\\Battle.net.exe'] },
  { name: 'Riot Client', c: ['%ProgramFiles%\\Riot Games\\Riot Client\\RiotClientServices.exe', '%ProgramFiles(x86)%\\Riot Games\\Riot Client\\RiotClientServices.exe'] },
  { name: 'GOG Galaxy', c: ['%ProgramFiles(x86)%\\GOG Galaxy\\GalaxyClient.exe'] },
  { name: 'OBS Studio', c: ['%ProgramFiles%\\obs-studio\\bin\\64bit\\obs64.exe'] },
  { name: 'VLC', c: ['%ProgramFiles%\\VideoLAN\\VLC\\vlc.exe', '%ProgramFiles(x86)%\\VideoLAN\\VLC\\vlc.exe'] },
  { name: 'Visual Studio Code', c: ['%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe', '%ProgramFiles%\\Microsoft VS Code\\Code.exe'] },
  { name: 'Telegram', c: ['%APPDATA%\\Telegram Desktop\\Telegram.exe'] },
  { name: 'WhatsApp', c: ['%LOCALAPPDATA%\\WhatsApp\\WhatsApp.exe'] },
  { name: 'Zoom', c: ['%APPDATA%\\Zoom\\bin\\Zoom.exe'] },
  { name: 'Skype', c: ['%ProgramFiles(x86)%\\Microsoft\\Skype for Desktop\\Skype.exe'] },
  { name: 'qBittorrent', c: ['%ProgramFiles%\\qBittorrent\\qbittorrent.exe'] },
  { name: 'Photoshop', c: ['%ProgramFiles%\\Adobe\\Adobe Photoshop *\\Photoshop.exe'] },
  { name: 'Figma', c: ['%LOCALAPPDATA%\\Figma\\Figma.exe', '%LOCALAPPDATA%\\Figma\\app-*\\Figma.exe'] },
  { name: 'Roblox', c: ['%LOCALAPPDATA%\\Roblox\\Versions\\*\\RobloxPlayerBeta.exe'] },
];

function steamPath() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (m) return m[1].trim().replace(/\//g, '\\');
  } catch (e) {
    /* registry not available */
  }
  const def = expandEnv('%ProgramFiles(x86)%\\Steam');
  if (fs.existsSync(def)) return def;
  return null;
}

function steamGames() {
  const sp = steamPath();
  if (!sp) return [];
  const libs = new Set([sp]);
  try {
    const vdf = fs.readFileSync(
      path.join(sp, 'steamapps', 'libraryfolders.vdf'),
      'utf8'
    );
    const re = /"path"\s+"([^"]+)"/g;
    let m;
    while ((m = re.exec(vdf))) libs.add(m[1].replace(/\\\\/g, '\\'));
  } catch (e) {
    /* no library file */
  }
  const games = [];
  const skip = /redist|proton|steamworks|soundtrack|dedicated server|sdk|benchmark/i;
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/i.test(f));
    } catch (e) {
      continue;
    }
    for (const f of files) {
      try {
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        const id = (txt.match(/"appid"\s+"(\d+)"/i) || [])[1];
        const nm = (txt.match(/"name"\s+"([^"]+)"/i) || [])[1];
        if (id && nm && !skip.test(nm))
          games.push({
            name: nm,
            path: `steam://rungameid/${id}`,
            args: '',
            kind: 'game',
          });
      } catch (e) {
        /* unreadable manifest */
      }
    }
  }
  return games;
}

function scanInstalled(force) {
  if (installedCache && !force) return installedCache;
  const found = new Map();
  const add = (name, p, args, kind) => {
    if (!name || !p) return;
    const key = name.toLowerCase();
    if (!found.has(key))
      found.set(key, { name, path: p, args: args || '', kind: kind || 'app' });
  };

  if (process.platform === 'win32') {
    // 1) Popular apps at well-known locations
    for (const app of POPULAR) {
      for (const cand of app.c) {
        const hits = globResolve(expandEnv(cand));
        if (hits.length) {
          add(app.name, hits.sort().reverse()[0], '', 'app');
          break;
        }
      }
    }

    // 2) Steam games (CS2, etc.) via library manifests
    for (const g of steamGames()) add(g.name, g.path, g.args, 'game');

    // 3) Start Menu shortcuts (covers everything else installed)
    const dirs = [
      path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs'),
      path.join(process.env.ProgramData || '', 'Microsoft/Windows/Start Menu/Programs'),
    ];
    const skip = /uninstall|удал|readme|read me|help|справк|документ|manual|website|сайт|homepage|repair|modify/i;
    const walk = (dir, depth) => {
      if (depth > 4) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (e.isFile() && /\.lnk$/i.test(e.name)) {
          const name = e.name.replace(/\.lnk$/i, '').trim();
          if (skip.test(name)) continue;
          try {
            const info = shell.readShortcutLink(full);
            if (info && info.target && /\.exe$/i.test(info.target))
              add(name, info.target, info.args || '', 'app');
          } catch (e) {
            /* unreadable shortcut */
          }
        }
      }
    };
    dirs.forEach((d) => walk(d, 0));
  }

  installedCache = [...found.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  return installedCache;
}

function parseArgs(str) {
  if (!str) return [];
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(str)) !== null) out.push(m[1] || m[2] || m[3]);
  return out;
}

function bumpStats() {
  const data = store.all;
  data.stats.launches = (data.stats.launches || 0) + 1;
  data.stats.lastLaunch = Date.now();
  store.set(data);
}

async function launchApp(appId) {
  const appItem = (store.all.apps || []).find((a) => a.id === appId);
  if (!appItem) return { ok: false, error: 'Приложение не найдено' };
  const res = await launchPath(appItem.path, appItem.args);
  if (res.ok) bumpStats();
  return res;
}

async function launchProfile(profileId) {
  const profile = (store.all.profiles || []).find((p) => p.id === profileId);
  if (!profile) return { ok: false, error: 'Профиль не найден' };
  const apps = store.all.apps || [];
  const results = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  if (profile.mode === 'parallel') {
    await Promise.all(
      (profile.steps || []).map(async (step) => {
        const appItem = apps.find((a) => a.id === step.appId);
        if (appItem) {
          const r = await launchPath(appItem.path, appItem.args);
          results.push({ name: appItem.name, ...r });
        }
      })
    );
  } else {
    for (const step of profile.steps || []) {
      const appItem = apps.find((a) => a.id === step.appId);
      if (!appItem) continue;
      const r = await launchPath(appItem.path, appItem.args);
      results.push({ name: appItem.name, ...r });
      const delay = Number(step.delay) || 0;
      if (delay > 0) await sleep(delay * 1000);
    }
  }
  bumpStats();
  if (mainWindow) mainWindow.webContents.send('profile-launched', { profileId });
  return { ok: true, results };
}

/* ------------------------------- IPC -------------------------------- */

function registerIpc() {
  ipcMain.handle('config:get', () => store.all);

  ipcMain.handle('config:set', (_e, data) => {
    const saved = store.set(data);
    refreshTray();
    return saved;
  });

  ipcMain.handle('apps:scan', (_e, force) => scanInstalled(force));

  ipcMain.handle('launch:app', (_e, id) => launchApp(id));
  ipcMain.handle('launch:profile', (_e, id) => launchProfile(id));

  ipcMain.handle('launch:many', async (_e, { ids, mode, delay }) => {
    const apps = store.all.apps || [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const results = [];
    if (mode === 'sequential') {
      for (const id of ids) {
        const appItem = apps.find((a) => a.id === id);
        if (!appItem) continue;
        const r = await launchPath(appItem.path, appItem.args);
        results.push({ name: appItem.name, ...r });
        if ((Number(delay) || 0) > 0) await sleep((Number(delay) || 0) * 1000);
      }
    } else {
      await Promise.all(
        ids.map(async (id) => {
          const appItem = apps.find((a) => a.id === id);
          if (!appItem) return;
          const r = await launchPath(appItem.path, appItem.args);
          results.push({ name: appItem.name, ...r });
        })
      );
    }
    bumpStats();
    return { ok: true, results };
  });

  ipcMain.handle('dialog:pickExe', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите приложение',
      properties: ['openFile'],
      filters: isWindows
        ? [
            { name: 'Программы', extensions: ['exe', 'bat', 'cmd', 'lnk'] },
            { name: 'Все файлы', extensions: ['*'] },
          ]
        : [{ name: 'Все файлы', extensions: ['*'] }],
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('dialog:pickImage', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите иконку',
      properties: ['openFile'],
      filters: [
        { name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'] },
      ],
    });
    if (res.canceled || !res.filePaths.length) return null;
    try {
      const buf = fs.readFileSync(res.filePaths[0]);
      const ext = path.extname(res.filePaths[0]).slice(1).toLowerCase();
      const mime = ext === 'ico' ? 'image/x-icon' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('autostart:set', (_e, enabled) => {
    applyAutostart(enabled);
    const data = store.all;
    data.settings.autostart = enabled;
    store.set(data);
    return enabled;
  });

  ipcMain.handle('win:minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.handle('win:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('win:close', () => mainWindow && mainWindow.close());
  ipcMain.handle('app:version', () => app.getVersion());
}

/* ------------------------------ Lifecycle ---------------------------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    store = new Store(app.getPath('userData'), DEFAULTS);
    registerIpc();
    createWindow();
    createTray();

    // sync autostart with stored preference
    applyAutostart(!!store.all.settings.autostart);

    // optionally auto-run a profile on startup
    const autoId = store.all.settings.autoRunProfileId;
    if (autoId) {
      setTimeout(() => launchProfile(autoId), 1500);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    // keep running in tray; only quit explicitly
    if (!store || !store.all.settings.closeToTray) {
      if (process.platform !== 'darwin') app.quit();
    }
  });
}
