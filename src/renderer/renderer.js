'use strict';

const api = window.hailu;

// full interface themes
const THEMES = [
  { id: 'midnight', name: 'Полночь', accent: '#7c3aed', accent2: '#06b6d4', bg: '#0c0d13', bg2: '#111320', text: '#eef0f6', muted: '#8b8fa3' },
  { id: 'sunset', name: 'Закат', accent: '#f97316', accent2: '#ec4899', bg: '#140d12', bg2: '#1d121a', text: '#f6eef2', muted: '#a8909c' },
  { id: 'forest', name: 'Лес', accent: '#22c55e', accent2: '#14b8a6', bg: '#0a1110', bg2: '#0f1a17', text: '#eaf5f0', muted: '#85a39a' },
  { id: 'ocean', name: 'Океан', accent: '#3b82f6', accent2: '#6366f1', bg: '#0a0e1a', bg2: '#101627', text: '#eef1f8', muted: '#8b93a8' },
  { id: 'crimson', name: 'Багровая', accent: '#ef4444', accent2: '#f59e0b', bg: '#140a0a', bg2: '#1d1010', text: '#f8eeee', muted: '#a8908f' },
  { id: 'neon', name: 'Неон', accent: '#a855f7', accent2: '#ec4899', bg: '#0d0a14', bg2: '#15101f', text: '#f1eef8', muted: '#988fa8' },
  { id: 'graphite', name: 'Графит', accent: '#64748b', accent2: '#94a3b8', bg: '#0e0f12', bg2: '#15171c', text: '#eef0f4', muted: '#8b8f9a' },
  { id: 'aurora', name: 'Аврора', accent: '#06b6d4', accent2: '#22c55e', bg: '#08110f', bg2: '#0e1a17', text: '#eaf6f3', muted: '#83a39c' },
];

const PRESET_ICONS = [
  '🎮', '🔫', '🕹️', '💬', '🎧', '🎵', '🎬', '📺',
  '🌐', '🛡️', '🚀', '⚡', '💻', '📁', '🎨', '📷',
  '🎙️', '📝', '🧩', '🛒', '💎', '🔥', '⭐', '🤖',
];

let config = null;
let editingAppId = null;
let editingProfileId = null;
let profileDraftSteps = [];
let profileDraftMode = 'sequential';
let appDraftIcon = null; // dataURL or null
let appDraftEmoji = '🎮';
let appDraftColor = null; // null = авто по названию
let installedApps = [];
const selected = new Set();

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 10);

/* ============================ Boot ============================ */
async function boot() {
  config = await api.getConfig();
  api.version().then((v) => ($('#versionBadge').textContent = 'v' + v));
  applyTheme(config.settings.theme || 'midnight');
  wireChrome();
  wireNav();
  wireApps();
  wireProfiles();
  wireSettings();
  wireStartup();
  renderAll();
  setGreeting();
  api.onProfileLaunched(() => {});
  maybeStartupChooser();
}

/* ============================ Startup chooser ============================ */
function wireStartup() {
  $('#startupOpen').onclick = () => $('#startupChooser').classList.remove('open');
  $('#startupTray').onclick = () => {
    $('#startupChooser').classList.remove('open');
    api.hideToTray();
  };
}

async function maybeStartupChooser() {
  let st = null;
  try {
    st = await api.startupState();
  } catch (e) {
    return;
  }
  if (!st || !st.chooser || !config.profiles.length) return;
  const list = $('#startupProfiles');
  list.innerHTML = '';
  config.profiles.forEach((p) => {
    const el = document.createElement('button');
    el.className = 'startup-card';
    el.innerHTML = `
      <div class="profile-badge">${p.icon || '🚀'}</div>
      <div class="su-meta">
        <b>${escapeHtml(p.name)}</b>
        <small>${p.steps.length} прил. · ${
      p.mode === 'parallel' ? 'все сразу' : 'по очереди'
    }</small>
      </div>
      <span class="su-go">▶</span>`;
    el.onclick = async () => {
      $('#startupChooser').classList.remove('open');
      toast('ok', 'Запускаю профиль', p.name);
      await api.launchProfile(p.id);
      refreshStats();
      api.hideToTray();
    };
    list.appendChild(el);
  });
  $('#startupChooser').classList.add('open');
}

