// Focus Timer – Dashboard Script

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response || {});
    });
  });
}

function formatHM(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function getDateRange(rangeStr) {
  if (rangeStr === 'today') return [todayKey()];
  if (rangeStr === '7') return getLast7Days();
  if (rangeStr === '30') return getLast30Days();
  return getLast7Days();
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ─── State ────────────────────────────────────────────────────────────────────

let usageData = {};
let categories = {};
let currentRange = '7';
let currentView = 'overview';
let modalTargetDomain = null;

const CAT_COLORS = {
  productivity: '#10b981',
  social: '#3b82f6',
  entertainment: '#f59e0b',
  uncategorized: '#6b7280'
};

const CAT_LABELS = {
  productivity: 'Productive',
  social: 'Social',
  entertainment: 'Rest',
  uncategorized: 'Other'
};

// ─── Load Data ────────────────────────────────────────────────────────────────

async function loadData() {
  const state = await sendMessage({ action: 'getState' });
  usageData = state.usageData || {};
  categories = state.categories || {};
  renderAll();
}

// ─── Aggregate Data for Range ─────────────────────────────────────────────────

function aggregateRange(days) {
  const agg = {
    productivity: 0, social: 0, entertainment: 0, uncategorized: 0,
    sites: {}, sessions: []
  };
  for (const day of days) {
    const d = usageData[day];
    if (!d) continue;
    agg.productivity += d.productivity || 0;
    agg.social += d.social || 0;
    agg.entertainment += d.entertainment || 0;
    agg.uncategorized += d.uncategorized || 0;
    for (const [site, secs] of Object.entries(d.sites || {})) {
      agg.sites[site] = (agg.sites[site] || 0) + secs;
    }
    agg.sessions.push(...(d.sessions || []));
  }
  return agg;
}

// ─── Render All ───────────────────────────────────────────────────────────────

function renderAll() {
  const days = getDateRange(currentRange);
  const agg = aggregateRange(days);

  renderOverviewCards(agg);
  renderDailyChart(days);
  renderDonutChart(agg);
  renderTodayDetails();
  renderSitesTable(agg);
  renderHistoryTable(days);
  renderHistoryChart(days);
  renderSessions(days);
}

// ─── Overview Cards ───────────────────────────────────────────────────────────

function renderOverviewCards(agg) {
  const total = agg.productivity + agg.social + agg.entertainment + agg.uncategorized || 1;

  const cats = ['productivity', 'social', 'entertainment', 'uncategorized'];
  const ids = {
    productivity: ['totalProductivity', 'pctProductivity', 'barProductivity'],
    social: ['totalSocial', 'pctSocial', 'barSocial'],
    entertainment: ['totalEntertainment', 'pctEntertainment', 'barEntertainment'],
    uncategorized: ['totalUncategorized', 'pctUncategorized', 'barUncategorized']
  };

  for (const cat of cats) {
    const secs = agg[cat] || 0;
    const pct = Math.round((secs / total) * 100);
    const [valId, pctId, barId] = ids[cat];
    document.getElementById(valId).textContent = formatHM(secs);
    document.getElementById(pctId).textContent = `${pct}% of total`;
    document.getElementById(barId).style.width = `${pct}%`;
  }
}

// ─── Canvas Chart Helpers ─────────────────────────────────────────────────────

function clearCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || canvas.clientWidth || 600;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

// ─── Daily Bar Chart ──────────────────────────────────────────────────────────

function renderDailyChart(days) {
  const canvas = document.getElementById('chartDaily');
  if (!canvas) return;

  canvas.width = canvas.parentElement.clientWidth - 40 || 600;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const H = canvas.height;
  const W = canvas.width;
  const PAD = { top: 20, right: 16, bottom: 40, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Find max total for scale
  let maxTotal = 0;
  for (const day of days) {
    const d = usageData[day] || {};
    const total = (d.productivity || 0) + (d.social || 0) + (d.entertainment || 0) + (d.uncategorized || 0);
    maxTotal = Math.max(maxTotal, total);
  }
  if (maxTotal === 0) maxTotal = 3600; // default scale: 1 hour

  const barWidth = (chartW / days.length) * 0.6;
  const barGap = chartW / days.length;

  // Draw grid lines
  ctx.strokeStyle = '#2a2d3a';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + chartH - (chartH * i / 4);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + chartW, y);
    ctx.stroke();

    // Y labels
    const val = Math.round((maxTotal * i / 4) / 60);
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${val}m`, PAD.left - 6, y + 4);
  }

  const catOrder = ['productivity', 'social', 'entertainment', 'uncategorized'];

  for (let i = 0; i < days.length; i++) {
    const day = usageData[days[i]] || {};
    const x = PAD.left + i * barGap + (barGap - barWidth) / 2;
    let yBase = PAD.top + chartH;

    for (const cat of catOrder) {
      const secs = day[cat] || 0;
      if (secs === 0) continue;
      const barH = (secs / maxTotal) * chartH;
      ctx.fillStyle = CAT_COLORS[cat];
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, yBase - barH, barWidth, barH, 3);
        ctx.fill();
      } else {
        ctx.fillRect(x, yBase - barH, barWidth, barH);
      }
      yBase -= barH;
    }

    // X label
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const label = days.length <= 7
      ? formatDateLabel(days[i]).split(' ')[0] + ' ' + formatDateLabel(days[i]).split(' ')[1]
      : formatDateLabel(days[i]).split(' ')[1];
    ctx.fillText(label, x + barWidth / 2, PAD.top + chartH + 16);
  }

  // Legend
  let legendX = PAD.left;
  for (const cat of catOrder) {
    ctx.fillStyle = CAT_COLORS[cat];
    ctx.fillRect(legendX, PAD.top + chartH + 28, 10, 10);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(CAT_LABELS[cat], legendX + 14, PAD.top + chartH + 38);
    legendX += 90;
  }
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

function renderDonutChart(agg) {
  const canvas = document.getElementById('chartDonut');
  if (!canvas) return;

  canvas.width = canvas.parentElement.clientWidth - 40 || 280;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const outerR = Math.min(cx, cy) - 10;
  const innerR = outerR * 0.55;

  const total = agg.productivity + agg.social + agg.entertainment + agg.uncategorized || 1;
  const slices = [
    { cat: 'productivity', value: agg.productivity },
    { cat: 'social', value: agg.social },
    { cat: 'entertainment', value: agg.entertainment },
    { cat: 'uncategorized', value: agg.uncategorized }
  ].filter(s => s.value > 0);

  if (slices.length === 0) {
    ctx.fillStyle = '#2a2d3a';
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data', cx, cy + 4);
    return;
  }

  let startAngle = -Math.PI / 2;
  for (const slice of slices) {
    const angle = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = CAT_COLORS[slice.cat];
    ctx.fill();
    startAngle += angle;
  }

  // Inner hole
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1d27';
  ctx.fill();

  // Center label
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatHM(total), cx, cy - 2);
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px sans-serif';
  ctx.fillText('total', cx, cy + 14);

  // Legend
  const legend = document.getElementById('donutLegend');
  if (legend) {
    legend.innerHTML = '';
    for (const slice of slices) {
      const pct = Math.round((slice.value / total) * 100);
      legend.innerHTML += `
        <div class="legend-item">
          <div class="legend-dot" style="background:${CAT_COLORS[slice.cat]}"></div>
          <span class="legend-label">${CAT_LABELS[slice.cat]}</span>
          <span class="legend-value">${formatHM(slice.value)}</span>
          <span class="legend-pct">${pct}%</span>
        </div>`;
    }
  }
}

// ─── Today Details ────────────────────────────────────────────────────────────

function renderTodayDetails() {
  const key = todayKey();
  const today = usageData[key] || {};
  const sessions = today.sessions || [];

  document.getElementById('todaySessions').textContent = sessions.length;

  const totalFocus = sessions.reduce((a, s) => a + (s.duration || 0), 0);
  document.getElementById('todayFocusTime').textContent = formatHM(totalFocus);

  const avgSession = sessions.length > 0 ? Math.round(totalFocus / sessions.length) : 0;
  document.getElementById('todayAvgSession').textContent = avgSession > 0 ? formatHM(avgSession) : '—';

  // Top category today
  const cats = ['productivity', 'social', 'entertainment', 'uncategorized'];
  let topCat = '—';
  let topSecs = 0;
  for (const cat of cats) {
    if ((today[cat] || 0) > topSecs) {
      topSecs = today[cat] || 0;
      topCat = CAT_LABELS[cat];
    }
  }
  document.getElementById('todayTopCategory').textContent = topCat;
}

// ─── Sites Table ──────────────────────────────────────────────────────────────

let currentCatFilter = 'all';
let sitesSearchQuery = '';

function getCategoryForSite(domain) {
  for (const [cat, domains] of Object.entries(categories)) {
    if (Array.isArray(domains) && domains.some(d => domain === d || domain.endsWith('.' + d))) {
      return cat;
    }
  }
  return 'uncategorized';
}

function renderSitesTable(agg) {
  const tbody = document.getElementById('sitesTableBody');
  if (!tbody) return;

  const total = Object.values(agg.sites).reduce((a, b) => a + b, 0) || 1;
  let sites = Object.entries(agg.sites)
    .map(([domain, secs]) => ({
      domain,
      secs,
      category: getCategoryForSite(domain)
    }))
    .sort((a, b) => b.secs - a.secs);

  if (currentCatFilter !== 'all') {
    sites = sites.filter(s => s.category === currentCatFilter);
  }
  if (sitesSearchQuery) {
    sites = sites.filter(s => s.domain.toLowerCase().includes(sitesSearchQuery.toLowerCase()));
  }

  if (sites.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No data for this filter.</td></tr>';
    return;
  }

  tbody.innerHTML = sites.map(({ domain, secs, category }) => {
    const pct = Math.round((secs / total) * 100);
    const color = CAT_COLORS[category] || '#6b7280';
    return `
      <tr>
        <td><strong>${domain}</strong></td>
        <td><span class="category-badge ${category}">${CAT_LABELS[category] || category}</span></td>
        <td>
          <div class="time-bar-cell">
            <span>${formatHM(secs)}</span>
            <div class="time-bar-bg">
              <div class="time-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
          </div>
        </td>
        <td>${pct}%</td>
        <td><button class="change-cat-btn" data-domain="${domain}">Change</button></td>
      </tr>`;
  }).join('');

  // Bind change buttons
  tbody.querySelectorAll('.change-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => openCategoryModal(btn.dataset.domain));
  });
}

// ─── History Table & Chart ─────────────────────────────────────────────────────

function renderHistoryTable(days) {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  const rows = days.slice().reverse().map(day => {
    const d = usageData[day] || {};
    const sessions = (d.sessions || []).length;
    const total = (d.productivity || 0) + (d.social || 0) + (d.entertainment || 0) + (d.uncategorized || 0);
    return `
      <tr>
        <td>${formatDateLabel(day)}</td>
        <td style="color:#10b981">${formatHM(d.productivity || 0)}</td>
        <td style="color:#3b82f6">${formatHM(d.social || 0)}</td>
        <td style="color:#f59e0b">${formatHM(d.entertainment || 0)}</td>
        <td>${sessions}</td>
        <td>${formatHM(total)}</td>
      </tr>`;
  }).join('');

  tbody.innerHTML = rows || '<tr class="empty-row"><td colspan="6">No history yet.</td></tr>';
}

function renderHistoryChart(days) {
  const canvas = document.getElementById('chartHistory');
  if (!canvas) return;

  canvas.width = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const W = canvas.width;
  const H = canvas.height;
  const PAD = { top: 20, right: 16, bottom: 50, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  let maxTotal = 0;
  for (const day of days) {
    const d = usageData[day] || {};
    const t = (d.productivity || 0) + (d.social || 0) + (d.entertainment || 0);
    maxTotal = Math.max(maxTotal, t);
  }
  if (maxTotal === 0) maxTotal = 3600;

  // Grid
  ctx.strokeStyle = '#2a2d3a';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + chartH - (chartH * i / 4);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + chartW, y);
    ctx.stroke();
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round((maxTotal * i / 4) / 60)}m`, PAD.left - 8, y + 4);
  }

  const catOrder = ['productivity', 'social', 'entertainment'];
  const barWidth = (chartW / days.length) * 0.65;
  const barGap = chartW / days.length;

  for (let i = 0; i < days.length; i++) {
    const day = usageData[days[i]] || {};
    const x = PAD.left + i * barGap + (barGap - barWidth) / 2;
    let yBase = PAD.top + chartH;

    for (const cat of catOrder) {
      const secs = day[cat] || 0;
      if (secs === 0) continue;
      const barH = (secs / maxTotal) * chartH;
      ctx.fillStyle = CAT_COLORS[cat];
      ctx.fillRect(x, yBase - barH, barWidth, barH);
      yBase -= barH;
    }

    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatDateLabel(days[i]), x + barWidth / 2, PAD.top + chartH + 16);
  }

  // Legend
  let lx = PAD.left;
  for (const cat of catOrder) {
    ctx.fillStyle = CAT_COLORS[cat];
    ctx.fillRect(lx, PAD.top + chartH + 30, 10, 10);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(CAT_LABELS[cat], lx + 14, PAD.top + chartH + 40);
    lx += 90;
  }
}

