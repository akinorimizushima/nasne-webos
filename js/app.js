/**
 * nasne webOS TV App — Main Application
 */

// ─── State ───────────────────────────────────────────────
const state = {
  nasne: null,
  currentScreen: 'channels',
  currentBroadcastType: 2, // 地デジ
  channels: [],
  selectedChannel: null,
  reservations: [],
  quality: 100, // DR
  pendingDeleteId: null,
  pendingDeleteType: null,
};

// ─── Initialization ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initBroadcastTabs();
  initSettings();
  initReservations();
  initKeyboard();
  loadSavedSettings();
  console.log('[nasne] App initialized');
});

// ─── Tab Navigation ──────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
  });
}

function switchScreen(screenName) {
  state.currentScreen = screenName;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screenName}`).classList.add('active');

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-screen="${screenName}"]`).classList.add('active');

  if (screenName === 'reservations' && state.nasne) {
    loadReservations();
  }

  // Set focus on new screen
  requestAnimationFrame(() => setInitialFocus());
}

// ─── Broadcasting Type Tabs ──────────────────────────────
function initBroadcastTabs() {
  document.querySelectorAll('.broadcast-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = parseInt(btn.dataset.type, 10);
      state.currentBroadcastType = type;

      document.querySelectorAll('.broadcast-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (state.nasne) {
        loadChannels();
      }
    });
  });
}

// ─── Settings ────────────────────────────────────────────
function initSettings() {
  document.getElementById('btn-connect').addEventListener('click', connectToNasne);
  document.getElementById('nasne-ip').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectToNasne();
  });

  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.quality = parseInt(btn.dataset.quality, 10);
      document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem('nasne_quality', state.quality);
    });
  });
}