function save() {
  return api.setConfig(config);
}

function renderAll() {
  renderDashboard();
  renderApps();
  renderProfiles();
  renderSettings();
  $('#statApps').textContent = config.apps.length;
  $('#statProfiles').textContent = config.profiles.length;
}

/* ============================ Window chrome ============================ */
function wireChrome() {
  $('#minBtn').onclick = () => api.minimize();
  $('#maxBtn').onclick = () => api.maximize();
  $('#closeBtn').onclick = () => api.close();
}

function wireNav() {
  $$('.nav-item').forEach((btn) => {
    btn.onclick = () => {
      $$('.nav-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.view').forEach((v) => v.classList.remove('active'));
      $('#view-' + btn.dataset.view).classList.add('active');
    };
  });
}

/* ============================ Greeting ============================ */
function setGreeting() {
  const h = new Date().getHours();
  let g = 'Добрый вечер';
  if (h < 6) g = 'Доброй ночи';
  else if (h < 12) g = 'Доброе утро';
  else if (h < 18) g = 'Добрый день';
  $('#greeting').textContent = g + '! ⚡';
}

/* ============================ Dashboard ============================ */
function renderDashboard() {
  $('#statLaunches').textContent = config.stats.launches || 0;
  const last = config.stats.lastLaunch;
  $('#statLast').textContent = last ? timeAgo(last) : '—';

  const dp = $('#dashProfiles');
  dp.innerHTML = '';
  if (!config.profiles.length) {
    dp.innerHTML =
      '<p class="muted">Профилей пока нет — создай их во вкладке «Профили».</p>';
  } else {
    config.profiles.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'quick-card';
      el.innerHTML = `
        <div class="profile-badge">${p.icon || '🚀'}</div>
        <div>
          <b>${escapeHtml(p.name)}</b><br/>
          <small>${p.steps.length} прил. • ${
        p.mode === 'parallel' ? 'все сразу' : 'по очереди'
      }</small>
        </div>`;
      el.onclick = () => runProfile(p.id, p.name);
      dp.appendChild(el);
    });
  }

  const da = $('#dashApps');
  da.innerHTML = '';
  const favs = config.apps.filter((a) => a.fav);
  const list = favs.length ? favs : config.apps.slice(0, 6);
  if (!list.length) {
    da.innerHTML =
      '<p class="muted">Добавь приложения во вкладке «Приложения».</p>';
  } else {
    list.forEach((a) => da.appendChild(appCard(a, false)));
  }
}

/* ============================ Apps ============================ */
function wireApps() {
  $('#addAppBtn').onclick = () => openAppModal(null);
  $('#appSearch').oninput = renderApps;
  $('#selectModeBtn').onclick = toggleSelectMode;
  $('#cancelSelect').onclick = toggleSelectMode;
  $('#multiMode').onchange = (e) => {
    $('#multiDelayWrap').style.display =
      e.target.value === 'sequential' ? 'flex' : 'none';
  };
  $('#launchSelected').onclick = launchSelected;

  // app modal
  $('#cancelAppBtn').onclick = closeAppModal;
  $('#saveAppBtn').onclick = saveApp;
  $('#deleteAppBtn').onclick = deleteApp;
  $('#browseBtn').onclick = async () => {
    const p = await api.pickExe();
    if (p) {
      $('#appPath').value = p;
      if (!$('#appName').value) {
        const base = p.split(/[\\/]/).pop().replace(/\.(exe|lnk|bat|cmd)$/i, '');
        $('#appName').value = base;
      }
      updateIconPreview();
      await useRealIcon(p);
    }
  };
  const chooseImage = async () => {
    const img = await api.pickImage();
    if (img) {
      appDraftIcon = img;
      updateIconPreview();
      markIconActive();
    } else {
      toast('err', 'Картинка не выбрана');
    }
  };
  $('#pickImageBtn').onclick = chooseImage;
  $('#iconPreview').onclick = chooseImage;
  $('#clearImageBtn').onclick = () => {
    appDraftIcon = null;
    updateIconPreview();
    markIconActive();
  };

  // autodetect suggestions
  $('#appName').oninput = (e) => {
    updateSuggest(e.target.value);
    updateIconPreview();
  };
  $('#appName').onfocus = (e) => updateSuggest(e.target.value);
  $('#appName').onblur = () =>
    setTimeout(() => $('#appSuggest').classList.remove('open'), 160);
}

