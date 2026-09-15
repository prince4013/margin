const API = '/api';
const GROWTH_LABELS = {
  skill: '專業技能力', economic: '經濟力', knowledge: '知識力',
  stamina: '體力', mental: '精神穩定度', life: '生活穩定度',
};
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const TYPE_LABELS = { acute: '急性情緒', chronic: '慢性壓力', todo: '待辦清單' };
const DECAY_LABELS = { fast: '快', medium: '中', long: '長' };

function todayStr() { return new Date().toISOString().slice(0, 10); }

// ---------- 主題切換 ----------
function initTheme() {
  const saved = localStorage.getItem('margin-theme') || 'tiffany';
  document.documentElement.setAttribute('data-theme', saved);
  document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-theme-btn');
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('margin-theme', t);
      loadDashboard();
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
      if (view === 'completions') loadCompletions();
      if (view === 'notes') loadNotes();
      if (view === 'weekly') loadWeeklyPlan();
    });
  });
}

async function api(path, opts) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '請求失敗');
  }
  return res.status === 204 ? null : res.json();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 儀表板 ----------
let trendChart;

async function loadDashboard() {
  const now = new Date();
  document.getElementById('heroDate').textContent =
    `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAY_LABELS[now.getDay()]}`;

  // 每個區塊獨立 try/catch，避免其中一個 API 失敗就連帶讓其他區塊（例如成長軸）也不更新
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
  } catch (err) {
    console.error('讀取餘裕值失敗', err);
    document.getElementById('marginCaption').textContent = '讀取失敗，請確認資料庫連線設定。';
  }

  try {
    await loadTrend();
  } catch (err) {
    console.error('讀取趨勢失敗', err);
  }

  try {
    await loadGrowthOnDashboard();
  } catch (err) {
    console.error('讀取成長軸失敗', err);
  }

  try {
    await loadTodaySchedule();
  } catch (err) {
    console.error('讀取今天的行程失敗', err);
  }
}

async function loadTodaySchedule() {
  const plan = await api('/weekly-plan/current');
  const list = document.getElementById('todayScheduleList');
  const items = (plan && plan.items ? plan.items : []).filter(
    (it) => (it.event_date || '').slice(0, 10) === todayStr()
  );
  if (items.length === 0) {
    list.innerHTML = '<li>目前沒有本週規劃裡標記在今天的事項。</li>';
    return;
  }
  list.innerHTML = items.map((it) => `
    <li><span>${escapeHtml(it.title)}<div class="item-meta">${escapeHtml(it.category)}</div></span></li>
  `).join('');
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
      <span>${escapeHtml(cat)}</span>
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
  if (typeof Chart === 'undefined') {
    console.error('Chart.js 尚未載入，略過趨勢圖繪製');
    return;
  }
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: accent, backgroundColor: accent + '22', fill: true, tension: 0.35, pointRadius: 3 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } },
  });
}

async function loadGrowthOnDashboard() {
  const { totals } = await api('/growth/summary');
  const max = Math.max(10, ...Object.values(totals));
  const row = document.getElementById('growthStatRow');
  row.innerHTML = Object.keys(GROWTH_LABELS).map((cat) => `
    <div class="growth-stat">
      <span class="growth-label">${GROWTH_LABELS[cat]}</span>
      <div class="growth-bar"><div class="growth-bar-fill" style="width:${Math.max(0, totals[cat] / max) * 100}%"></div></div>
      <span class="growth-value">${totals[cat]}</span>
    </div>
  `).join('');
}

document.getElementById('btnAnotherSuggestion').addEventListener('click', () => loadRandomSuggestion());
document.getElementById('btnDismissSuggestion').addEventListener('click', () => {
  document.getElementById('suggestionCard').classList.add('hidden');
});

document.getElementById('btnResetTestData').addEventListener('click', async () => {
  if (!confirm('確定要清空所有測試資料嗎？事件、完成清單、隨手記、本週規劃、餘裕歷史都會被刪除，無法復原。')) return;
  if (!confirm('再次確認：真的要全部清空嗎？')) return;
  try {
    await api('/reset-test-data', { method: 'POST' });
    await loadDashboard();
    alert('已清空所有測試資料。');
  } catch (err) {
    console.error('清空測試資料失敗', err);
    alert('清空失敗：' + err.message);
  }
});

