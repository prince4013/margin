const API = '/api';
const CATEGORY_LABELS = { knowledge: '知識力', stamina: '體力', mental: '精神穩定度' };
const TYPE_LABELS = {
  emotion: '情緒型', progress: '進度型', staged: '分階段型', wish: '長期心願型', effort: '主動做功',
};

// ---------- 主題切換 ----------
function initTheme() {
  const saved = localStorage.getItem('margin-theme') || 'tiffany';
  document.documentElement.setAttribute('data-theme', saved);
  document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-theme-btn');
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('margin-theme', t);
    });
  });
}

// ---------- Tab 導覽 ----------
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
      document.getElementById(`view-${view}`).classList.remove('hidden');
      if (view === 'events') loadEvents();
      if (view === 'notes') loadNotes();
      if (view === 'weekly') loadWeeklyPlan();
      if (view === 'growth') loadGrowth();
    });
  });
}

async function api(path, opts) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '請求失敗');
  }
  return res.status === 204 ? null : res.json();
}

// ---------- 儀表板 ----------
let trendChart;

async function loadDashboard() {
  try {
    const margin = await api('/margin');
    document.getElementById('marginNumber').textContent = margin.margin;
    document.getElementById('breathingRing').style.setProperty('--pct', margin.margin);

    const captions = [
      [0, 20, '餘裕偏低，先照顧好自己，別急著做更多事。'],
      [20, 50, '你有一些餘裕了，可以留一點時間給自己喜歡的事。'],
      [50, 200, '餘裕充足，很適合去做點長期有意義的事。'],
    ];
    const match = captions.find(([lo, hi]) => margin.margin >= lo && margin.margin < hi);
    document.getElementById('marginCaption').textContent = match ? match[2] : '';

    renderBreakdown(margin.breakdown);

    const suggestionCard = document.getElementById('suggestionCard');
    if (margin.showSuggestion) {
      suggestionCard.classList.remove('hidden');
      await loadRandomSuggestion();
    } else {
      suggestionCard.classList.add('hidden');
    }

    await loadTrend();
  } catch (err) {
    console.error(err);
    document.getElementById('marginCaption').textContent = '讀取失敗，請確認資料庫連線設定。';
  }
}

function renderBreakdown(breakdown) {
  const list = document.getElementById('breakdownList');
  const entries = Object.entries(breakdown || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    list.innerHTML = '<li>目前沒有任何負擔紀錄，餘裕全滿。</li>';
    return;
  }
  list.innerHTML = entries.map(([cat, val]) => `
    <li>
      <span>${cat}</span>
      <span class="${val >= 0 ? 'neg' : 'pos'}">${val >= 0 ? '-' : '+'}${Math.abs(val).toFixed(1)}</span>
    </li>
  `).join('');
}

async function loadRandomSuggestion(category) {
  const s = await api('/suggestion/random' + (category ? `?category=${category}` : ''));
  document.getElementById('suggestionTitle').textContent = s ? s.title : '暫無建議';
}

async function loadTrend() {
  const rows = await api('/margin/trend?days=14');
  const labels = rows.map((r) => r.date.slice(5));
  const data = rows.map((r) => Number(r.margin));
  const ctx = document.getElementById('trendChart');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data, borderColor: accent, backgroundColor: accent + '22',
        fill: true, tension: 0.35, pointRadius: 3,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 100 } },
    },
  });
}

document.getElementById('btnAnotherSuggestion').addEventListener('click', () => loadRandomSuggestion());
document.getElementById('btnDismissSuggestion').addEventListener('click', () => {
  document.getElementById('suggestionCard').classList.add('hidden');
});

// ---------- 事件 ----------
function updateEventFormVisibility() {
  const type = document.getElementById('ev-type').value;
  document.getElementById('field-burden').classList.toggle('hidden', type === 'wish');
  document.getElementById('field-decay').classList.toggle('hidden', !['emotion', 'effort'].includes(type));
  document.getElementById('field-anxious').classList.toggle('hidden', type !== 'wish');
  document.getElementById('field-milestones').classList.toggle('hidden', type !== 'staged');
}
document.getElementById('ev-type').addEventListener('change', updateEventFormVisibility);