// ─── Sessions View ────────────────────────────────────────────────────────────

function renderSessions(days) {
  const container = document.getElementById('sessionsList');
  if (!container) return;

  let html = '';
  let hasData = false;

  for (const day of [...days].reverse()) {
    const d = usageData[day] || {};
    const sessions = (d.sessions || []).filter(s => s.duration > 0);
    if (sessions.length === 0) continue;
    hasData = true;

    html += `<div class="session-date-label">${formatDateLabel(day)}</div>`;
    for (const session of [...sessions].reverse()) {
      const sites = Object.entries(session.tabs || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain, secs]) => `<span class="session-site-tag">${domain} (${formatHM(secs)})</span>`)
        .join('');

      html += `
        <div class="session-card">
          <div class="session-card-header">
            <span class="session-time-range">
              ${formatTimestamp(session.startTime)} – ${formatTimestamp(session.endTime)}
            </span>
            <span class="session-duration">${formatHM(session.duration)}</span>
          </div>
          <div class="session-sites">${sites || '<span class="session-site-tag">No sites tracked</span>'}</div>
        </div>`;
    }
  }

  container.innerHTML = hasData ? html : '<div class="empty-state">No sessions recorded yet. Start focusing!</div>';
}

// ─── Category Modal ───────────────────────────────────────────────────────────

