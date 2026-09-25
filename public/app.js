const API = '/api';
const DIMENSIONS = Object.keys(DIM_CONFIG); // from buildings.js

function todayStr() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 音效（Web Audio 合成，不需要外部音檔）----------
let soundEnabled = localStorage.getItem('sound-enabled') !== 'off';
let audioCtx;
function playSoftChime() {
  if (!soundEnabled) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) { /* 靜默失敗即可，不影響評分功能 */ }
}

function spawnRipple(dotEl) {
  const ripple = document.createElement('span');
  ripple.className = 'dot-ripple';
  ripple.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  dotEl.appendChild(ripple);
  setTimeout(() => ripple.remove(), 550);
}
async function api(path, opts) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '請求失敗');
  }
  return res.status === 204 ? null : res.json();
}

// ---------- 主題切換 ----------
function initTheme() {
  const saved = localStorage.getItem('study-theme') || 'tiffany';
  document.documentElement.setAttribute('data-theme', saved);
  document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-theme-btn');
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('study-theme', t);
    });
  });

  const soundBtn = document.getElementById('btnToggleSound');
  soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
  soundBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('sound-enabled', soundEnabled ? 'on' : 'off');
    soundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    if (soundEnabled) playSoftChime();
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
      if (view === 'input') loadRecentEntries();
      if (view === 'satisfaction') loadSatisfactionPage();
      if (view === 'city') loadCity();
      if (view === 'notes') loadNotes();
      if (view === 'dashboard') loadDashboard();
    });
  });
}

// ---------- 共用元件：向度選擇器(可複選) / 5 點強度量表 ----------
function buildDimensionPicker(container, defaultDims) {
  const initial = Array.isArray(defaultDims) ? defaultDims : (defaultDims ? [defaultDims] : [DIMENSIONS[0]]);
  const selected = new Set(initial.length ? initial : [DIMENSIONS[0]]);

  function sync() { container.dataset.selected = JSON.stringify(Array.from(selected)); }

  function render() {
    container.innerHTML = DIMENSIONS.map((d) => `
      <button type="button" class="dim-btn ${selected.has(d) ? 'active' : ''}" data-dim="${d}">${DIM_CONFIG[d].labelEn}</button>
    `).join('');
    container.querySelectorAll('.dim-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.dim;
        if (selected.has(d)) {
          if (selected.size > 1) selected.delete(d); // 至少留一個
        } else {
          selected.add(d);
        }
        sync();
        render();
      });
    });
  }

  sync();
  render();
}

function getSelectedDimensions(container) {
  try {
    const arr = JSON.parse(container.dataset.selected || '[]');
    return Array.isArray(arr) && arr.length ? arr : [DIMENSIONS[0]];
  } catch {
    return [DIMENSIONS[0]];
  }
}

function dimTags(dims) {
  return (Array.isArray(dims) ? dims : []).map((d) => DIM_CONFIG[d]?.labelEn || d).join(' + ');
}

function tagChips(tags) {
  return (Array.isArray(tags) && tags.length) ? ' · ' + tags.map((t) => `#${t}`).join(' ') : '';
}

function parseTagsInput(value) {
  return value.split(',').map((t) => t.trim()).filter(Boolean);
}

function buildIntensityDots(container, valueLabelEl, defaultVal) {
  container.dataset.value = defaultVal || 3;
  function render() {
    const v = Number(container.dataset.value);
    container.innerHTML = Array.from({ length: 5 }).map((_, i) => `
      <button type="button" class="dot-5 ${i < v ? 'filled' : ''}" data-v="${i + 1}"></button>
    `).join('');
    container.querySelectorAll('.dot-5').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.dataset.value = btn.dataset.v;
        if (valueLabelEl) valueLabelEl.textContent = btn.dataset.v;
        render();
      });
    });
  }
  render();
  if (valueLabelEl) valueLabelEl.textContent = container.dataset.value;
}

// ---------- 儀表板 ----------
let hexChart;
const dashState = { type: 'week', offset: 0 };

