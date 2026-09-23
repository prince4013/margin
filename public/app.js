const API = '/api';
const DIMENSIONS = Object.keys(DIM_CONFIG); // from buildings.js

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
      if (view === 'satisfaction') loadSatisfactionPage();
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
    <button type="button" class="dim-btn ${d === container.dataset.selected ? 'active' : ''}" data-dim="${d}">${DIM_CONFIG[d].labelEn}</button>
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
    const investments = DIMENSIONS.map((d) => data.breakdown[d]?.investment || 0);
    const satisfactionSums = DIMENSIONS.map((d) => data.breakdown[d]?.satisfactionSum || 0);

    renderHexChart(labels, investments, satisfactionSums);

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
}

function renderHexChart(labels, investments, satisfactionSums) {
  const ctx = document.getElementById('hexChart');
  if (typeof Chart === 'undefined') return;
  if (hexChart) hexChart.destroy();
  const maxVal = Math.max(10, ...investments, ...satisfactionSums);
  hexChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        { label: '投入量', data: investments, backgroundColor: 'rgba(55,138,221,0.35)', borderColor: '#378ADD', borderWidth: 1, pointRadius: 0 },
        { label: '滿意度', data: satisfactionSums, backgroundColor: 'rgba(216,90,48,0.3)', borderColor: 'rgba(216,90,48,0.6)', borderWidth: 1, pointRadius: 0 },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { r: { beginAtZero: true, suggestedMax: maxVal, ticks: { display: false }, pointLabels: { font: { size: 12 } } } },
    },
  });
}

// ---------- 輸入 ----------
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
  list.innerHTML = rows.slice(0, 30).map((r) => `
    <li>
      <span>${escapeHtml(r.description)}<div class="item-meta">${DIM_CONFIG[r.dimension].labelEn} · ${r.event_date.slice(0, 10)} · 投入 ${r.intensity} · ${r.satisfaction === null ? '尚未評滿意度' : '滿意 ' + r.satisfaction}</div></span>
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
          <div class="satisfaction-row-desc">${escapeHtml(r.description)}<div class="item-meta">${DIM_CONFIG[r.dimension].labelEn} · 投入 ${r.intensity}</div></div>
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
  const container = document.getElementById('citySceneContainer');
  container.innerHTML = citySceneSVG(cumulative);
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

  const entries = await api(`/entries?dimension=${dim}`);
  const list = document.getElementById('buildingDetailList');
  list.innerHTML = entries.map((e) => `
    <li><span>${escapeHtml(e.description)}<div class="item-meta">${e.event_date.slice(0, 10)} · 投入 ${e.intensity} · ${e.satisfaction === null ? '尚未評滿意度' : '滿意 ' + e.satisfaction}</div></span></li>
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
    document.getElementById('citySceneContainer').innerHTML = '';
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