function openCategoryModal(domain) {
  modalTargetDomain = domain;
  document.getElementById('modalSite').textContent = domain;

  // Find current category
  const currentCat = getCategoryForSite(domain);
  const radios = document.querySelectorAll('input[name="modalCat"]');
  radios.forEach(r => { r.checked = r.value === currentCat; });

  document.getElementById('categoryModal').classList.remove('hidden');
}

document.getElementById('modalCancel').addEventListener('click', () => {
  document.getElementById('categoryModal').classList.add('hidden');
  modalTargetDomain = null;
});

document.getElementById('modalSave').addEventListener('click', async () => {
  if (!modalTargetDomain) return;
  const selectedCat = document.querySelector('input[name="modalCat"]:checked')?.value;
  if (!selectedCat) return;

  // Remove from all categories
  for (const cat of Object.keys(categories)) {
    categories[cat] = (categories[cat] || []).filter(d => d !== modalTargetDomain);
  }
  // Add to selected
  if (!categories[selectedCat]) categories[selectedCat] = [];
  categories[selectedCat].push(modalTargetDomain);

  await sendMessage({ action: 'updateCategories', categories });
  document.getElementById('categoryModal').classList.add('hidden');
  modalTargetDomain = null;
  renderAll();
});

// ─── Export CSV ───────────────────────────────────────────────────────────────