// ---------- 事件（負擔） ----------
function updateEventFormVisibility() {
  const type = document.getElementById('ev-type').value;
  document.getElementById('field-decay').classList.toggle('hidden', type !== 'acute');
}
document.getElementById('ev-type').addEventListener('change', updateEventFormVisibility);
document.getElementById('ev-date').value = todayStr();
document.getElementById('ev-burden').addEventListener('input', (e) => {
  document.getElementById('ev-burden-value').textContent = e.target.value;
});

document.getElementById('eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    type: document.getElementById('ev-type').value,
    title: document.getElementById('ev-title').value,
    category: document.getElementById('ev-category').value || '未分類',
    event_date: document.getElementById('ev-date').value || todayStr(),
    initial_burden: Number(document.getElementById('ev-burden').value) || 10,
    decay_speed: document.getElementById('ev-decay').value,
  };
  try {
    await api('/events', { method: 'POST', body: JSON.stringify(payload) });
    e.target.reset();
    document.getElementById('ev-date').value = todayStr();
    document.getElementById('ev-burden-value').textContent = document.getElementById('ev-burden').value;
    updateEventFormVisibility();
    await loadEvents(); await loadDashboard();
  } catch (err) {
    console.error('新增事件失敗', err);
    alert('新增事件失敗：' + err.message);
  }
});

async function loadEvents() {
  const events = await api('/events');
  const list = document.getElementById('eventList');
  if (events.length === 0) {
    list.innerHTML = '<p class="panel-hint">目前沒有進行中的事件。</p>';
  } else {
    list.innerHTML = events.map(renderEventCard).join('');
  }

  list.querySelectorAll('[data-resolve-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/events/${btn.dataset.resolveId}/resolve`, { method: 'PATCH' });
      await loadEvents(); await loadDashboard();
    });
  });
  list.querySelectorAll('[data-dot]').forEach((dotBtn) => {
    dotBtn.addEventListener('click', async () => {
      const [eventId, dotIndex] = dotBtn.dataset.dot.split(':');
      await api(`/events/${eventId}/progress`, { method: 'PATCH', body: JSON.stringify({ dots: Number(dotIndex) }) });
      await loadEvents(); await loadDashboard();
    });
  });
  list.querySelectorAll('[data-delete-event]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('確定要刪除這筆事件嗎？')) return;
      await api(`/events/${btn.dataset.deleteEvent}`, { method: 'DELETE' });
      await loadEvents(); await loadDashboard();
    });
  });

  await loadDepartedEvents();
}

async function loadDepartedEvents() {
  const departed = await api('/events/departed');
  const list = document.getElementById('departedList');
  if (departed.length === 0) {
    list.innerHTML = '<p class="panel-hint">這週還沒有離開的心理負擔。</p>';
    return;
  }
  list.innerHTML = departed.map((e) => `
    <div class="event-card">
      <div class="event-card-head"><span class="event-title">${escapeHtml(e.title)}</span></div>
      <div class="event-meta">${TYPE_LABELS[e.type] || e.type} · ${escapeHtml(e.category)} · 離開於 ${e.resolved_at ? e.resolved_at.slice(0, 10) : ''}</div>
      <div class="event-actions"><button class="btn-ghost small" data-departed-delete="${e.id}">刪除</button></div>
    </div>
  `).join('');

  list.querySelectorAll('[data-departed-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/events/${btn.dataset.departedDelete}`, { method: 'DELETE' });
      await loadDepartedEvents();
    });
  });
}

