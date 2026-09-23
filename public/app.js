const API = '/api';
const DIMENSIONS = Object.keys(DIM_CONFIG); // from buildings.js
const GLASGOW = [55.8642, -4.2518];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
      if (view === 'city') loadCity();
      if (view === 'notes') loadNotes();
      if (view === 'dashboard') loadDashboard();
    });
  });
}

// ---------- 共用元件：向度選擇器 / 5 點強度量表 ----------
function buildDimensionPicker(container, defaultDim) {
  container.dataset.selected = defaultDim || DIMENSIONS[0];
  container.innerHTML = DIMENSIONS.map((d) => `
    <button type="button" class="dim-btn ${d === container.dataset.selected ? 'active' : ''}" data-dim="${d}">${DIM_CONFIG[d].label}</button>
  `).join('');
  container.querySelectorAll('.dim-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.dataset.selected = btn.dataset.dim;
      container.querySelectorAll('.dim-btn').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
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
    const totals = DIMENSIONS.map((d) => data.breakdown[d]?.total || 0);
    const blues = DIMENSIONS.map((d) => data.breakdown[d]?.blue || 0);

    renderHexChart(labels, totals, blues);

    const card = document.getElementById('imbalanceCard');
    if (data.imbalance) {
      card.classList.remove('hidden');
      document.getElementById('imbalanceText').textContent =
        `這期 ${DIM_CONFIG[data.imbalance.overloaded].label} 佔了 ${data.imbalance.overloadedShare}%，${DIM_CONFIG[data.imbalance.neglected].label} 幾乎掛零，要不要留點時間補回來？`;
    } else {
      card.classList.add('hidden');
    }
  } catch (err) {
    console.error('讀取儀表板失敗', err);
  }
}

function renderHexChart(labels, totals, blues) {
  const ctx = document.getElementById('hexChart');
  if (typeof Chart === 'undefined') return;
  if (hexChart) hexChart.destroy();
  const maxVal = Math.max(10, ...totals, ...blues);
  hexChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        { label: '總投入', data: totals, backgroundColor: 'rgba(216,90,48,0.25)', borderColor: '#D85A30', borderWidth: 1, pointRadius: 0 },
        { label: '既定計畫', data: blues, backgroundColor: 'rgba(55,138,221,0.35)', borderColor: '#378ADD', borderWidth: 1, pointRadius: 0 },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { r: { beginAtZero: true, suggestedMax: maxVal, ticks: { display: false }, pointLabels: { font: { size: 12 } } } },
    },
  });
}

// ---------- 手動輸入 ----------
function initEntryForm() {
  const picker = document.getElementById('dimensionPicker');
  buildDimensionPicker(picker, DIMENSIONS[0]);
  const dots = document.getElementById('intensityDots');
  buildIntensityDots(dots, document.getElementById('en-intensity-value'), 3);
  document.getElementById('en-date').value = todayStr();

  document.getElementById('entryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      dimension: picker.dataset.selected,
      event_date: document.getElementById('en-date').value || todayStr(),
      description: document.getElementById('en-desc').value,
      intensity: Number(dots.dataset.value) || 3,
    };
    try {
      await api('/entries', { method: 'POST', body: JSON.stringify(payload) });
      document.getElementById('en-desc').value = '';
      document.getElementById('en-date').value = todayStr();
      await loadRecentEntries();
      await loadDashboard();
    } catch (err) {
      alert('儲存失敗：' + err.message);
    }
  });
}

async function loadRecentEntries() {
  const rows = await api('/entries');
  const list = document.getElementById('recentEntriesList');
  list.innerHTML = rows.slice(0, 20).map((r) => `
    <li>
      <span>${escapeHtml(r.description)}<div class="item-meta">${DIM_CONFIG[r.dimension].label} · ${r.event_date.slice(0, 10)} · 強度 ${r.intensity}</div></span>
      <button data-delete-entry="${r.id}">刪除</button>
    </li>
  `).join('') || '<li>還沒有紀錄。</li>';

  list.querySelectorAll('[data-delete-entry]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/entries/${btn.dataset.deleteEntry}`, { method: 'DELETE' });
      await loadRecentEntries();
      await loadDashboard();
    });
  });
}

// ---------- 城市 ----------
let cityMap;
let setupQueue = [];
let setupIndex = 0;

async function loadCity() {
  const locations = await api('/building-locations');
  const missing = DIMENSIONS.filter((d) => !locations[d]);

  if (missing.length > 0) {
    setupQueue = missing;
    setupIndex = 0;
    document.getElementById('citySetupPanel').classList.remove('hidden');
    startCitySetupMap(locations);
  } else {
    document.getElementById('citySetupPanel').classList.add('hidden');
    await renderCityBuildings(locations);
  }
}