document.getElementById('btnExport').addEventListener('click', () => {
  const days = getDateRange(currentRange);
  let csv = 'Date,Productive (m),Social (m),Rest (m),Uncategorized (m),Sessions,Total (m)\n';

  for (const day of days) {
    const d = usageData[day] || {};
    const p = Math.round((d.productivity || 0) / 60);
    const s = Math.round((d.social || 0) / 60);
    const e = Math.round((d.entertainment || 0) / 60);
    const u = Math.round((d.uncategorized || 0) / 60);
    const sess = (d.sessions || []).length;
    const total = p + s + e + u;
    csv += `${day},${p},${s},${e},${u},${sess},${total}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `focus-timer-export-${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Navigation ───────────────────────────────────────────────────────────────

const viewTitles = {
  overview: ['Overview', 'Your productivity at a glance'],
  sites: ['Sites', 'Time breakdown by website'],
  history: ['History', 'Day-by-day activity log'],
  sessions: ['Sessions', 'Individual focus sessions']
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const view = item.dataset.view;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('view' + view.charAt(0).toUpperCase() + view.slice(1))?.classList.add('active');
    currentView = view;
    const [title, sub] = viewTitles[view] || ['', ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = sub;
  });
});

document.getElementById('btnSettings').addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('settings/settings.html');
});

// ─── Range Selector ───────────────────────────────────────────────────────────

document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    renderAll();
  });
});

// ─── Search & Filter ──────────────────────────────────────────────────────────

document.getElementById('sitesSearch').addEventListener('input', (e) => {
  sitesSearchQuery = e.target.value;
  const days = getDateRange(currentRange);
  const agg = aggregateRange(days);
  renderSitesTable(agg);
});

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentCatFilter = tab.dataset.cat;
    const days = getDateRange(currentRange);
    const agg = aggregateRange(days);
    renderSitesTable(agg);
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

loadData();