document.getElementById('btnAddMilestone').addEventListener('click', () => {
  const row = document.createElement('div');
  row.className = 'milestone-row';
  row.innerHTML = `
    <input type="text" placeholder="里程碑名稱，如：完成會談">
    <input type="number" placeholder="釋放%" min="1" max="100">
  `;
  document.getElementById('milestoneRows').appendChild(row);
});

document.getElementById('eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('ev-type').value;
  const milestones = [];
  if (type === 'staged') {
    document.querySelectorAll('#milestoneRows .milestone-row').forEach((row) => {
      const [labelInput, pctInput] = row.querySelectorAll('input');
      if (labelInput.value && pctInput.value) {
        milestones.push({ label: labelInput.value, release_percent: Number(pctInput.value) });
      }
    });
  }
  const payload = {
    type,
    title: document.getElementById('ev-title').value,
    category: document.getElementById('ev-category').value || '未分類',
    initial_burden: Number(document.getElementById('ev-burden').value) || 10,
    decay_speed: document.getElementById('ev-decay').value,
    anxious: document.getElementById('ev-anxious').checked,
    milestones,
  };
  await api('/events', { method: 'POST', body: JSON.stringify(payload) });
  e.target.reset();
  document.getElementById('milestoneRows').innerHTML = '';
  updateEventFormVisibility();
  await loadEvents();
  await loadDashboard();
});

async function loadEvents() {
  const events = await api('/events');
  const list = document.getElementById('eventList');
  if (events.length === 0) {
    list.innerHTML = '<p class="panel-hint">目前沒有進行中的事件。</p>';
    return;
  }
  list.innerHTML = events.map(renderEventCard).join('');

  list.querySelectorAll('[data-progress-id]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/events/${input.dataset.progressId}`, {
        method: 'PATCH', body: JSON.stringify({ progress: Number(input.value) }),
      });
      await loadEvents(); await loadDashboard();
    });
  });
  list.querySelectorAll('[data-resolve-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/events/${btn.dataset.resolveId}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'resolved' }),
      });
      await loadEvents(); await loadDashboard();
    });
  });
  list.querySelectorAll('[data-milestone]').forEach((chip) => {
    chip.addEventListener('click', async () => {
      if (chip.classList.contains('done')) return;
      const [eventId, mid] = chip.dataset.milestone.split(':');
      await api(`/events/${eventId}/milestones/${mid}/complete`, { method: 'POST' });
      await loadEvents(); await loadDashboard();
    });
  });
}

function renderEventCard(e) {
  const typeLabel = TYPE_LABELS[e.type] || e.type;
  let body = '';
  if (e.type === 'progress') {
    body = `
      <input type="range" min="0" max="100" value="${e.progress || 0}" data-progress-id="${e.id}">
      <div class="event-meta">完成度 ${e.progress || 0}%</div>
    `;
  } else if (e.type === 'staged') {
    body = `<div class="event-actions">${(e.milestones || []).map((m) => `
      <span class="milestone-chip ${m.completed ? 'done' : ''}" data-milestone="${e.id}:${m.id}">
        ${m.label}（${m.release_percent}%）${m.completed ? '✓' : ''}
      </span>`).join('')}</div>`;
  }
  const showResolve = e.type !== 'wish';
  return `
    <div class="event-card">
      <div class="event-card-head">
        <span class="event-title">${escapeHtml(e.title)}</span>
      </div>
      <div class="event-meta">${typeLabel} · ${escapeHtml(e.category)}</div>
      ${body}
      <div class="event-actions">
        ${showResolve ? `<button class="btn-ghost small" data-resolve-id="${e.id}">標記已解決</button>` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 隨手記 ----------
document.getElementById('noteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('note-content');
  await api('/notes', { method: 'POST', body: JSON.stringify({ content: input.value }) });
  input.value = '';
  await loadNotes(); await loadDashboard();
});

async function loadNotes() {
  const all = await api('/notes');
  const untriaged = all.filter((n) => !n.triaged);
  const triaged = all.filter((n) => n.triaged);
  document.getElementById('untriagedCount').textContent = untriaged.length;

  document.getElementById('untriagedList').innerHTML = untriaged.map((n) => `
    <li><span>${escapeHtml(n.content)}</span><button data-triage="${n.id}">已整理</button></li>
  `).join('') || '<li>目前沒有待整理的想法。</li>';

  document.getElementById('triagedList').innerHTML = triaged.slice(0, 10).map((n) => `
    <li><span>${escapeHtml(n.content)}</span></li>
  `).join('') || '<li>還沒有已整理的紀錄。</li>';

  document.querySelectorAll('[data-triage]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/notes/${btn.dataset.triage}/triage`, { method: 'PATCH' });
      await loadNotes(); await loadDashboard();
    });
  });
}