function initPeriodControls() {
  document.querySelectorAll('[data-period-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dashState.type = btn.dataset.periodType;
      dashState.offset = 0;
      document.querySelectorAll('[data-period-type]').forEach((b) => b.classList.toggle('active', b === btn));
      loadDashboard();
    });
  });
  document.getElementById('btnPrevPeriod').addEventListener('click', () => { dashState.offset -= 1; loadDashboard(); });
  document.getElementById('btnNextPeriod').addEventListener('click', () => { dashState.offset += 1; loadDashboard(); });
}

async function loadDashboard() {
  try {
    const data = await api(`/dashboard?period=${dashState.type}&offset=${dashState.offset}`);
    const label = dashState.offset === 0
      ? (dashState.type === 'week' ? '本週' : '本月')
      : `${data.start.slice(5)} ~ ${data.end.slice(5)}`;
    document.getElementById('periodLabel').textContent = label;

    const labels = DIMENSIONS.map((d) => DIM_CONFIG[d].label);
    const investments = DIMENSIONS.map((d) => data.breakdown[d]?.investment || 0);
    const satisfactionValues = DIMENSIONS.map((d) => data.breakdown[d]?.satisfactionSum || 0);

    renderHexChart(labels, investments, satisfactionValues);

    const card = document.getElementById('imbalanceCard');
    if (data.imbalance) {
      card.classList.remove('hidden');
      document.getElementById('imbalanceText').textContent =
        `這期 ${DIM_CONFIG[data.imbalance.overloaded].label} 佔了 ${data.imbalance.overloadedShare}%，${DIM_CONFIG[data.imbalance.neglected].label} 幾乎掛零，要不要留點時間補回來？`;
    } else {
      card.classList.add('hidden');
    }

    const satCard = document.getElementById('satisfactionCard');
    if (data.satisfactionAlert) {
      satCard.classList.remove('hidden');
      document.getElementById('satisfactionText').textContent =
        `這期投入最多的是 ${DIM_CONFIG[data.satisfactionAlert.dimension].label}，但平均滿意度只有 ${data.satisfactionAlert.avgSatisfaction} 分，要不要想想是不是方法需要調整？`;
    } else {
      satCard.classList.add('hidden');
    }
  } catch (err) {
    console.error('讀取儀表板失敗', err);
  }

  try {
    await loadTodaySchedule();
  } catch (err) {
    console.error('讀取今天的行程失敗', err);
  }

  try {
    await loadWishlist();
  } catch (err) {
    console.error('讀取想做的事失敗', err);
  }

  try {
    await loadTrendChart();
  } catch (err) {
    console.error('讀取趨勢失敗', err);
  }
}

async function loadTodaySchedule() {
  const rows = await api(`/entries?on_date=${todayStr()}`);
  const list = document.getElementById('todayScheduleList');
  list.innerHTML = rows.map((r) => `
    <li><span>${escapeHtml(r.description)}<div class="item-meta">${dimTags(r.dimensions)}${tagChips(r.tags)} · 投入 ${r.intensity}</div></span></li>
  `).join('') || '<li>今天還沒有排定的行程或計畫。</li>';

  // 預期餘裕值 = 1 - (今日投入值 / 8)，以圓環呈現；每個 entry 只算一次(不因複選向度而重複計入)
  const totalIntensity = rows.reduce((sum, r) => sum + (Number(r.intensity) || 0), 0);
  const pct = Math.round(Math.max(0, Math.min(100, (1 - totalIntensity / 8) * 100)));
  document.getElementById('marginRing').style.setProperty('--pct', pct);
  document.getElementById('marginRing').style.setProperty('--ring-color', marginRingColor(pct));
  document.getElementById('marginRingValue').textContent = pct;
}

// 🎛️ 餘裕值分四段顏色，想調整門檻或顏色改這裡就好
function marginRingColor(pct) {
  if (pct < 20) return '#C1483A'; // 紅
  if (pct < 40) return '#E08B3B'; // 橘
  if (pct < 60) return '#3FA66B'; // 綠
  return '#378ADD'; // 藍
}

// ---------- 想做的事（從隨手記「待處理」隨機挑一件）----------
async function loadWishlist() {
  const item = await api('/notes/today-pick');
  document.getElementById('wishlistToday').textContent = item
    ? item.content
    : '隨手記的待處理清單是空的，先去記一筆想做的事吧。';
}