function renderEventCard(e) {
  const typeLabel = TYPE_LABELS[e.type] || e.type;
  let body = '';

  if (e.type === 'acute') {
    const totalDots = { fast: 1, medium: 3, long: 7 }[e.decay_speed] || 3;
    const daysPassed = Math.max(0, Math.floor((new Date(todayStr()) - new Date(e.event_date)) / 86400000));
    const filled = Math.min(totalDots, daysPassed);
    body = `
      <div class="dot-scale">${Array.from({ length: totalDots }).map((_, i) => `<span class="dot ${i < filled ? 'filled' : ''}"></span>`).join('')}</div>
      <div class="event-meta">淡化速度：${DECAY_LABELS[e.decay_speed] || '中'}</div>
    `;
  } else if (e.type === 'chronic') {
    const dots = Number(e.progress || 0);
    body = `
      <div class="dot-scale-10">
        ${Array.from({ length: 10 }).map((_, i) => `<button type="button" class="dot-10 ${i < dots ? 'filled' : ''}" data-dot="${e.id}:${i + 1}"></button>`).join('')}
        <span class="progress-percent">${dots * 10}%</span>
      </div>
    `;
  }

  const showResolve = e.type === 'todo';
  return `
    <div class="event-card">
      <div class="event-card-head"><span class="event-title">${escapeHtml(e.title)}</span></div>
      <div class="event-meta">${typeLabel} · ${escapeHtml(e.category)} · ${e.event_date ? e.event_date.slice(0, 10) : ''}</div>
      ${body}
      <div class="event-actions">
        ${showResolve ? `<button class="btn-ghost small" data-resolve-id="${e.id}">標記已解決</button>` : ''}
        <button class="btn-ghost small" data-delete-event="${e.id}">刪除</button>
      </div>
    </div>
  `;
}

// ---------- 完成清單 ----------
document.getElementById('co-date').value = todayStr();

document.getElementById('completionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    title: document.getElementById('co-title').value,
    category: document.getElementById('co-category').value,
    event_date: document.getElementById('co-date').value || todayStr(),
    lightness: document.getElementById('co-lightness').value,
  };
  try {
    await api('/completions', { method: 'POST', body: JSON.stringify(payload) });
    e.target.reset();
    document.getElementById('co-date').value = todayStr();
    await loadCompletions();
    await loadDashboard();
  } catch (err) {
    console.error('儲存完成項目失敗', err);
    alert('儲存失敗：' + err.message);
  }
});

async function loadCompletions() {
  const rows = await api('/completions');
  const list = document.getElementById('completionList');
  list.innerHTML = rows.map((r) => `
    <li>
      <span>${escapeHtml(r.title)}<div class="item-meta">${escapeHtml(r.category)} · ${r.event_date ? r.event_date.slice(0, 10) : ''}</div></span>
      <button data-delete-completion="${r.id}">刪除</button>
    </li>
  `).join('') || '<li>還沒有完成紀錄。</li>';

  list.querySelectorAll('[data-delete-completion]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('刪除後，這筆帶來的成長分數也會一併扣回，確定嗎？')) return;
      await api(`/completions/${btn.dataset.deleteCompletion}`, { method: 'DELETE' });
      await loadCompletions(); await loadDashboard();
    });
  });
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

  document.getElementById('triagedList').innerHTML = triaged.slice(0, 20).map((n) => `
    <li>
      <span>${escapeHtml(n.content)}<div class="item-meta">${(n.triaged_at || n.created_at).slice(0, 10)}</div></span>
      <button data-delete-note="${n.id}">刪除</button>
    </li>
  `).join('') || '<li>還沒有已整理的紀錄。</li>';

  document.querySelectorAll('[data-triage]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/notes/${btn.dataset.triage}/triage`, { method: 'PATCH' });
      await loadNotes(); await loadDashboard();
    });
  });
  document.querySelectorAll('[data-delete-note]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/notes/${btn.dataset.deleteNote}`, { method: 'DELETE' });
      await loadNotes();
    });
  });
}

// ---------- 本週規劃 ----------
const WEEKLY_CATEGORIES = ['課業', '工作', '聚會', '出遊'];