/* ----- icon preset grid ----- */
function renderIconGrid() {
  const wrap = $('#iconGrid');
  wrap.innerHTML = '';
  PRESET_ICONS.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-opt';
    b.textContent = e;
    b.onclick = () => {
      appDraftEmoji = e;
      appDraftIcon = null;
      updateIconPreview();
      markIconActive();
    };
    wrap.appendChild(b);
  });
  markIconActive();
}

function markIconActive() {
  $$('#iconGrid .icon-opt').forEach((b) =>
    b.classList.toggle(
      'active',
      !appDraftIcon && b.textContent === appDraftEmoji
    )
  );
}

/* ----- autodetect installed apps ----- */
function guessEmoji(name) {
  const n = (name || '').toLowerCase();
  const map = [
    [/discord/, '💬'],
    [/cs2|counter|csgo|valorant|call of duty|warzone|pubg|apex/, '🔫'],
    [/steam|epic|riot|battle\.net|game|игр|gog|ubisoft|origin/, '🎮'],
    [/spotify|music|музык|deezer|itunes|yandex *music/, '🎵'],
    [/obs|stream|streamlabs/, '🎥'],
    [/chrome|edge|firefox|opera|brave|browser|yandex|браузер|tor/, '🌐'],
    [/vpn|nord|proton|warp|express|surfshark|outline/, '🛡️'],
    [/telegram/, '✈️'],
    [/whatsapp|skype|zoom|teams|viber|slack/, '💬'],
    [/code|vscode|sublime|notepad|intellij|pycharm|webstorm/, '💻'],
    [/photoshop|figma|paint|gimp|illustrator|design|canva/, '🎨'],
    [/word|excel|office|pdf|acrobat|onenote|doc/, '📝'],
    [/torrent|qbittorrent|download|utorrent/, '⬇️'],
    [/youtube|video|vlc|media|player|kino|movie/, '📺'],
    [/photo|camera|obs|capture/, '📷'],
  ];
  for (const [re, e] of map) if (re.test(n)) return e;
  return '🚀';
}

// short aliases that acronyms don't cover
const ALIASES = [
  ['val', /valorant/i],
  ['pubg', /playerunknown|pubg|battlegrounds/i],
  ['tg', /telegram/i],
  ['ps', /photoshop/i],
  ['ae', /after effects/i],
  ['vsc', /visual studio code/i],
  ['cod', /call of duty/i],
  ['gta', /grand theft auto/i],
];

function matchScore(app, q) {
  const name = app.name.toLowerCase();
  const compact = name.replace(/[^a-zа-я0-9]+/gi, '');
  const words = name.split(/[^a-zа-я0-9]+/i).filter(Boolean);
  // acronym: first letter of each word, but keep numeric words whole (cs2)
  const acro = words.map((w) => (/^\d+$/.test(w) ? w : w[0])).join('');
  let best = 0;
  const t = (cond, score) => {
    if (cond && score > best) best = score;
  };
  t(name === q, 110);
  t(name.startsWith(q), 100);
  t(acro === q, 96);
  t(acro.startsWith(q), 88);
  t(words.some((w) => w.startsWith(q)), 80);
  t(compact.startsWith(q), 72);
  t(compact.includes(q), 58);
  t(name.includes(q), 50);
  for (const [al, re] of ALIASES) if (al === q && re.test(name)) t(true, 94);
  return best;
}

function emojiForApp(a) {
  const e = guessEmoji(a.name);
  if (e === '🚀' && a.kind === 'game') return '🎮';
  return e;
}