function loadSavedSettings() {
  const savedIp = localStorage.getItem('nasne_ip');
  const savedQuality = localStorage.getItem('nasne_quality');

  if (savedIp) {
    document.getElementById('nasne-ip').value = savedIp;
    // Auto-connect on load
    connectToNasne();
  } else {
    // No saved IP — show settings screen
    switchScreen('settings');
  }

  if (savedQuality) {
    state.quality = parseInt(savedQuality, 10);
    document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.quality-btn[data-quality="${state.quality}"]`);
    if (activeBtn) activeBtn.classList.add('active');
  }
}

async function connectToNasne() {
  const ip = document.getElementById('nasne-ip').value.trim();
  if (!ip) {
    showConnectionStatus('IP アドレスを入力してください', 'error');
    return;
  }

  showConnectionStatus('接続中...', '');
  state.nasne = new NasneClient(ip);

  const connected = await state.nasne.testConnection();
  if (connected) {
    localStorage.setItem('nasne_ip', ip);
    showConnectionStatus('接続しました ✓', 'connected');
    showToast('nasne に接続しました', 'success');
    switchScreen('channels');
    loadChannels();
  } else {
    state.nasne = null;
    showConnectionStatus('接続に失敗しました。IP アドレスを確認してください。', 'error');
    showToast('接続に失敗しました', 'error');
  }
}

function showConnectionStatus(text, className) {
  const el = document.getElementById('connection-status');
  el.textContent = text;
  el.className = 'connection-status';
  if (className) el.classList.add(className);
}

// ─── Channels ────────────────────────────────────────────
async function loadChannels() {
  if (!state.nasne) return;

  const listEl = document.getElementById('channel-list');
  listEl.innerHTML = '<div class="loading-message">読み込み中...</div>';

  try {
    const result = await state.nasne.getChannelList(state.currentBroadcastType);
    state.channels = result.channel || [];

    if (state.channels.length === 0) {
      listEl.innerHTML = '<div class="loading-message">チャンネルが見つかりません</div>';
      return;
    }

    listEl.innerHTML = '';
    state.channels.forEach((ch, index) => {
      const item = document.createElement('div');
      item.className = 'channel-item focusable';
      item.tabIndex = 0;
      item.innerHTML = `
        <span class="channel-number">${ch.remoteControlKeyId || ch.serviceId || (index + 1)}</span>
        <span class="channel-name">${ch.title || ch.serviceName || 'Unknown'}</span>
      `;
      item.addEventListener('click', () => selectChannel(ch, item));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') selectChannel(ch, item);
      });
      listEl.appendChild(item);
    });

    // Auto-select first channel
    if (state.channels.length > 0) {
      const firstItem = listEl.querySelector('.channel-item');
      selectChannel(state.channels[0], firstItem);
    }
  } catch (err) {
    console.error('[nasne] Failed to load channels:', err);
    listEl.innerHTML = '<div class="loading-message">チャンネルの取得に失敗しました</div>';
  }
}

async function selectChannel(channel, element) {
  state.selectedChannel = channel;

  document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('selected'));
  if (element) element.classList.add('selected');

  const detailEl = document.getElementById('program-detail');
  detailEl.innerHTML = '<div class="loading-message">番組情報を取得中...</div>';

  try {
    const result = await state.nasne.getChannelInfo2({
      serviceId: channel.serviceId,
      transportStreamId: channel.transportStreamId,
      networkId: channel.networkId,
    });

    // Debug: log the raw response to help identify the structure
    console.log('[nasne] channelInfoGet2 response:', JSON.stringify(result, null, 2));

    // Try multiple possible response formats
    const program = extractProgram(result);

    if (program) {
      renderProgramDetail(program, channel);
    } else {
      detailEl.innerHTML = `
        <div class="program-title">${escapeHtml(channel.title || channel.serviceName || 'チャンネル')}</div>
        <p class="program-description">番組情報を取得できませんでした。</p>
        <pre class="debug-response">${escapeHtml(JSON.stringify(result, null, 2))}</pre>
        <div class="program-actions">
          <button class="btn btn-record focusable" tabindex="0"
                  onclick="recordManual()">手動予約</button>
        </div>
      `;
    }
  } catch (err) {
    console.error('[nasne] Failed to get channel info:', err);
    detailEl.innerHTML = `
      <div class="program-title">${escapeHtml(channel.title || channel.serviceName || 'チャンネル')}</div>
      <p class="program-description">番組情報の取得に失敗しました: ${escapeHtml(err.message)}</p>
    `;
  }
}

/**
 * Extract a program object from the channelInfoGet2 response.
 * Tries multiple known and guessed response formats.
 */
function extractProgram(result) {
  if (!result) return null;

  // Direct program fields
  const directPaths = [
    result.currentProgram,
    result.program,
    result.epgInfo,
    result.epg,
  ];
  for (const p of directPaths) {
    if (p && typeof p === 'object' && !Array.isArray(p) && (p.title || p.eventId)) {
      return p;
    }
  }

  // Array of programs — take the first one (current)
  const arrayPaths = [
    result.programs,
    result.programList,
    result.epgInfoList,
    result.item,
  ];
  for (const arr of arrayPaths) {
    if (Array.isArray(arr) && arr.length > 0) {
      return arr[0];
    }
  }

  // Nested under 'channel' key
  if (result.channel) {
    const ch = result.channel;
    const nestedPaths = [
      ch.currentProgram,
      ch.program,
      ch.programs,
      ch.epgInfo,
    ];
    for (const p of nestedPaths) {
      if (Array.isArray(p) && p.length > 0) return p[0];
      if (p && typeof p === 'object' && (p.title || p.eventId)) return p;
    }
  }

  // If the result itself looks like a program (has title)
  if (result.title && (result.startDateTime || result.duration || result.eventId)) {
    return result;
  }

  // Walk all top-level keys looking for any object/array that has 'title'
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (Array.isArray(val) && val.length > 0 && val[0].title) {
      return val[0];
    }
    if (val && typeof val === 'object' && !Array.isArray(val) && val.title && val.startDateTime) {
      return val;
    }
  }

  return null;
}

function renderProgramDetail(program, channel) {
  const detailEl = document.getElementById('program-detail');
  const startTime = program.startDateTime ? formatDateTime(program.startDateTime) : '';
  const endTime = program.endDateTime ? formatTime(program.endDateTime) : '';
  const duration = program.duration ? formatDuration(program.duration) : '';

  detailEl.innerHTML = `
    <div class="program-title">${escapeHtml(program.title || '番組名不明')}</div>
    <div class="program-meta">
      ${startTime ? `<span class="program-meta-item">📅 ${startTime}${endTime ? ' 〜 ' + endTime : ''}</span>` : ''}
      ${duration ? `<span class="program-meta-item">⏱ ${duration}</span>` : ''}
      <span class="program-meta-item">📺 ${escapeHtml(channel.title || channel.serviceName || '')}</span>
    </div>
    <div class="program-description">${escapeHtml(program.description || program.descriptionLong || '番組の詳細情報はありません。')}</div>
    <div class="program-actions">
      <button class="btn btn-record focusable" tabindex="0" id="btn-record-program">録画予約</button>
    </div>
  `;

  document.getElementById('btn-record-program').addEventListener('click', () => {
    recordProgram(program, channel);
  });
}

async function recordProgram(program, channel) {
  if (!state.nasne) return;

  try {
    const params = {
      title: program.title || '',
      startDateTime: program.startDateTime,
      duration: program.duration,
      serviceId: channel.serviceId,
      broadcastingType: state.currentBroadcastType,
      quality: state.quality,
    };

    if (program.eventId) {
      params.eventId = program.eventId;
    }

    await state.nasne.createReservation(params);
    showToast(`「${program.title}」の録画を予約しました`, 'success');
  } catch (err) {
    console.error('[nasne] Failed to create reservation:', err);
    showToast('録画予約に失敗しました', 'error');
  }
}

function recordManual() {
  if (!state.nasne || !state.selectedChannel) return;

  const channel = state.selectedChannel;
  const now = new Date();
  const startDateTime = now.toISOString();
  const duration = 3600; // 1 hour default

  recordProgram({
    title: channel.title || channel.serviceName || 'Manual Recording',
    startDateTime,
    duration,
  }, channel);
}

// ─── Reservations ────────────────────────────────────────
function initReservations() {
  document.getElementById('btn-refresh-reservations').addEventListener('click', loadReservations);
}

async function loadReservations() {
  if (!state.nasne) {
    document.getElementById('reservation-list').innerHTML =
      '<div class="loading-message">nasne に接続してください</div>';
    return;
  }

  const listEl = document.getElementById('reservation-list');
  listEl.innerHTML = '<div class="loading-message">読み込み中...</div>';

  try {
    const result = await state.nasne.getReservedList();
    state.reservations = result.item || result.reservedList || [];

    if (state.reservations.length === 0) {
      listEl.innerHTML = '<div class="loading-message">録画予約はありません</div>';
      return;
    }

    listEl.innerHTML = '';
    state.reservations.forEach(res => {
      const item = document.createElement('div');
      item.className = 'reservation-item focusable';
      item.tabIndex = 0;

      const startTime = res.startDateTime ? formatDateTime(res.startDateTime) : '不明';
      const duration = res.duration ? formatDuration(res.duration) : '';

      item.innerHTML = `
        <div class="reservation-info">
          <div class="reservation-title">${escapeHtml(res.title || '無題')}</div>
          <div class="reservation-time">${startTime}${duration ? ' / ' + duration : ''}</div>
          ${res.channelName ? `<div class="reservation-channel">${escapeHtml(res.channelName)}</div>` : ''}
        </div>
        <button class="btn btn-danger focusable" tabindex="0">削除</button>
      `;

      const deleteBtn = item.querySelector('.btn-danger');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteReservation(res);
      });

      listEl.appendChild(item);
    });
  } catch (err) {
    console.error('[nasne] Failed to load reservations:', err);
    listEl.innerHTML = '<div class="loading-message">予約一覧の取得に失敗しました</div>';
  }
}

function confirmDeleteReservation(reservation) {
  state.pendingDeleteId = reservation.id;
  state.pendingDeleteType = reservation.type || 0;

  document.getElementById('dialog-message').textContent =
    `「${reservation.title || '無題'}」の録画予約を削除しますか？`;

  const overlay = document.getElementById('dialog-overlay');
  overlay.classList.remove('hidden');

  const confirmBtn = document.getElementById('dialog-confirm');
  const cancelBtn = document.getElementById('dialog-cancel');

  const cleanup = () => {
    overlay.classList.add('hidden');
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
  };

  const onConfirm = async () => {
    cleanup();
    await deleteReservation(state.pendingDeleteId, state.pendingDeleteType);
  };

  const onCancel = () => {
    cleanup();
  };

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);

  // Focus on cancel button by default (safer)
  cancelBtn.focus();
}

async function deleteReservation(id, type) {
  if (!state.nasne) return;

  try {
    await state.nasne.deleteReservation(id, type);
    showToast('録画予約を削除しました', 'success');
    loadReservations();
  } catch (err) {
    console.error('[nasne] Failed to delete reservation:', err);
    showToast('削除に失敗しました', 'error');
  }
}

// ─── Keyboard / Remote (Spatial Navigation) ─────────────
const KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  BACK: 461,
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
};

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Don't handle navigation when typing in an input
    if (e.target.tagName === 'INPUT' && ![KEY.ENTER, KEY.BACK].includes(e.keyCode)) {
      return;
    }

    switch (e.keyCode) {
      case KEY.UP:
      case KEY.DOWN:
      case KEY.LEFT:
      case KEY.RIGHT:
        handleDpad(e.keyCode);
        e.preventDefault();
        break;
      case KEY.ENTER:
        handleEnter();
        e.preventDefault();
        break;
      case KEY.BACK:
        onBackPressed();
        e.preventDefault();
        break;
      case KEY.RED:
        handleRedButton();
        e.preventDefault();
        break;
      default:
        break;
    }
  });

  // Set initial focus
  requestAnimationFrame(() => {
    setInitialFocus();
  });
}

/**
 * Set initial focus on the first focusable element in the active screen.
 */
function setInitialFocus() {
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) {
    const first = activeScreen.querySelector('.focusable');
    if (first) first.focus();
  }
}

/**
 * Get all currently visible and focusable elements.
 */
function getVisibleFocusables() {
  const all = document.querySelectorAll('.focusable');
  const visible = [];
  all.forEach(el => {
    // Check if element and its parents are visible
    if (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        visible.push(el);
      }
    }
  });
  return visible;
}

/**
 * Get the center point of an element.
 */
function getCenter(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Handle D-pad navigation — moves focus to the nearest element in the given direction.
 */
function handleDpad(keyCode) {
  const current = document.activeElement;
  if (!current || !current.classList.contains('focusable')) {
    // No focused element — focus the first visible one
    setInitialFocus();
    return;
  }

  const focusables = getVisibleFocusables();
  if (focusables.length === 0) return;

  const currentCenter = getCenter(current);
  let bestCandidate = null;
  let bestScore = Infinity;

  focusables.forEach(el => {
    if (el === current) return;

    const elCenter = getCenter(el);
    const dx = elCenter.x - currentCenter.x;
    const dy = elCenter.y - currentCenter.y;

    let isValidDirection = false;
    let primaryDist = 0;
    let secondaryDist = 0;

    switch (keyCode) {
      case KEY.UP:
        isValidDirection = dy < -5;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
        break;
      case KEY.DOWN:
        isValidDirection = dy > 5;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
        break;
      case KEY.LEFT:
        isValidDirection = dx < -5;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
        break;
      case KEY.RIGHT:
        isValidDirection = dx > 5;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
        break;
    }

    if (!isValidDirection) return;

    // Score: prefer elements that are closely aligned in the perpendicular axis
    // and closer in the primary axis
    const score = primaryDist + secondaryDist * 3;

    if (score < bestScore) {
      bestScore = score;
      bestCandidate = el;
    }
  });

  if (bestCandidate) {
    bestCandidate.focus();
    // Scroll into view if needed (for lists)
    bestCandidate.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/**
 * Handle Enter/OK — click the currently focused element.
 */
function handleEnter() {
  const current = document.activeElement;
  if (current && current.classList.contains('focusable')) {
    current.click();
  }
}

function onBackPressed() {
  // If dialog is open, close it
  const dialog = document.getElementById('dialog-overlay');
  if (!dialog.classList.contains('hidden')) {
    dialog.classList.add('hidden');
    return;
  }

  // If not on channels screen, go back to channels
  if (state.currentScreen !== 'channels') {
    switchScreen('channels');
    setInitialFocus();
    return;
  }

  // Exit app
  if (typeof webOS !== 'undefined' && webOS.platformBack) {
    webOS.platformBack();
  }
}

function handleRedButton() {
  // Quick record if a channel is selected
  if (state.currentScreen === 'channels' && state.selectedChannel) {
    const recordBtn = document.getElementById('btn-record-program');
    if (recordBtn) recordBtn.click();
  }
}

// ─── Toast ───────────────────────────────────────────────
function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast';
  if (type) toast.classList.add(type);

  // Force reflow for animation
  void toast.offsetWidth;

  clearTimeout(state._toastTimer);
  state._toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// ─── Helpers ─────────────────────────────────────────────
function formatDateTime(dateStr) {
  try {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr) {
  try {
    const d = new Date(dateStr);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '';
  }
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}時間${m > 0 ? m + '分' : ''}`;
  return `${m}分`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