function ensureMap() {
  if (cityMap) return cityMap;
  cityMap = L.map('cityMap').setView(GLASGOW, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(cityMap);
  return cityMap;
}

function clearMapLayers() {
  const map = ensureMap();
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) map.removeLayer(layer);
  });
}

function startCitySetupMap() {
  const map = ensureMap();
  clearMapLayers();
  document.getElementById('setupDimensionLabel').textContent = DIM_CONFIG[setupQueue[setupIndex]].label;

  map.off('click');
  map.on('click', async (e) => {
    const dim = setupQueue[setupIndex];
    try {
      await api('/building-locations', {
        method: 'POST',
        body: JSON.stringify({ dimension: dim, lat: e.latlng.lat, lng: e.latlng.lng }),
      });
      setupIndex += 1;
      if (setupIndex >= setupQueue.length) {
        await loadCity();
      } else {
        document.getElementById('setupDimensionLabel').textContent = DIM_CONFIG[setupQueue[setupIndex]].label;
      }
    } catch (err) {
      alert('儲存地點失敗：' + err.message);
    }
  });
}

async function renderCityBuildings(locations) {
  const map = ensureMap();
  clearMapLayers();
  const cumulative = await api('/cumulative');

  DIMENSIONS.forEach((dim) => {
    const loc = locations[dim];
    if (!loc) return;
    const level = cumulative[dim]?.level || 1;
    const svg = buildingSVG(dim, level);
    const icon = L.divIcon({
      html: `<div style="text-align:center;"><div class="map-building-icon" style="width:34px;height:${Math.round(34 * (220 / 100))}px;margin:0 auto;">${svg}</div><div class="map-building-label">${DIM_CONFIG[dim].label}・${level}樓</div></div>`,
      className: '',
      iconSize: [80, 100],
      iconAnchor: [40, 95],
    });
    const marker = L.marker([Number(loc.lat), Number(loc.lng)], { icon }).addTo(map);
    marker.on('click', () => openBuildingDetail(dim, level));
  });

  const coords = DIMENSIONS.map((d) => locations[d]).filter(Boolean).map((l) => [Number(l.lat), Number(l.lng)]);
  if (coords.length > 0) map.fitBounds(coords, { padding: [40, 40], maxZoom: 15 });
}

async function openBuildingDetail(dim, level) {
  const panel = document.getElementById('buildingDetailPanel');
  panel.classList.remove('hidden');
  document.getElementById('buildingDetailTitle').textContent = DIM_CONFIG[dim].label;
  document.getElementById('buildingDetailIcon').innerHTML = buildingSVG(dim, level);
  document.getElementById('buildingDetailLevel').textContent = `目前等級：${level} 樓`;

  const entries = await api(`/entries?dimension=${dim}`);
  const list = document.getElementById('buildingDetailList');
  list.innerHTML = entries.map((e) => `
    <li><span>${escapeHtml(e.description)}<div class="item-meta">${e.event_date.slice(0, 10)} · 強度 ${e.intensity}</div></span></li>
  `).join('') || '<li>這個向度還沒有紀錄。</li>';

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('btnCloseBuildingDetail').addEventListener('click', () => {
  document.getElementById('buildingDetailPanel').classList.add('hidden');
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
  `).join('') || '<li>目前沒有待整理的想法。</li>';

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
        dimension: picker.dataset.selected,
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

// ---------- 清空測試資料 ----------
document.getElementById('btnResetTestData').addEventListener('click', async () => {
  if (!confirm('確定要清空所有紀錄、隨手記與地點設定嗎？這個動作無法復原。')) return;
  if (!confirm('再次確認：真的要全部清空嗎？')) return;
  try {
    await api('/reset-test-data', { method: 'POST' });
    cityMap = null;
    document.getElementById('cityMap').innerHTML = '';
    alert('已清空所有測試資料。');
    await loadDashboard();
  } catch (err) {
    alert('清空失敗：' + err.message);
  }
});

// ---------- 初始化 ----------
initTheme();
initTabs();
initPeriodControls();
initEntryForm();
initNotesForm();
buildDimensionPicker(document.getElementById('promoteDimensionPicker'), DIMENSIONS[0]);
buildIntensityDots(document.getElementById('promoteIntensityDots'), document.getElementById('promote-intensity-value'), 3);
loadDashboard();
