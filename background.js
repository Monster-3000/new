// Focus Timer - Background Service Worker
// Handles tab tracking, timer management, and data persistence

// ─── Default Categories ──────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = {
  productivity: [
    'github.com', 'gitlab.com', 'bitbucket.org',
    'stackoverflow.com', 'stackexchange.com',
    'vscode.dev', 'codesandbox.io', 'codepen.io', 'replit.com',
    'notion.so', 'trello.com', 'asana.com', 'jira.atlassian.com',
    'figma.com', 'docs.google.com', 'drive.google.com',
    'mail.google.com', 'outlook.com', 'linear.app',
    'developer.mozilla.org', 'w3schools.com', 'medium.com',
    'dev.to', 'hashnode.com', 'npmjs.com', 'pypi.org'
  ],
  social: [
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
    'linkedin.com', 'reddit.com', 'discord.com', 'slack.com',
    'tiktok.com', 'pinterest.com', 'snapchat.com', 'whatsapp.com',
    'telegram.org', 'web.telegram.org', 'tumblr.com', 'mastodon.social'
  ],
  entertainment: [
    'youtube.com', 'netflix.com', 'twitch.tv', 'hulu.com',
    'disneyplus.com', 'primevideo.com', 'spotify.com',
    'soundcloud.com', 'crunchyroll.com', 'funimation.com',
    'hbomax.com', 'peacocktv.com', 'games.google.com',
    'store.steampowered.com', 'itch.io', 'chess.com'
  ]
};

// ─── Helper: Get Today's Date Key ────────────────────────────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ─── Helper: Extract Domain from URL ─────────────────────────────────────────
function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === 'chrome:' || u.protocol === 'chrome-extension:' ||
        u.protocol === 'about:' || u.protocol === 'moz-extension:') {
      return null;
    }
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ─── Helper: Determine Category for a Domain ─────────────────────────────────
async function getCategoryForDomain(domain) {
  if (!domain) return 'uncategorized';
  const { categories } = await chrome.storage.local.get({ categories: DEFAULT_CATEGORIES });
  for (const [cat, domains] of Object.entries(categories)) {
    if (domains.some(d => domain === d || domain.endsWith('.' + d))) {
      return cat;
    }
  }
  return 'uncategorized';
}

// ─── Initialize Storage ───────────────────────────────────────────────────────
async function initStorage() {
  const defaults = {
    timerState: {
      isRunning: false,
      startTime: null,
      elapsedTime: 0,
      duration: 25 * 60,
      sessionId: null
    },
    categories: DEFAULT_CATEGORIES,
    usageData: {},
    settings: {
      defaultDuration: 25,
      notificationsEnabled: true,
      soundEnabled: true
    }
  };

  const existing = await chrome.storage.local.get(null);
  const toSet = {};
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in existing)) toSet[k] = v;
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
}

// ─── Tab Tracking State ───────────────────────────────────────────────────────
let lastActiveTab = null;
let lastActiveTime = null;

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch {
    return null;
  }
}

// ─── Record Time Spent on a Domain ───────────────────────────────────────────
async function recordTimeSpent(domain, seconds) {
  if (!domain || seconds <= 0) return;

  const category = await getCategoryForDomain(domain);
  const dateKey = todayKey();

  const { usageData } = await chrome.storage.local.get({ usageData: {} });
  if (!usageData[dateKey]) {
    usageData[dateKey] = {
      productivity: 0,
      social: 0,
      entertainment: 0,
      uncategorized: 0,
      sites: {},
      sessions: []
    };
  }

  const day = usageData[dateKey];
  day[category] = (day[category] || 0) + seconds;
  day.sites[domain] = (day.sites[domain] || 0) + seconds;

  await chrome.storage.local.set({ usageData });
}

// ─── Tick: Called Every Minute During Active Timer ────────────────────────────
async function tick() {
  const { timerState } = await chrome.storage.local.get({ timerState: {} });
  if (!timerState.isRunning) return;

  // Compute elapsed time from startTime (source of truth)
  const now = Date.now();
  timerState.elapsedTime = Math.floor((now - timerState.startTime) / 1000);

  // Compute seconds since last tick for accurate per-domain recording
  const lastTick = timerState.lastTickTime || timerState.startTime;
  const deltaSecs = Math.floor((now - lastTick) / 1000);
  timerState.lastTickTime = now;

  // Track active tab
  const tab = await getActiveTab();
  if (tab && tab.url) {
    const domain = extractDomain(tab.url);
    if (domain) {
      // Record time delta for the current domain
      await recordTimeSpent(domain, deltaSecs > 0 ? deltaSecs : 60);

      // Update current session snapshot in timerState
      if (!timerState.currentTabs) timerState.currentTabs = {};
      timerState.currentTabs[domain] = (timerState.currentTabs[domain] || 0) + (deltaSecs > 0 ? deltaSecs : 60);
    }
  }

  // Check if timer has completed
  if (timerState.duration > 0 && timerState.elapsedTime >= timerState.duration) {
    await completeTimer(timerState);
    return;
  }

  await chrome.storage.local.set({ timerState });
}

