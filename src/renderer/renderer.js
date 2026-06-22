'use strict';

const api = window.hailu;
const ACCENTS = [
  ['#7c3aed', '#06b6d4'],
  ['#ec4899', '#f97316'],
  ['#22c55e', '#14b8a6'],
  ['#3b82f6', '#6366f1'],
  ['#ef4444', '#f59e0b'],
  ['#a855f7', '#ec4899'],
];

let config = null;
let editingAppId = null;
let editingProfileId = null;
let profileDraftSteps = [];
let profileDraftMode = 'sequential';
let appDraftIcon = null; // dataURL or null
let appDraftColor = '#7c3aed';
const selected = new Set();

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 10);

/* ============================ Boot ============================ */
async function boot() {
  config = await api.getConfig();
  api.version().then((v) => ($('#versionBadge').textContent = 'v' + v));
  applyAccent(config.settings.accent || '#7c3aed');
  wireChrome();
  wireNav();
  wireApps();
  wireProfiles();
  wireSettings();
  renderAll();
  setGreeting();
  api.onProfileLaunched(() => {});
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
    }
  };
  $('#pickImageBtn').onclick = async () => {
    const img = await api.pickImage();
    if (img) {
      appDraftIcon = img;
      updateIconPreview();
    }
  };
  $('#clearImageBtn').onclick = () => {
    appDraftIcon = null;
    updateIconPreview();
  };
  $('#appEmoji').oninput = () => {
    appDraftIcon = null;
    updateIconPreview();
  };
}

function appCard(a, allowSelect) {
  const el = document.createElement('div');
  el.className = 'app-card';
  el.style.setProperty('--card-color', a.color || '#7c3aed');
  if (selected.has(a.id)) el.classList.add('selected');
  const icoInner = a.icon
    ? `<img src="${a.icon}" />`
    : a.emoji || a.name.slice(0, 1).toUpperCase();
  el.innerHTML = `
    <div class="card-check">${selected.has(a.id) ? '✓' : ''}</div>
    <button class="card-edit" title="Изменить">✎</button>
    <div class="card-ico">${icoInner}</div>
    <div class="card-name">${escapeHtml(a.name)}</div>
    <div class="card-sub">${escapeHtml(shortPath(a.path))}</div>
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
function openAppModal(id) {
  editingAppId = id;
  renderColorRow($('#appColorRow'), (c) => {
    appDraftColor = c;
  });
  if (id) {
    const a = config.apps.find((x) => x.id === id);
    $('#appModalTitle').textContent = 'Изменить приложение';
    $('#appName').value = a.name;
    $('#appPath').value = a.path || '';
    $('#appArgs').value = a.args || '';
    $('#appEmoji').value = a.emoji || '';
    $('#appFav').checked = !!a.fav;
    appDraftIcon = a.icon || null;
    appDraftColor = a.color || '#7c3aed';
    $('#deleteAppBtn').style.display = 'inline-block';
  } else {
    $('#appModalTitle').textContent = 'Новое приложение';
    $('#appName').value = '';
    $('#appPath').value = '';
    $('#appArgs').value = '';
    $('#appEmoji').value = '';
    $('#appFav').checked = false;
    appDraftIcon = null;
    appDraftColor = '#7c3aed';
    $('#deleteAppBtn').style.display = 'none';
  }
  setActiveSwatch($('#appColorRow'), appDraftColor);
  updateIconPreview();
  $('#appModal').classList.add('open');
  $('#appName').focus();
}

function updateIconPreview() {
  const prev = $('#iconPreview');
  prev.style.background = appDraftColor;
  if (appDraftIcon) prev.innerHTML = `<img src="${appDraftIcon}" />`;
  else prev.textContent = $('#appEmoji').value || '🎮';
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
    emoji: $('#appEmoji').value.trim(),
    icon: appDraftIcon,
    color: appDraftColor,
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
          ? `<span class="step-delay">ждать <input type="number" min="0" max="300" value="${s.delay}" data-i="${i}" class="delay-in"/> сек</span>`
          : ''
      }
      <button class="step-btn up" data-i="${i}" title="Вверх">↑</button>
      <button class="step-btn down" data-i="${i}" title="Вниз">↓</button>
      <button class="step-btn del" data-i="${i}" title="Удалить">✕</button>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.delay-in').forEach((inp) => {
    inp.onchange = (e) =>
      (profileDraftSteps[+e.target.dataset.i].delay = +e.target.value);
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

  renderColorRow($('#accentRow'), async (c) => {
    applyAccent(c);
    config.settings.accent = c;
    await save();
  });
  setActiveSwatch($('#accentRow'), s.accent || '#7c3aed');
}

/* ============================ Accent / colors ============================ */
function renderColorRow(container, onPick) {
  container.innerHTML = '';
  ACCENTS.forEach(([c1, c2]) => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = `linear-gradient(120deg, ${c1}, ${c2})`;
    sw.dataset.color = c1;
    sw.onclick = () => {
      setActiveSwatch(container, c1);
      onPick(c1);
    };
    container.appendChild(sw);
  });
}

function setActiveSwatch(container, color) {
  container.querySelectorAll('.swatch').forEach((s) =>
    s.classList.toggle('active', s.dataset.color === color)
  );
}

function applyAccent(color) {
  const pair = ACCENTS.find((p) => p[0] === color) || ['#7c3aed', '#06b6d4'];
  document.documentElement.style.setProperty('--accent', pair[0]);
  document.documentElement.style.setProperty('--accent-2', pair[1]);
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