// 趨勢折線圖專用的亮色系（跟城市建築的柔和色分開，讓六條線在圖上更好區分）
const TREND_COLORS = {
  learning: '#8B5CF6', // 紫
  social: '#EC4899', // 粉紅
  energy: '#F5C400', // 黃
  economy: '#14B8A6', // 綠松
  exploration: '#F97316', // 橘
  reflection: '#3B82F6', // 藍
};

let trendChart;
async function loadTrendChart() {
  const points = await api('/trend');
  const ctx = document.getElementById('trendChart');
  if (typeof Chart === 'undefined') return;
  if (trendChart) trendChart.destroy();

  const labels = points.map((p) => p.label);
  const datasets = DIMENSIONS.map((d) => ({
    label: DIM_CONFIG[d].label,
    data: points.map((p) => p.investments[d]),
    borderColor: TREND_COLORS[d],
    backgroundColor: TREND_COLORS[d],
    fill: false,
    tension: 0.3,
    pointRadius: 3,
  }));

  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function renderHexChart(labels, investments, satisfactionValues) {
  const ctx = document.getElementById('hexChart');
  if (typeof Chart === 'undefined') return;
  if (hexChart) hexChart.destroy();
  const maxVal = Math.max(10, ...investments, ...satisfactionValues);
  hexChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      // 陣列順序 = 畫的順序：投入(藍)先畫當底、滿意度(橘)後畫疊在上層，兩層都半透明才能同時看到彼此
      datasets: [
        { label: '投入量', data: investments, backgroundColor: 'rgba(55,138,221,0.45)', borderColor: '#378ADD', borderWidth: 1, pointRadius: 0, order: 1 },
        { label: '滿意度', data: satisfactionValues, backgroundColor: 'rgba(216,90,48,0.4)', borderColor: 'rgba(216,90,48,0.8)', borderWidth: 1, pointRadius: 0, order: 2 },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { r: { beginAtZero: true, suggestedMax: maxVal, ticks: { display: false }, pointLabels: { font: { size: 12 } } } },
    },
  });
}

// ---------- 輸入（訊息式輸入框）----------
function initEntryForm() {
  const picker = document.getElementById('dimensionPicker');
  buildDimensionPicker(picker, [DIMENSIONS[0]]);
  const dots = document.getElementById('intensityDots');
  buildIntensityDots(dots, null, 3);
  document.getElementById('en-date').value = todayStr();

  const textarea = document.getElementById('en-desc');
  const quickbar = document.getElementById('composerQuickbar');
  textarea.addEventListener('input', () => {
    if (textarea.value.trim().length > 0) quickbar.classList.add('open');
  });
  textarea.addEventListener('focus', () => {
    if (textarea.value.trim().length > 0) quickbar.classList.add('open');
  });

  document.getElementById('btnToggleDateField').addEventListener('click', () => {
    document.getElementById('composerExtra').classList.toggle('hidden');
  });

  document.getElementById('entryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!textarea.value.trim()) return;
    const selectedDims = getSelectedDimensions(picker);
    const payload = {
      dimensions: selectedDims,
      event_date: document.getElementById('en-date').value || todayStr(),
      description: textarea.value,
      intensity: Number(dots.dataset.value) || 3,
      tags: parseTagsInput(document.getElementById('en-tags').value || ''),
    };
    try {
      await api('/entries', { method: 'POST', body: JSON.stringify(payload) });
      showComposerToast(selectedDims[0]);
      textarea.value = '';
      document.getElementById('en-tags').value = '';
      document.getElementById('en-date').value = todayStr();
      quickbar.classList.remove('open');
      document.getElementById('composerExtra').classList.add('hidden');
      textarea.focus();
      await loadRecentEntries();
      await loadDashboard();
    } catch (err) {
      alert('儲存失敗：' + err.message);
    }
  });

  document.getElementById('btnPrevRecentWeek').addEventListener('click', () => { recentWeekOffset -= 1; loadRecentEntries(); });
  document.getElementById('btnNextRecentWeek').addEventListener('click', () => { recentWeekOffset += 1; loadRecentEntries(); });
}

