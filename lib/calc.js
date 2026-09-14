// 餘裕值核心計算邏輯
// 半衰期換算的衰減常數：fast ≈ 2天半衰期, medium ≈ 7天, slow ≈ 14天
const DECAY_K = { fast: 0.35, medium: 0.1, slow: 0.05 };

function daysBetween(from, to) {
  return Math.max(0, (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

// 回傳值 >0 代表負擔（扣分），<0 代表加成（加分）
function computeEventBurden(event, now = new Date()) {
  const created = new Date(event.created_at);
  const days = daysBetween(created, now);
  const initial = Number(event.initial_burden) || 0;

  switch (event.type) {
    case 'emotion': {
      const k = DECAY_K[event.decay_speed] || DECAY_K.medium;
      return initial * Math.exp(-k * days);
    }
    case 'progress': {
      const remaining = Math.max(0, 100 - Number(event.progress || 0)) / 100;
      return initial * remaining;
    }
    case 'staged': {
      const released = (event.milestones || [])
        .filter((m) => m.completed)
        .reduce((sum, m) => sum + Number(m.release_percent || 0), 0);
      return initial * Math.max(0, (100 - released) / 100);
    }
    case 'wish': {
      // 長期心願預設不計分，除非使用者主動標記「目前會焦慮」
      return event.anxious ? Math.min(initial, 8) : 0;
    }
    case 'effort': {
      // 主動做功加成：短期內快速淡化，回傳負值代表「加分」
      const k = DECAY_K[event.decay_speed] || DECAY_K.fast;
      return -initial * Math.exp(-k * days);
    }
    default:
      return 0;
  }
}

// 是否已經衰減/釋放到可視為結案（僅用於前端顯示淡出，不強制刪除資料）
function isEffectivelyResolved(event, now = new Date()) {
  const b = computeEventBurden(event, now);
  if (event.type === 'effort') return Math.abs(b) < 0.5;
  if (event.type === 'wish') return false;
  return Math.abs(b) < 0.5;
}

function computeMargin(events, untriagedNoteCount = 0, now = new Date()) {
  let burdenSum = 0;
  let boostSum = 0;
  const breakdown = {};

  for (const e of events) {
    if (e.status === 'resolved') continue;
    const b = computeEventBurden(e, now);
    const cat = e.category || '未分類';
    breakdown[cat] = (breakdown[cat] || 0) + b;
    if (b >= 0) burdenSum += b;
    else boostSum += -b;
  }

  const notesBurden = Math.min(15, untriagedNoteCount * 1.5);
  let margin = 100 - burdenSum + boostSum - notesBurden;
  margin = Math.max(0, Math.min(100, margin));

  return {
    margin: Math.round(margin * 10) / 10,
    burdenSum: Math.round(burdenSum * 10) / 10,
    boostSum: Math.round(boostSum * 10) / 10,
    notesBurden: Math.round(notesBurden * 10) / 10,
    breakdown,
  };
}

// 週規劃：依「預期發生日」推算下週每一天的預測餘裕曲線
// items: [{ title, category, initial_burden, decay_speed, expected_day_index (0=週一...6=週日) }]
function computePredictedWeek(items, weekStartDate) {
  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const curve = {};

  dayKeys.forEach((key, idx) => {
    const dayDate = new Date(weekStartDate);
    dayDate.setDate(dayDate.getDate() + idx);

    let burdenSum = 0;
    for (const item of items) {
      const expDate = new Date(weekStartDate);
      expDate.setDate(expDate.getDate() + (item.expected_day_index ?? 0));
      const k = DECAY_K[item.decay_speed] || DECAY_K.medium;
      const initial = Number(item.initial_burden) || 0;

      if (dayDate >= expDate) {
        const days = daysBetween(expDate, dayDate);
        burdenSum += initial * Math.exp(-k * days);
      } else {
        // 事件尚未發生：預期焦慮，給一個較小的固定前置負擔
        burdenSum += initial * 0.3;
      }
    }
    curve[key] = Math.round(Math.max(0, Math.min(100, 100 - burdenSum)) * 10) / 10;
  });

  return curve;
}

module.exports = {
  DECAY_K,
  computeEventBurden,
  computeMargin,
  computePredictedWeek,
  isEffectivelyResolved,
};
