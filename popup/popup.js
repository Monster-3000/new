// Focus Timer - Popup Script

const CIRCUMFERENCE = 2 * Math.PI * 52; // matches SVG r="52"

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const timerDisplay = document.getElementById('timerDisplay');
const timerStatus = document.getElementById('timerStatus');
const ringProgress = document.getElementById('ringProgress');
const btnStartPause = document.getElementById('btnStartPause');
const btnStop = document.getElementById('btnStop');
const btnDashboard = document.getElementById('btnDashboard');
const btnSettings = document.getElementById('btnSettings');
const btnCustom = document.getElementById('btnCustom');
const btnSetCustom = document.getElementById('btnSetCustom');
const customDuration = document.getElementById('customDuration');
const customMinutes = document.getElementById('customMinutes');
const durationPresets = document.getElementById('durationPresets');
const statProductivity = document.getElementById('statProductivity');
const statSocial = document.getElementById('statSocial');
const statEntertainment = document.getElementById('statEntertainment');
const statSessions = document.getElementById('statSessions');
const statsDate = document.getElementById('statsDate');
const activeTabDomain = document.getElementById('activeTabDomain');
const activeTabCategory = document.getElementById('activeTabCategory');

// ─── State ────────────────────────────────────────────────────────────────────
let state = null;
let localElapsed = 0;
let tickInterval = null;
let selectedDuration = 25 * 60; // seconds

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatMinutes(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function updateRing(elapsed, duration) {
  if (duration <= 0) {
    ringProgress.style.strokeDashoffset = CIRCUMFERENCE;
    return;
  }
  const progress = Math.min(elapsed / duration, 1);
  const offset = CIRCUMFERENCE * (1 - progress);
  ringProgress.style.strokeDashoffset = offset;
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response || {});
      }
    });
  });
}

// ─── UI Update ────────────────────────────────────────────────────────────────
function updateUI(timerState) {
  if (!timerState) return;

  localElapsed = timerState.elapsedTime || 0;
  const duration = timerState.duration || selectedDuration;
  const remaining = Math.max(0, duration - localElapsed);

  timerDisplay.textContent = formatTime(remaining);
  updateRing(localElapsed, duration);

  if (timerState.isRunning) {
    btnStartPause.textContent = '⏸ Pause';
    timerStatus.textContent = 'Focusing';
    timerStatus.className = 'timer-status running';
    ringProgress.className = 'ring-progress running';
    btnStop.disabled = false;
    durationPresets.style.opacity = '0.4';
    durationPresets.style.pointerEvents = 'none';
  } else if (localElapsed > 0) {
    btnStartPause.textContent = '▶ Resume';
    timerStatus.textContent = 'Paused';
    timerStatus.className = 'timer-status paused';
    ringProgress.className = 'ring-progress paused';
    btnStop.disabled = false;
    durationPresets.style.opacity = '1';
    durationPresets.style.pointerEvents = 'auto';
  } else {
    btnStartPause.textContent = '▶ Start';
    timerStatus.textContent = 'Ready';
    timerStatus.className = 'timer-status';
    ringProgress.className = 'ring-progress';
    ringProgress.style.strokeDashoffset = CIRCUMFERENCE;
    btnStop.disabled = true;
    durationPresets.style.opacity = '1';
    durationPresets.style.pointerEvents = 'auto';
  }

  selectedDuration = duration;
}

function updateStats(usageData) {
  const key = todayKey();
  const today = (usageData || {})[key] || {};

  statProductivity.textContent = formatMinutes(today.productivity || 0);
  statSocial.textContent = formatMinutes(today.social || 0);
  statEntertainment.textContent = formatMinutes(today.entertainment || 0);
  statSessions.textContent = (today.sessions || []).length;

  const now = new Date();
  statsDate.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function updateActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      activeTabDomain.textContent = '—';
      activeTabCategory.textContent = '';
      activeTabCategory.className = 'active-tab-category';
      return;
    }
    const url = new URL(tab.url);
    const domain = url.hostname.replace(/^www\./, '');
    activeTabDomain.textContent = domain || '—';

    const { categories } = await chrome.storage.local.get({ categories: {} });
    let category = 'uncategorized';
    for (const [cat, domains] of Object.entries(categories)) {
      if (Array.isArray(domains) && domains.some(d => domain === d || domain.endsWith('.' + d))) {
        category = cat;
        break;
      }
    }
    activeTabCategory.textContent = category;
    activeTabCategory.className = `active-tab-category ${category}`;
  } catch {
    activeTabDomain.textContent = '—';
    activeTabCategory.textContent = '';
  }
}