function updateSuggest(q) {
  const box = $('#appSuggest');
  q = (q || '').trim().toLowerCase();
  if (q.length < 2 || !installedApps.length) {
    box.classList.remove('open');
    return;
  }
  const scored = [];
  for (const a of installedApps) {
    const s = matchScore(a, q);
    if (s > 0) scored.push([s, a]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  const matches = scored.slice(0, 8).map((x) => x[1]);
  if (!matches.length) {
    box.innerHTML =
      '<div class="suggest-empty">Ничего не нашлось среди установленных — впиши путь вручную или нажми «Обзор».</div>';
    box.classList.add('open');
    return;
  }
  box.innerHTML = matches
    .map((a, i) => {
      const steam = /^steam:/i.test(a.path);
      return `
      <div class="suggest-item" data-i="${i}">
        <div class="suggest-ico">${emojiForApp(a)}</div>
        <div class="suggest-meta">
          <div class="suggest-name">${escapeHtml(a.name)}${
        steam ? '<span class="suggest-tag">Steam</span>' : ''
      }</div>
          <div class="suggest-path">${escapeHtml(a.path)}</div>
        </div>
      </div>`;
    })
    .join('');
  box.classList.add('open');
  box.querySelectorAll('.suggest-item').forEach((el) => {
    el.onmousedown = (ev) => {
      ev.preventDefault();
      applySuggest(matches[+el.dataset.i]);
    };
  });
}

async function applySuggest(a) {
  $('#appName').value = a.name;
  $('#appPath').value = a.path;
  $('#appArgs').value = a.args || '';
  appDraftEmoji = emojiForApp(a);
  appDraftIcon = null;
  updateIconPreview();
  markIconActive();
  $('#appSuggest').classList.remove('open');
  toast('ok', 'Найдено автоматически', a.name);
  // по умолчанию подставляем «родную» иконку приложения из .exe
  await useRealIcon(a.path);
}

// Если у пути есть .exe — берём его настоящую иконку.
// Если нет (steam:// и пр.) — остаётся выбранный эмодзи/картинка.
async function useRealIcon(p) {
  try {
    const icon = await api.fileIcon(p);
    if (icon) {
      appDraftIcon = icon;
      updateIconPreview();
      markIconActive();
    }
  } catch (e) {
    /* ignore */
  }
}

function appCard(a, allowSelect) {
  const el = document.createElement('div');
  el.className = 'app-card';
  el.style.setProperty('--card-color', a.color || autoColor(a.name));
  if (selected.has(a.id)) el.classList.add('selected');
  const icoInner = a.icon
    ? `<img src="${a.icon}" />`
    : a.emoji || a.name.slice(0, 1).toUpperCase();
  el.innerHTML = `
    <div class="card-check">${selected.has(a.id) ? '✓' : ''}</div>
    <button class="card-edit" title="Изменить">✎</button>
    <div class="card-ico">${icoInner}</div>
    <div class="card-name">${escapeHtml(a.name)}</div>
    <div class="card-actions">
      <button class="btn primary">▶ Запуск</button>
    </div>`;
  el.querySelector('.card-edit').onclick = (e) => {
    e.stopPropagation();
    openAppModal(a.id);
  };
  el.querySelector('.card-actions .btn').onclick = (e) => {
    e.stopPropagation();
    runApp(a.id, a.name);
  };
  el.onclick = () => {
    if (document.body.classList.contains('select-mode')) toggleSelect(a.id);
    else runApp(a.id, a.name);
  };
  return el;
}

function renderApps() {
  const grid = $('#appsGrid');
  const q = ($('#appSearch').value || '').toLowerCase().trim();
  grid.innerHTML = '';
  const list = config.apps.filter(
    (a) =>
      !q ||
      a.name.toLowerCase().includes(q) ||
      (a.path || '').toLowerCase().includes(q)
  );
  $('#appsEmpty').style.display = config.apps.length ? 'none' : 'block';
  list.forEach((a) => grid.appendChild(appCard(a, true)));
}

function toggleSelectMode() {
  document.body.classList.toggle('select-mode');
  selected.clear();
  updateMultiCount();
  renderApps();
}

function toggleSelect(id) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  updateMultiCount();
  renderApps();
}

function updateMultiCount() {
  $('#multiCount').textContent = 'Выбрано: ' + selected.size;
}

async function launchSelected() {
  if (!selected.size) return toast('err', 'Ничего не выбрано');
  const mode = $('#multiMode').value;
  const delay = $('#multiDelay').value;
  const ids = [...selected];
  toast('ok', 'Запускаю', `${ids.length} прил. — ${mode === 'sequential' ? 'по очереди' : 'сразу'}`);
  const res = await api.launchMany({ ids, mode, delay });
  reportResults(res);
  toggleSelectMode();
  refreshStats();
}

/* ----- App modal ----- */
// палитра цветов иконок — те же акценты, что и в темах, плюс «Авто»
function renderPalette() {
  const wrap = $('#appPalette');
  wrap.innerHTML = '';
  const auto = document.createElement('button');
  auto.type = 'button';
  auto.className = 'sw auto';
  auto.title = 'Авто (по названию)';
  auto.textContent = 'A';
  auto.dataset.color = '';
  auto.onclick = () => {
    appDraftColor = null;
    markPalette();
    updateIconPreview();
  };
  wrap.appendChild(auto);
  THEMES.forEach((t) => {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'sw';
    sw.style.background = `linear-gradient(150deg, color-mix(in srgb, ${t.accent} 75%, #fff), ${t.accent})`;
    sw.dataset.color = t.accent;
    sw.title = t.name;
    sw.onclick = () => {
      appDraftColor = t.accent;
      markPalette();
      updateIconPreview();
    };
    wrap.appendChild(sw);
  });
  markPalette();
}

function markPalette() {
  $$('#appPalette .sw').forEach((s) =>
    s.classList.toggle('active', (s.dataset.color || null) === appDraftColor)
  );
}

function openAppModal(id) {
  editingAppId = id;
  $('#appSuggest').classList.remove('open');
  renderIconGrid();
  // load installed apps for autodetect (cached in main)
  api.scanInstalled().then((list) => {
    installedApps = list || [];
  });
  if (id) {
    const a = config.apps.find((x) => x.id === id);
    $('#appModalTitle').textContent = 'Изменить приложение';
    $('#appName').value = a.name;
    $('#appPath').value = a.path || '';
    $('#appArgs').value = a.args || '';
    $('#appFav').checked = !!a.fav;
    appDraftIcon = a.icon || null;
    appDraftEmoji = a.emoji || '🎮';
    appDraftColor = a.color || null;
    $('#deleteAppBtn').style.display = 'inline-block';
  } else {
    $('#appModalTitle').textContent = 'Новое приложение';
    $('#appName').value = '';
    $('#appPath').value = '';
    $('#appArgs').value = '';
    $('#appFav').checked = false;
    appDraftIcon = null;
    appDraftEmoji = '🎮';
    appDraftColor = null;
    $('#deleteAppBtn').style.display = 'none';
  }
  renderPalette();
  updateIconPreview();
  markIconActive();
  $('#appModal').classList.add('open');
  $('#appName').focus();
}

function updateIconPreview() {
  const prev = $('#iconPreview');
  prev.style.setProperty(
    '--prev-color',
    appDraftColor || autoColor($('#appName').value)
  );
  if (appDraftIcon) prev.innerHTML = `<img src="${appDraftIcon}" />`;
  else prev.textContent = appDraftEmoji || '🎮';
}

// deterministic pleasant colour derived from the app name
function autoColor(name) {
  let h = 0;
  const s = name || 'app';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 64% 52%)`;
}

function closeAppModal() {
  $('#appModal').classList.remove('open');
}

async function saveApp() {
  const name = $('#appName').value.trim();
  const pathv = $('#appPath').value.trim();
  if (!name) return toast('err', 'Укажите название');
  if (!pathv) return toast('err', 'Укажите путь или ссылку');
  const data = {
    name,
    path: pathv,
    args: $('#appArgs').value.trim(),
    emoji: appDraftEmoji,
    icon: appDraftIcon,
    color: appDraftColor, // null = авто по названию
    fav: $('#appFav').checked,
  };
  if (editingAppId) {
    const a = config.apps.find((x) => x.id === editingAppId);
    Object.assign(a, data);
  } else {
    config.apps.push({ id: uid(), ...data });
  }
  await save();
  closeAppModal();
  renderAll();
  toast('ok', 'Сохранено', name);
}

async function deleteApp() {
  if (!editingAppId) return;
  config.apps = config.apps.filter((a) => a.id !== editingAppId);
  // also strip from profiles
  config.profiles.forEach(
    (p) => (p.steps = p.steps.filter((s) => s.appId !== editingAppId))
  );
  await save();
  closeAppModal();
  renderAll();
  toast('ok', 'Удалено');
}

/* ============================ Profiles ============================ */
function wireProfiles() {
  $('#addProfileBtn').onclick = () => openProfileModal(null);
  $('#cancelProfileBtn').onclick = () =>
    $('#profileModal').classList.remove('open');
  $('#saveProfileBtn').onclick = saveProfile;
  $('#deleteProfileBtn').onclick = deleteProfile;
  $('#addStepBtn').onclick = addStep;
  $$('#profileMode button').forEach((b) => {
    b.onclick = () => {
      profileDraftMode = b.dataset.mode;
      $$('#profileMode button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      $('#modeHint').textContent =
        profileDraftMode === 'sequential'
          ? 'Приложения стартуют одно за другим. Удобно: сначала VPN, ждём, потом игра.'
          : 'Все приложения запускаются одновременно.';
      renderSteps();
    };
  });
}

function renderProfiles() {
  const wrap = $('#profilesList');
  wrap.innerHTML = '';
  $('#profilesEmpty').style.display = config.profiles.length ? 'none' : 'block';
  config.profiles.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'profile-card';
    const chips = p.steps
      .map((s) => {
        const a = config.apps.find((x) => x.id === s.appId);
        return a ? `<span class="chip">${escapeHtml(a.name)}</span>` : '';
      })
      .join('');
    el.innerHTML = `
      <div class="profile-badge">${p.icon || '🚀'}</div>
      <div class="profile-info">
        <h3>${escapeHtml(p.name)}</h3>
        <div class="profile-chips">
          <span class="chip mode">${
            p.mode === 'parallel' ? '⚡ Все сразу' : '↘ По очереди'
          }</span>
          ${chips}
        </div>
      </div>
      <div class="btn-group">
        <button class="btn ghost edit-p">Изменить</button>
        <button class="btn primary run-p">▶ Запустить</button>
      </div>`;
    el.querySelector('.run-p').onclick = () => runProfile(p.id, p.name);
    el.querySelector('.edit-p').onclick = () => openProfileModal(p.id);
    wrap.appendChild(el);
  });
}

function openProfileModal(id) {
  editingProfileId = id;
  // populate app select
  const sel = $('#stepAppSelect');
  sel.innerHTML = config.apps.length
    ? config.apps.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')
    : '<option value="">Сначала добавьте приложения</option>';

  if (id) {
    const p = config.profiles.find((x) => x.id === id);
    $('#profileModalTitle').textContent = 'Изменить профиль';
    $('#profileName').value = p.name;
    profileDraftMode = p.mode;
    profileDraftSteps = p.steps.map((s) => ({ ...s }));
    $('#deleteProfileBtn').style.display = 'inline-block';
  } else {
    $('#profileModalTitle').textContent = 'Новый профиль';
    $('#profileName').value = '';
    profileDraftMode = 'sequential';
    profileDraftSteps = [];
    $('#deleteProfileBtn').style.display = 'none';
  }
  $$('#profileMode button').forEach((x) =>
    x.classList.toggle('active', x.dataset.mode === profileDraftMode)
  );
  $('#modeHint').textContent =
    profileDraftMode === 'sequential'
      ? 'Приложения стартуют одно за другим. Удобно: сначала VPN, ждём, потом игра.'
      : 'Все приложения запускаются одновременно.';
  renderSteps();
  $('#profileModal').classList.add('open');
  $('#profileName').focus();
}

function addStep() {
  const id = $('#stepAppSelect').value;
  if (!id) return toast('err', 'Нет приложений для добавления');
  profileDraftSteps.push({ appId: id, delay: 3 });
  renderSteps();
}

function renderSteps() {
  const wrap = $('#profileSteps');
  wrap.innerHTML = '';
  if (!profileDraftSteps.length) {
    wrap.innerHTML = '<p class="muted">Добавь шаги — приложения для запуска.</p>';
    return;
  }
  profileDraftSteps.forEach((s, i) => {
    const a = config.apps.find((x) => x.id === s.appId);
    const row = document.createElement('div');
    row.className = 'step';
    const isSeq = profileDraftMode === 'sequential';
    const isLast = i === profileDraftSteps.length - 1;
    row.innerHTML = `
      <span class="step-num">${i + 1}</span>
      <span class="step-name">${a ? escapeHtml(a.name) : '⚠ удалено'}</span>
      ${
        isSeq && !isLast
          ? `<span class="step-delay">ждать
              <span class="stepper">
                <button type="button" class="st-minus" data-i="${i}" tabindex="-1">−</button>
                <input type="text" inputmode="numeric" class="delay-in" data-i="${i}" value="${s.delay}" />
                <button type="button" class="st-plus" data-i="${i}" tabindex="-1">+</button>
              </span>
              сек</span>`
          : ''
      }
      <button class="step-btn up" data-i="${i}" title="Вверх">↑</button>
      <button class="step-btn down" data-i="${i}" title="Вниз">↓</button>
      <button class="step-btn del" data-i="${i}" title="Удалить">✕</button>`;
    wrap.appendChild(row);
  });
  const setDelay = (i, v) => {
    if (isNaN(v)) v = 0;
    profileDraftSteps[i].delay = Math.max(0, Math.min(300, v));
    renderSteps();
  };
  wrap.querySelectorAll('.delay-in').forEach((inp) => {
    inp.onchange = (e) => setDelay(+e.target.dataset.i, parseInt(e.target.value, 10));
  });
  wrap.querySelectorAll('.st-minus').forEach((b) => {
    b.onclick = (e) => {
      const i = +e.currentTarget.dataset.i;
      setDelay(i, profileDraftSteps[i].delay - 1);
    };
  });
  wrap.querySelectorAll('.st-plus').forEach((b) => {
    b.onclick = (e) => {
      const i = +e.currentTarget.dataset.i;
      setDelay(i, profileDraftSteps[i].delay + 1);
    };
  });
  wrap.querySelectorAll('.up').forEach((b) => {
    b.onclick = (e) => moveStep(+e.target.dataset.i, -1);
  });
  wrap.querySelectorAll('.down').forEach((b) => {
    b.onclick = (e) => moveStep(+e.target.dataset.i, 1);
  });
  wrap.querySelectorAll('.del').forEach((b) => {
    b.onclick = (e) => {
      profileDraftSteps.splice(+e.target.dataset.i, 1);
      renderSteps();
    };
  });
}

function moveStep(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= profileDraftSteps.length) return;
  const tmp = profileDraftSteps[i];
  profileDraftSteps[i] = profileDraftSteps[j];
  profileDraftSteps[j] = tmp;
  renderSteps();
}

async function saveProfile() {
  const name = $('#profileName').value.trim();
  if (!name) return toast('err', 'Укажите название профиля');
  if (!profileDraftSteps.length) return toast('err', 'Добавьте хотя бы один шаг');
  const data = {
    name,
    mode: profileDraftMode,
    steps: profileDraftSteps.map((s) => ({ appId: s.appId, delay: +s.delay || 0 })),
    icon: '🚀',
  };
  if (editingProfileId) {
    const p = config.profiles.find((x) => x.id === editingProfileId);
    Object.assign(p, data);
  } else {
    config.profiles.push({ id: uid(), ...data });
  }
  await save();
  $('#profileModal').classList.remove('open');
  renderAll();
  toast('ok', 'Профиль сохранён', name);
}

async function deleteProfile() {
  if (!editingProfileId) return;
  config.profiles = config.profiles.filter((p) => p.id !== editingProfileId);
  if (config.settings.autoRunProfileId === editingProfileId)
    config.settings.autoRunProfileId = null;
  await save();
  $('#profileModal').classList.remove('open');
  renderAll();
  toast('ok', 'Профиль удалён');
}

/* ============================ Launch helpers ============================ */
async function runApp(id, name) {
  const res = await api.launchApp(id);
  if (res.ok) toast('ok', 'Запущено', name);
  else toast('err', 'Не удалось запустить', res.error || name);
  refreshStats();
}

async function runProfile(id, name) {
  toast('ok', 'Запускаю профиль', name);
  const res = await api.launchProfile(id);
  reportResults(res);
  refreshStats();
}

function reportResults(res) {
  if (!res || !res.results) return;
  const failed = res.results.filter((r) => !r.ok);
  if (failed.length) {
    toast('err', 'Часть не запустилась', failed.map((f) => f.name).join(', '));
  }
}

async function refreshStats() {
  config = await api.getConfig();
  renderDashboard();
}

/* ============================ Settings ============================ */
function wireSettings() {
  $('#setAutostart').onchange = async (e) => {
    await api.setAutostart(e.target.checked);
    config.settings.autostart = e.target.checked;
    toast('ok', e.target.checked ? 'Автозапуск включён' : 'Автозапуск выключен');
  };
  const bind = (sel, key) => {
    $(sel).onchange = async (e) => {
      config.settings[key] = e.target.checked;
      await save();
    };
  };
  bind('#setStartMin', 'startMinimized');
  bind('#setMinTray', 'minimizeToTray');
  bind('#setCloseTray', 'closeToTray');
  bind('#setStartupChooser', 'startupChooser');
  $('#setAutoProfile').onchange = async (e) => {
    config.settings.autoRunProfileId = e.target.value || null;
    await save();
  };
}

function renderSettings() {
  const s = config.settings;
  $('#setAutostart').checked = !!s.autostart;
  $('#setStartMin').checked = !!s.startMinimized;
  $('#setMinTray').checked = s.minimizeToTray !== false;
  $('#setCloseTray').checked = s.closeToTray !== false;
  $('#setStartupChooser').checked = s.startupChooser !== false;

  const sel = $('#setAutoProfile');
  sel.innerHTML =
    '<option value="">Не запускать</option>' +
    config.profiles
      .map(
        (p) =>
          `<option value="${p.id}" ${
            s.autoRunProfileId === p.id ? 'selected' : ''
          }>${escapeHtml(p.name)}</option>`
      )
      .join('');

  renderThemes();
}

/* ============================ Themes ============================ */
function renderThemes() {
  const wrap = $('#themeGrid');
  if (!wrap) return;
  const cur = config.settings.theme || 'midnight';
  wrap.innerHTML = '';
  THEMES.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'theme-card' + (t.id === cur ? ' active' : '');
    el.innerHTML = `
      <div class="theme-prev" style="background:linear-gradient(135deg, ${t.bg}, ${t.bg2})">
        <div class="theme-bar"></div>
        <div class="theme-bar sm"></div>
        <div class="theme-dot" style="background:${t.accent}"></div>
        <div class="theme-dot" style="background:${t.accent2}"></div>
      </div>
      <div class="theme-label"><span>${t.name}</span><span class="theme-check">✓</span></div>`;
    el.onclick = async () => {
      config.settings.theme = t.id;
      applyTheme(t.id);
      renderThemes();
      await save();
    };
    wrap.appendChild(el);
  });
}

function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  const r = document.documentElement.style;
  r.setProperty('--accent', t.accent);
  r.setProperty('--accent-2', t.accent2);
  r.setProperty('--bg', t.bg);
  r.setProperty('--bg-2', t.bg2);
  r.setProperty('--text', t.text);
  r.setProperty('--muted', t.muted);
}

/* ============================ Utils ============================ */
function toast(type, title, sub) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.innerHTML = `<b>${escapeHtml(title)}</b>${
    sub ? `<span>${escapeHtml(sub)}</span>` : ''
  }`;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(120%)';
    el.style.transition = 'all .25s';
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

function shortPath(p) {
  if (!p) return '';
  if (/^[a-z]+:\/\//i.test(p)) return p.length > 30 ? p.slice(0, 30) + '…' : p;
  return p.split(/[\\/]/).pop();
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин назад';
  if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
  return Math.floor(s / 86400) + ' дн назад';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// close modals on backdrop click / Esc
document.querySelectorAll('.modal-backdrop').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('open');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-backdrop.open').forEach((m) =>
      m.classList.remove('open')
    );
});

boot();
