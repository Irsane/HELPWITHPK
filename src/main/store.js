'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Tiny dependency-free JSON config store living in the app's userData dir.
 */
class Store {
  constructor(userDataDir, defaults) {
    this.file = path.join(userDataDir, 'hailupk.config.json');
    this.defaults = defaults || {};
    this.data = this._read();
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.file, 'utf-8');
      const parsed = JSON.parse(raw);
      return this._merge(this.defaults, parsed);
    } catch (e) {
      return JSON.parse(JSON.stringify(this.defaults));
    }
  }

  _merge(base, override) {
    const out = Array.isArray(base) ? [] : { ...base };
    for (const k of Object.keys(base)) out[k] = base[k];
    for (const k of Object.keys(override || {})) {
      if (
        override[k] &&
        typeof override[k] === 'object' &&
        !Array.isArray(override[k]) &&
        base[k] &&
        typeof base[k] === 'object' &&
        !Array.isArray(base[k])
      ) {
        out[k] = this._merge(base[k], override[k]);
      } else {
        out[k] = override[k];
      }
    }
    return out;
  }

  get all() {
    return this.data;
  }

  set(data) {
    this.data = data;
    this._write();
    return this.data;
  }

  _write() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      // best effort
    }
  }
}

module.exports = { Store };
