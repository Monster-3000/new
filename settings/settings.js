// Focus Timer – Settings Script

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response || {});
    });
  });
}

// ─── State ────────────────────────────────────────────────────────────────────

let categories = {};
let settings = {};

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

// ─── Load ─────────────────────────────────────────────────────────────────────

async function load() {
  const state = await sendMessage({ action: 'getState' });
  categories = state.categories || { ...DEFAULT_CATEGORIES };
  settings = state.settings || { defaultDuration: 25, notificationsEnabled: true, soundEnabled: true };

  // Populate settings fields
  document.getElementById('defaultDuration').value = settings.defaultDuration || 25;
  document.getElementById('notificationsEnabled').checked = settings.notificationsEnabled !== false;
  document.getElementById('soundEnabled').checked = settings.soundEnabled !== false;

  renderCategories();
}

// ─── Render Categories ────────────────────────────────────────────────────────

function renderCategories() {
  for (const cat of ['productivity', 'social', 'entertainment']) {
    const container = document.getElementById(`sites${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    const countEl = document.getElementById(`count${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    const domains = categories[cat] || [];

    countEl.textContent = domains.length;

    container.innerHTML = domains.map(domain => `
      <div class="site-tag" data-domain="${domain}" data-cat="${cat}">
        <span class="site-tag-domain" title="${domain}">${domain}</span>
        <button class="site-remove-btn" data-domain="${domain}" data-cat="${cat}" title="Remove">×</button>
      </div>
    `).join('');

    // Bind remove buttons
    container.querySelectorAll('.site-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        removeSite(btn.dataset.cat, btn.dataset.domain);
      });
    });
  }
}

// ─── Add / Remove Sites ───────────────────────────────────────────────────────

function addSite(cat, domain) {
  if (!domain) return;
  // Normalize: remove protocol and www
  domain = domain.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  if (!domain) return;

  // Remove from any existing category
  for (const c of Object.keys(categories)) {
    categories[c] = (categories[c] || []).filter(d => d !== domain);
  }

  if (!categories[cat]) categories[cat] = [];
  if (!categories[cat].includes(domain)) {
    categories[cat].push(domain);
  }
  renderCategories();
}

function removeSite(cat, domain) {
  categories[cat] = (categories[cat] || []).filter(d => d !== domain);
  renderCategories();
}

// ─── Add Site Buttons ─────────────────────────────────────────────────────────

document.querySelectorAll('.add-site-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.cat;
    const input = document.getElementById(`add${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    addSite(cat, input.value);
    input.value = '';
  });
});

document.querySelectorAll('.add-site-input').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cat = input.id.replace('add', '').toLowerCase();
      addSite(cat, input.value);
      input.value = '';
    }
  });
});

// ─── Save ─────────────────────────────────────────────────────────────────────

document.getElementById('btnSave').addEventListener('click', async () => {
  settings.defaultDuration = parseInt(document.getElementById('defaultDuration').value, 10) || 25;
  settings.notificationsEnabled = document.getElementById('notificationsEnabled').checked;
  settings.soundEnabled = document.getElementById('soundEnabled').checked;

  await sendMessage({ action: 'updateCategories', categories });
  await sendMessage({ action: 'updateSettings', settings });

  const status = document.getElementById('saveStatus');
  status.textContent = '✓ Settings saved!';
  status.classList.add('visible');
  setTimeout(() => status.classList.remove('visible'), 2500);
});

// ─── Danger Actions ───────────────────────────────────────────────────────────

let pendingConfirm = null;

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  pendingConfirm = onConfirm;
  document.getElementById('confirmModal').classList.remove('hidden');
}

document.getElementById('confirmCancel').addEventListener('click', () => {
  document.getElementById('confirmModal').classList.add('hidden');
  pendingConfirm = null;
});

document.getElementById('confirmOk').addEventListener('click', async () => {
  document.getElementById('confirmModal').classList.add('hidden');
  if (pendingConfirm) {
    await pendingConfirm();
    pendingConfirm = null;
  }
});

document.getElementById('btnClearData').addEventListener('click', () => {
  showConfirm(
    'Clear All Data',
    'This will permanently delete all tracked usage history, sessions, and statistics. This action cannot be undone.',
    async () => {
      await sendMessage({ action: 'clearData' });
      const status = document.getElementById('saveStatus');
      status.textContent = '✓ All data cleared.';
      status.classList.add('visible');
      setTimeout(() => status.classList.remove('visible'), 2500);
    }
  );
});

document.getElementById('btnResetCategories').addEventListener('click', () => {
  showConfirm(
    'Reset Categories',
    'This will restore all website categories to their defaults. Any custom assignments will be lost.',
    async () => {
      categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
      await sendMessage({ action: 'updateCategories', categories });
      renderCategories();
      const status = document.getElementById('saveStatus');
      status.textContent = '✓ Categories reset to default.';
      status.classList.add('visible');
      setTimeout(() => status.classList.remove('visible'), 2500);
    }
  );
});

// ─── Navigation ───────────────────────────────────────────────────────────────

document.getElementById('navDashboard').addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('dashboard/dashboard.html');
});

// ─── Init ─────────────────────────────────────────────────────────────────────

load();