// ─── Local Tick (UI only) ─────────────────────────────────────────────────────
function startLocalTick() {
  stopLocalTick();
  tickInterval = setInterval(() => {
    if (state && state.timerState && state.timerState.isRunning) {
      localElapsed++;
      const duration = state.timerState.duration || selectedDuration;
      const remaining = Math.max(0, duration - localElapsed);
      timerDisplay.textContent = formatTime(remaining);
      updateRing(localElapsed, duration);

      if (duration > 0 && localElapsed >= duration) {
        timerDisplay.textContent = '00:00';
        timerStatus.textContent = 'Complete! 🎉';
        stopLocalTick();
        btnStartPause.textContent = '▶ Start';
        btnStop.disabled = true;
      }
    }
  }, 1000);
}

function stopLocalTick() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

// ─── Load State ───────────────────────────────────────────────────────────────
async function loadState() {
  state = await sendMessage({ action: 'getState' });
  if (state && state.timerState) {
    updateUI(state.timerState);
    if (state.timerState.isRunning) {
      startLocalTick();
    }
  }
  if (state && state.usageData) {
    updateStats(state.usageData);
  }
  await updateActiveTab();
}

// ─── Event Handlers ───────────────────────────────────────────────────────────
btnStartPause.addEventListener('click', async () => {
  if (!state) return;
  const ts = state.timerState || {};

  if (ts.isRunning) {
    // Pause
    const res = await sendMessage({ action: 'pauseTimer' });
    if (res.timerState) {
      state.timerState = res.timerState;
      updateUI(res.timerState);
      stopLocalTick();
    }
  } else {
    // Start / Resume
    const res = await sendMessage({
      action: 'startTimer',
      duration: ts.elapsedTime > 0 ? ts.duration : selectedDuration
    });
    if (res.timerState) {
      state.timerState = res.timerState;
      updateUI(res.timerState);
      startLocalTick();
    }
  }
});

btnStop.addEventListener('click', async () => {
  stopLocalTick();
  const res = await sendMessage({ action: 'stopTimer' });
  if (res.timerState) {
    state.timerState = res.timerState;
    selectedDuration = state.timerState.duration || 25 * 60;
    updateUI(res.timerState);
  }
  // Reload stats after stopping
  const fresh = await sendMessage({ action: 'getState' });
  if (fresh.usageData) updateStats(fresh.usageData);
});

btnDashboard.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
});

btnSettings.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  window.close();
});

// Duration presets
document.querySelectorAll('.preset-btn:not(.custom)').forEach(btn => {
  btn.addEventListener('click', () => {
    if (state && state.timerState && state.timerState.isRunning) return;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const minutes = parseInt(btn.dataset.minutes, 10);
    selectedDuration = minutes * 60;
    if (state && state.timerState && state.timerState.elapsedTime === 0) {
      timerDisplay.textContent = formatTime(selectedDuration);
      ringProgress.style.strokeDashoffset = CIRCUMFERENCE;
      if (state.timerState) state.timerState.duration = selectedDuration;
    }
    customDuration.classList.add('hidden');
  });
});

btnCustom.addEventListener('click', () => {
  customDuration.classList.toggle('hidden');
  customMinutes.focus();
});

btnSetCustom.addEventListener('click', () => {
  const val = parseInt(customMinutes.value, 10);
  if (!val || val < 1 || val > 480) return;
  selectedDuration = val * 60;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btnCustom.classList.add('active');
  customDuration.classList.add('hidden');
  if (state && state.timerState && state.timerState.elapsedTime === 0) {
    timerDisplay.textContent = formatTime(selectedDuration);
    if (state.timerState) state.timerState.duration = selectedDuration;
  }
});

customMinutes.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSetCustom.click();
  if (e.key === 'Escape') customDuration.classList.add('hidden');
});

// ─── Initialize ───────────────────────────────────────────────────────────────
ringProgress.style.strokeDasharray = CIRCUMFERENCE;
ringProgress.style.strokeDashoffset = CIRCUMFERENCE;
loadState();