// ─── Start Tracking Interval ──────────────────────────────────────────────────
function startTrackingInterval() {
  // Chrome MV3 minimum alarm period is 1 minute.
  // Real-time UI updates are handled by the popup's own setInterval.
  chrome.alarms.create('focusTimerTick', { periodInMinutes: 1 });
}

function stopTrackingInterval() {
  chrome.alarms.clear('focusTimerTick');
}

// ─── Complete Timer ───────────────────────────────────────────────────────────
async function completeTimer(timerState) {
  timerState.isRunning = false;
  timerState.elapsedTime = timerState.duration;

  // Save session to history
  await saveSession(timerState);

  await chrome.storage.local.set({ timerState });
  stopTrackingInterval();

  const { settings } = await chrome.storage.local.get({ settings: {} });
  if (settings.notificationsEnabled !== false) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Focus Timer Complete! 🎉',
      message: `Great job! You completed a ${Math.floor(timerState.duration / 60)}-minute focus session.`
    });
  }
}

// ─── Save Session to Usage Data ───────────────────────────────────────────────
async function saveSession(timerState) {
  const dateKey = todayKey();
  const { usageData } = await chrome.storage.local.get({ usageData: {} });

  if (!usageData[dateKey]) {
    usageData[dateKey] = {
      productivity: 0, social: 0, entertainment: 0, uncategorized: 0,
      sites: {}, sessions: []
    };
  }

  const session = {
    sessionId: timerState.sessionId,
    startTime: timerState.startTime,
    endTime: Date.now(),
    duration: timerState.elapsedTime,
    tabs: timerState.currentTabs || {}
  };

  usageData[dateKey].sessions.push(session);
  await chrome.storage.local.set({ usageData });
}

// ─── Message Handlers ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // Keep message channel open for async response
});

async function handleMessage(message) {
  switch (message.action) {
    case 'startTimer': {
      const { timerState } = await chrome.storage.local.get({ timerState: {} });
      timerState.isRunning = true;
      timerState.startTime = Date.now() - (timerState.elapsedTime * 1000);
      timerState.duration = message.duration || timerState.duration || 25 * 60;
      timerState.sessionId = timerState.sessionId || Date.now().toString();
      timerState.lastTickTime = Date.now();
      if (!timerState.currentTabs) timerState.currentTabs = {};
      await chrome.storage.local.set({ timerState });
      startTrackingInterval();
      return { success: true, timerState };
    }

    case 'pauseTimer': {
      const { timerState } = await chrome.storage.local.get({ timerState: {} });
      timerState.isRunning = false;
      timerState.elapsedTime = Math.floor((Date.now() - timerState.startTime) / 1000);
      await chrome.storage.local.set({ timerState });
      stopTrackingInterval();
      return { success: true, timerState };
    }

    case 'stopTimer': {
      const { timerState } = await chrome.storage.local.get({ timerState: {} });
      if (timerState.elapsedTime > 0) {
        await saveSession(timerState);
      }
      timerState.isRunning = false;
      timerState.elapsedTime = 0;
      timerState.startTime = null;
      timerState.sessionId = null;
      timerState.currentTabs = {};
      await chrome.storage.local.set({ timerState });
      stopTrackingInterval();
      return { success: true, timerState };
    }

    case 'getState': {
      const state = await chrome.storage.local.get(null);
      if (state.timerState && state.timerState.isRunning) {
        state.timerState.elapsedTime = Math.floor(
          (Date.now() - state.timerState.startTime) / 1000
        );
      }
      return state;
    }

    case 'updateCategories': {
      await chrome.storage.local.set({ categories: message.categories });
      return { success: true };
    }

    case 'updateSettings': {
      await chrome.storage.local.set({ settings: message.settings });
      return { success: true };
    }

    case 'clearData': {
      await chrome.storage.local.set({ usageData: {} });
      return { success: true };
    }

    case 'captureCurrentTabs': {
      const tabs = await chrome.tabs.query({});
      const result = [];
      for (const tab of tabs) {
        const domain = extractDomain(tab.url);
        if (domain) {
          const category = await getCategoryForDomain(domain);
          result.push({ domain, title: tab.title, url: tab.url, category });
        }
      }
      return { tabs: result };
    }

    default:
      return { error: 'Unknown action' };
  }
}

// ─── Alarm Handler ────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'focusTimerTick') {
    tick();
  }
});

// ─── Extension Install / Startup ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(initStorage);
chrome.runtime.onStartup.addListener(async () => {
  await initStorage();
  // Resume tracking if timer was running (unlikely with MV3 but handle gracefully)
  const { timerState } = await chrome.storage.local.get({ timerState: {} });
  if (timerState.isRunning) {
    startTrackingInterval();
  }
});