// 送出後的小小回饋：對應向度的建築小圖示彈一下，模擬「城市馬上有反應」
function showComposerToast(dimension) {
  const toast = document.getElementById('composerToast');
  const level = (lastCumulative && lastCumulative[dimension] && lastCumulative[dimension].level) || 1;
  const svg = typeof buildingSVG === 'function' ? buildingSVG(dimension, level, 3) : '';
  toast.innerHTML = `<span class="composer-toast-icon">${svg}</span><span>${DIM_CONFIG[dimension].label} 長高了一點</span>`;
  toast.classList.remove('hidden');
  // 重新觸發動畫
  toast.style.animation = 'none';
  void toast.offsetWidth;
  toast.style.animation = '';
  clearTimeout(showComposerToast._t);
  showComposerToast._t = setTimeout(() => toast.classList.add('hidden'), 1800);
}

// 跟 lib/calc.js 的 periodRange('week', offset) 邏輯一致，純前端用來顯示標籤
function weekRangeLabel(offset) {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offset * 7);
  d.setHours(0, 0, 0, 0);
  const start = new Date(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (x) => `${x.getMonth() + 1}/${x.getDate()}`;
  if (offset === 0) return '本週';
  if (offset === -1) return `上週（${fmt(start)}-${fmt(end)}）`;
  if (offset === 1) return `下週（${fmt(start)}-${fmt(end)}）`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

let recentWeekOffset = 0;

async function loadRecentEntries() {
  document.getElementById('recentWeekLabel').textContent = weekRangeLabel(recentWeekOffset);
  const rows = await api(`/entries?week_offset=${recentWeekOffset}`);
  const list = document.getElementById('recentEntriesList');
  list.innerHTML = rows.map((r) => `
    <li>
      <span>${escapeHtml(r.description)}<div class="item-meta">${dimTags(r.dimensions)}${tagChips(r.tags)} · ${r.event_date.slice(0, 10)} · 投入 ${r.intensity} · ${r.satisfaction === null ? '尚未評滿意度' : '滿意 ' + r.satisfaction}</div></span>
      <span class="item-actions">
        <button data-edit-entry="${r.id}">編輯</button>
        <button data-delete-entry="${r.id}">刪除</button>
      </span>
    </li>
  `).join('') || '<li>這週還沒有紀錄。</li>';

  list.querySelectorAll('[data-delete-entry]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/entries/${btn.dataset.deleteEntry}`, { method: 'DELETE' });
      await loadRecentEntries();
      await loadDashboard();
    });
  });
  list.querySelectorAll('[data-edit-entry]').forEach((btn) => {
    const row = rows.find((r) => String(r.id) === btn.dataset.editEntry);
    btn.addEventListener('click', () => openEditModal(row));
  });
}

// ---------- 編輯紀錄 ----------
let editEntryId = null;