function addWeeklyItemRow() {
  const row = document.createElement('div');
  row.className = 'weekly-item-row';
  row.dataset.burden = '30';
  row.innerHTML = `
    <div class="weekly-item-top">
      <input type="text" placeholder="事項名稱">
      <select class="w-category">${WEEKLY_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
      <input type="date" class="w-date" value="${todayStr()}">
    </div>
    <div class="weekly-item-burden">
      <div class="burden-header">
        <span class="burden-label">強度</span>
        <span class="progress-percent w-burden-display">30</span>
      </div>
      <div class="dot-scale-10">
        ${Array.from({ length: 5 }).map((_, i) => `<button type="button" class="dot-10 ${i < 3 ? 'filled' : ''}" data-weekly-dot="${i + 1}"></button>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('weeklyItemRows').appendChild(row);

  row.querySelectorAll('[data-weekly-dot]').forEach((dotBtn) => {
    dotBtn.addEventListener('click', () => {
      const dots = Number(dotBtn.dataset.weeklyDot);
      row.dataset.burden = String(dots * 10);
      row.querySelectorAll('.dot-10').forEach((d, idx) => d.classList.toggle('filled', idx < dots));
      row.querySelector('.w-burden-display').textContent = dots * 10;
    });
  });
}
document.getElementById('btnAddWeeklyItem').addEventListener('click', addWeeklyItemRow);

document.getElementById('btnSaveWeeklyPlan').addEventListener('click', async () => {
  const items = [];
  document.querySelectorAll('#weeklyItemRows .weekly-item-row').forEach((row) => {
    const titleInput = row.querySelector('input[type="text"]');
    const category = row.querySelector('.w-category').value;
    const event_date = row.querySelector('.w-date').value;
    const burden = Number(row.dataset.burden) || 30;
    if (titleInput.value.trim() && event_date) {
      items.push({ title: titleInput.value.trim(), category, event_date, initial_burden: burden });
    }
  });
  if (items.length === 0) {
    alert('請至少填寫一項事項名稱，並確認有選擇日期，才能算出負擔分布。');
    return;
  }
  try {
    const result = await api('/weekly-plan', { method: 'POST', body: JSON.stringify({ items }) });
    renderWeeklyChart(result.predicted_curve);
    renderWeeklyItemsList(result.items);
    document.getElementById('weeklyItemRows').innerHTML = '';
    addWeeklyItemRow();
    await loadDashboard();
  } catch (err) {
    console.error('儲存本週規劃失敗', err);
    alert('儲存本週規劃失敗：' + err.message);
  }
});

const EMPTY_HISTOGRAM = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };

async function loadWeeklyPlan() {
  document.getElementById('weeklyItemRows').innerHTML = '';
  addWeeklyItemRow();
  const plan = await api('/weekly-plan/current');
  if (plan) {
    renderWeeklyChart(plan.predicted_curve);
    renderWeeklyItemsList(plan.items || []);
  } else {
    renderWeeklyChart(EMPTY_HISTOGRAM);
    renderWeeklyItemsList([]);
  }
}

function renderWeeklyItemsList(items) {
  const list = document.getElementById('weeklyItemsList');
  if (!items || items.length === 0) {
    list.innerHTML = '<li>目前還沒有已規劃的事項。</li>';
    return;
  }
  list.innerHTML = items.map((it) => `
    <li>
      <span>${escapeHtml(it.title)}<div class="item-meta">${escapeHtml(it.category)} · ${(it.event_date || '').slice(0, 10)} · 負擔強度 ${it.initial_burden}</div></span>
      <button data-delete-weekly-item="${it.id}">刪除</button>
    </li>
  `).join('');

  list.querySelectorAll('[data-delete-weekly-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const updated = await api(`/weekly-plan/current/items/${btn.dataset.deleteWeeklyItem}`, { method: 'DELETE' });
        renderWeeklyChart(updated.predicted_curve);
        renderWeeklyItemsList(updated.items);
      } catch (err) {
        console.error('刪除規劃事項失敗', err);
        alert('刪除失敗：' + err.message);
      }
    });
  });
}

let weeklyChart;
function renderWeeklyChart(histogram) {
  const ctx = document.getElementById('weeklyChart');
  if (typeof Chart === 'undefined') {
    throw new Error('圖表元件（Chart.js）載入失敗，請重新整理頁面再試一次');
  }
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const labels = ['一', '二', '三', '四', '五', '六', '日'];
  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const data = keys.map((k) => histogram[k]);
  if (weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: accent }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, beginAtZero: true, title: { display: true, text: '負擔量' } } } },
  });
}

// ---------- 初始化 ----------
initTheme();
initTabs();
updateEventFormVisibility();
loadDashboard();
