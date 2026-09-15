// 餘裕值核心計算邏輯（v2）

// 急性情緒（淡化型）：對應的總點數／存續天數
const ACUTE_DOTS = { fast: 1, medium: 3, long: 7 };
// 完成清單（effort）加成的淡化速度，固定用中等速度，靠「輕盈程度」控制加成幅度
const EFFORT_K = 0.25; // 約 2-3 天內淡化完畢

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(from, to) {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// 是否已經到了自動刪除的時間點（僅適用於 acute 型）
function isAcuteExpired(event, now = new Date()) {
  if (event.type !== 'acute') return false;
  const totalDots = ACUTE_DOTS[event.decay_speed] || ACUTE_DOTS.medium;
  const daysPassed = daysBetween(event.event_date, now);
  return daysPassed >= totalDots;
}

// acute 型目前已經填滿的點數（用於畫面呈現）
function acuteDotsFilled(event, now = new Date()) {
  const totalDots = ACUTE_DOTS[event.decay_speed] || ACUTE_DOTS.medium;
  const daysPassed = Math.max(0, daysBetween(event.event_date, now));
  return { totalDots, filled: Math.min(totalDots, daysPassed) };
}

// 回傳值 >0 代表負擔（扣分），<0 代表加成（加分）
function computeEventBurden(event, now = new Date()) {
  const initial = Number(event.initial_burden) || 0;

  switch (event.type) {
    case 'acute': {
      const { totalDots, filled } = acuteDotsFilled(event, now);
      const remainFraction = Math.max(0, (totalDots - filled) / totalDots);
      return initial * remainFraction;
    }
    case 'chronic': {
      const dots = Number(event.progress || 0); // 0-10
      const remainFraction = Math.max(0, (10 - dots) / 10);
      return initial * remainFraction;
    }
    case 'todo': {
      return initial; // 單次型：解決前固定負擔，解決後從 active 事件中移除
    }
    case 'effort': {
      const days = Math.max(0, daysBetween(event.event_date, now));
      return -initial * Math.exp(-EFFORT_K * days);
    }
    default:
      return 0;
  }
}

// 隨手記：每筆未整理想法佔用的負擔分數、以及整體上限（想調整就改這兩個數字）
const NOTE_BURDEN_PER_ITEM = 1.5;
const NOTE_BURDEN_CAP = 15;

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

  const notesBurden = Math.min(NOTE_BURDEN_CAP, untriagedNoteCount * NOTE_BURDEN_PER_ITEM);
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

// 本週規劃：items 帶有實際日期(event_date)，計算週一到週日每天的「預期負擔量」
// 數值越大代表當天負擔越重（直接呈現負擔，不是餘裕）
function computeWeeklyBurdenHistogram(items, weekStartDate) {
  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const histogram = {};

  dayKeys.forEach((key, idx) => {
    const dayDate = new Date(weekStartDate);
    dayDate.setDate(dayDate.getDate() + idx);

    let burdenSum = 0;
    for (const item of items) {
      const evDate = new Date(item.event_date);
      const initial = Number(item.initial_burden) || 0;
      const totalDots = ACUTE_DOTS[item.decay_speed] || ACUTE_DOTS.medium;
      const daysDiff = daysBetween(evDate, dayDate);

      if (daysDiff < 0) {
        // 事件尚未發生：預期焦慮，給較小的前置負擔
        burdenSum += initial * 0.3;
      } else if (daysDiff < totalDots) {
        const filled = daysDiff;
        burdenSum += initial * Math.max(0, (totalDots - filled) / totalDots);
      }
      // daysDiff >= totalDots：已淡化完畢，不計入
    }
    histogram[key] = Math.round(burdenSum * 10) / 10;
  });

  return histogram;
}

module.exports = {
  ACUTE_DOTS,
  daysBetween,
  computeEventBurden,
  computeMargin,
  computeWeeklyBurdenHistogram,
  isAcuteExpired,
  acuteDotsFilled,
};