function openEditModal(entry) {
  editEntryId = entry.id;
  buildDimensionPicker(document.getElementById('editDimensionPicker'), entry.dimensions);
  document.getElementById('edit-date').value = entry.event_date.slice(0, 10);
  document.getElementById('edit-desc').value = entry.description;
  document.getElementById('edit-tags').value = (entry.tags || []).join(', ');
  buildIntensityDots(document.getElementById('editIntensityDots'), document.getElementById('edit-intensity-value'), Number(entry.intensity));
  document.getElementById('editModal').classList.remove('hidden');
}
document.getElementById('btnCancelEdit').addEventListener('click', () => {
  document.getElementById('editModal').classList.add('hidden');
});
document.getElementById('btnConfirmEdit').addEventListener('click', async () => {
  const picker = document.getElementById('editDimensionPicker');
  const dots = document.getElementById('editIntensityDots');
  try {
    await api(`/entries/${editEntryId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        dimensions: getSelectedDimensions(picker),
        event_date: document.getElementById('edit-date').value || todayStr(),
        description: document.getElementById('edit-desc').value,
        intensity: Number(dots.dataset.value) || 3,
        tags: parseTagsInput(document.getElementById('edit-tags').value || ''),
      }),
    });
    document.getElementById('editModal').classList.add('hidden');
    await loadRecentEntries();
    await loadDashboard();
  } catch (err) {
    alert('儲存失敗：' + err.message);
  }
});

// ---------- 滿意度（事後評分）----------
async function loadSatisfactionPage() {
  const rows = await api('/entries?unrated=true'); // event_date <= 今天的所有紀錄
  const container = document.getElementById('satisfactionByDate');

  if (rows.length === 0) {
    container.innerHTML = '<p class="panel-hint">目前沒有可以評分的紀錄。</p>';
    return;
  }

  const byDate = {};
  rows.forEach((r) => {
    const d = r.event_date.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  });
  const dates = Object.keys(byDate).sort().reverse();

  container.innerHTML = dates.map((d) => `
    <div class="satisfaction-date-group">
      <h3 class="satisfaction-date-label">${d}</h3>
      ${byDate[d].map((r) => `
        <div class="satisfaction-row" data-entry-id="${r.id}">
          <div class="satisfaction-row-desc">${escapeHtml(r.description)}<div class="item-meta">${dimTags(r.dimensions)}${tagChips(r.tags)} · 投入 ${r.intensity}</div></div>
          <div class="dot-scale-5 satisfaction-row-dots" data-value="${r.satisfaction || 0}">
            ${Array.from({ length: 5 }).map((_, i) => `<button type="button" class="dot-5 ${i < (r.satisfaction || 0) ? 'filled' : ''}" data-v="${i + 1}"></button>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  container.querySelectorAll('.satisfaction-row').forEach((row) => {
    const entryId = row.dataset.entryId;
    const dotsEl = row.querySelector('.satisfaction-row-dots');
    dotsEl.querySelectorAll('.dot-5').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const v = Number(btn.dataset.v);
        spawnRipple(btn);
        playSoftChime();
        try {
          await api(`/entries/${entryId}/satisfaction`, { method: 'PATCH', body: JSON.stringify({ satisfaction: v }) });
          dotsEl.dataset.value = v;
          dotsEl.querySelectorAll('.dot-5').forEach((d, idx) => d.classList.toggle('filled', idx < v));
          await loadDashboard();
        } catch (err) {
          alert('評分失敗：' + err.message);
        }
      });
    });
  });
}

// ---------- 城市（靜態 2.5D 插畫，點建築可看清單）----------
let lastCumulative = null;

async function loadCity() {
  const cumulative = await api('/cumulative');
  lastCumulative = cumulative;
  const dashboardData = await api('/dashboard?period=week&offset=0');
  const weeklyInvestments = {};
  DIMENSIONS.forEach((d) => { weeklyInvestments[d] = dashboardData.breakdown[d]?.investment || 0; });

  const container = document.getElementById('citySceneContainer');
  container.innerHTML = citySceneSVG(cumulative, weeklyInvestments);
  document.getElementById('buildingDetailPanel').classList.add('hidden');

  container.querySelectorAll('[data-dim]').forEach((el) => {
    el.addEventListener('click', () => openBuildingDetail(el.dataset.dim));
  });
}

async function openBuildingDetail(dim) {
  const panel = document.getElementById('buildingDetailPanel');
  const level = lastCumulative && lastCumulative[dim] ? lastCumulative[dim].level : 1;
  const satisfaction = lastCumulative && lastCumulative[dim] ? lastCumulative[dim].avgSatisfaction : 3;

  panel.classList.remove('hidden');
  document.getElementById('buildingDetailTitle').textContent = DIM_CONFIG[dim].label;
  document.getElementById('buildingDetailIcon').innerHTML = buildingSVG(dim, level, satisfaction);
  document.getElementById('buildingDetailLevel').textContent = `目前等級：${level} 樓 · 平均滿意度 ${satisfaction}`;
  detailMonthOffset = 0;
  await loadBuildingDetailEntries(dim);
}

function monthLabel(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

let detailDim = null;
let detailMonthOffset = 0;

async function loadBuildingDetailEntries(dim) {
  detailDim = dim;
  document.getElementById('buildingMonthLabel').textContent = monthLabel(detailMonthOffset);
  const entries = await api(`/entries?dimension=${dim}&month_offset=${detailMonthOffset}`);
  const list = document.getElementById('buildingDetailList');
  list.innerHTML = entries.map((e) => `
    <li><span>${escapeHtml(e.description)}<div class="item-meta">${dimTags(e.dimensions)}${tagChips(e.tags)} · ${e.event_date.slice(0, 10)} · 投入 ${e.intensity} · ${e.satisfaction === null ? '尚未評滿意度' : '滿意 ' + e.satisfaction}</div></span></li>
  `).join('') || '<li>這個月這個向度還沒有紀錄。</li>';

  const panel = document.getElementById('buildingDetailPanel');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('btnCloseBuildingDetail').addEventListener('click', () => {
  document.getElementById('buildingDetailPanel').classList.add('hidden');
});
document.getElementById('btnPrevBuildingMonth').addEventListener('click', () => {
  detailMonthOffset -= 1;
  loadBuildingDetailEntries(detailDim);
});
document.getElementById('btnNextBuildingMonth').addEventListener('click', () => {
  detailMonthOffset += 1;
  loadBuildingDetailEntries(detailDim);
});

// ---------- 隨手記 ----------
function initNotesForm() {
  document.getElementById('noteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('note-content');
    await api('/notes', { method: 'POST', body: JSON.stringify({ content: input.value }) });
    input.value = '';
    await loadNotes();
  });
}

async function loadNotes() {
  const all = await api('/notes');
  const untriaged = all.filter((n) => !n.triaged);
  const triaged = all.filter((n) => n.triaged);
  document.getElementById('untriagedCount').textContent = untriaged.length;

  document.getElementById('untriagedList').innerHTML = untriaged.map((n) => `
    <li>
      <span>${escapeHtml(n.content)}</span>
      <span class="item-actions">
        <button data-promote="${n.id}">轉為紀錄</button>
        <button data-triage="${n.id}">已整理</button>
      </span>
    </li>
  `).join('') || '<li>目前沒有待處理的想法。</li>';

  document.getElementById('triagedList').innerHTML = triaged.slice(0, 20).map((n) => `
    <li>
      <span>${escapeHtml(n.content)}<div class="item-meta">${(n.triaged_at || n.created_at).slice(0, 10)}</div></span>
      <button data-delete-note="${n.id}">刪除</button>
    </li>
  `).join('') || '<li>還沒有已整理的紀錄。</li>';

  document.querySelectorAll('[data-triage]').forEach((btn) => {
    btn.addEventListener('click', async () => { await api(`/notes/${btn.dataset.triage}/triage`, { method: 'PATCH' }); await loadNotes(); });
  });
  document.querySelectorAll('[data-delete-note]').forEach((btn) => {
    btn.addEventListener('click', async () => { await api(`/notes/${btn.dataset.deleteNote}`, { method: 'DELETE' }); await loadNotes(); });
  });
  document.querySelectorAll('[data-promote]').forEach((btn) => {
    btn.addEventListener('click', () => openPromoteModal(btn.dataset.promote));
  });
}

let promoteNoteId = null;

function openPromoteModal(noteId) {
  promoteNoteId = noteId;
  document.getElementById('promote-date').value = todayStr();
  document.getElementById('promoteModal').classList.remove('hidden');
}
document.getElementById('btnCancelPromote').addEventListener('click', () => {
  document.getElementById('promoteModal').classList.add('hidden');
});
document.getElementById('btnConfirmPromote').addEventListener('click', async () => {
  const picker = document.getElementById('promoteDimensionPicker');
  const dots = document.getElementById('promoteIntensityDots');
  try {
    await api(`/notes/${promoteNoteId}/promote`, {
      method: 'POST',
      body: JSON.stringify({
        dimensions: getSelectedDimensions(picker),
        event_date: document.getElementById('promote-date').value || todayStr(),
        intensity: Number(dots.dataset.value) || 3,
      }),
    });
    document.getElementById('promoteModal').classList.add('hidden');
    await loadNotes();
    await loadDashboard();
  } catch (err) {
    alert('轉換失敗：' + err.message);
  }
});

// ---------- 初始化 ----------
initTheme();
initTabs();
initPeriodControls();
initEntryForm();
initNotesForm();
buildDimensionPicker(document.getElementById('promoteDimensionPicker'), [DIMENSIONS[0]]);
buildIntensityDots(document.getElementById('promoteIntensityDots'), document.getElementById('promote-intensity-value'), 3);
loadDashboard();