// ---------- 本週規劃 ----------
const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function addWeeklyItemRow() {
  const row = document.createElement('div');
  row.className = 'weekly-item-row';
  row.innerHTML = `
    <input type="text" placeholder="事項名稱">
    <select class="w-type">
      <option value="emotion">情緒型</option>
      <option value="progress">進度型</option>
    </select>
    <select class="w-day">
      ${DAY_LABELS.map((d, i) => `<option value="${i}">週${d}</option>`).join('')}
    </select>
    <input type="number" class="w-burden" placeholder="負擔強度" min="1" max="100" value="15">
    <input type="text" class="w-category" placeholder="分類">
  `;
  document.getElementById('weeklyItemRows').appendChild(row);
}
document.getElementById('btnAddWeeklyItem').addEventListener('click', addWeeklyItemRow);

document.getElementById('btnSaveWeeklyPlan').addEventListener('click', async () => {
  const items = [];
  document.querySelectorAll('#weeklyItemRows .weekly-item-row').forEach((row) => {
    const [titleInput] = row.querySelectorAll('input[type="text"]');
    const type = row.querySelector('.w-type').value;
    const day = Number(row.querySelector('.w-day').value);
    const burden = Number(row.querySelector('.w-burden').value) || 10;
    const category = row.querySelector('.w-category').value || '未分類';
    if (titleInput.value) {
      items.push({ title: titleInput.value, type, expected_day_index: day, initial_burden: burden, category, decay_speed: 'medium' });
    }
  });
  const result = await api('/weekly-plan', { method: 'POST', body: JSON.stringify({ items }) });
  renderWeeklyChart(result.predicted_curve);
  await loadDashboard();
});

async function loadWeeklyPlan() {
  document.getElementById('weeklyItemRows').innerHTML = '';
  addWeeklyItemRow();
  const plan = await api('/weekly-plan/current');
  if (plan) renderWeeklyChart(plan.predicted_curve);
}

let weeklyChart;
function renderWeeklyChart(curve) {
  const ctx = document.getElementById('weeklyChart');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const labels = ['一', '二', '三', '四', '五', '六', '日'];
  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const data = keys.map((k) => curve[k]);
  if (weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: accent }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } },
  });
}

// ---------- 成長軸線 ----------
document.querySelectorAll('.growth-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const category = btn.dataset.growth;
    await api('/growth', { method: 'POST', body: JSON.stringify({ category, amount: 1 }) });
    await loadGrowth();
  });
});

async function loadGrowth() {
  const { totals } = await api('/growth/summary');
  const max = Math.max(10, ...Object.values(totals));
  ['knowledge', 'stamina', 'mental'].forEach((cat) => {
    document.getElementById(`val-${cat}`).textContent = totals[cat];
    document.getElementById(`bar-${cat}`).style.width = `${(totals[cat] / max) * 100}%`;
  });
}

// ---------- 初始化 ----------
initTheme();
initTabs();
updateEventFormVisibility();
loadDashboard();
