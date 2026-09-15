-- 餘裕管理 App 資料庫結構（v2）
-- type: acute(急性情緒/淡化型) / chronic(慢性壓力/進度型) / todo(待辦清單/單次型) / effort(完成清單加成型)

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  title TEXT NOT NULL,
  category VARCHAR(50) DEFAULT '未分類',
  initial_burden NUMERIC DEFAULT 10,
  decay_speed VARCHAR(10) DEFAULT 'medium', -- acute: fast/medium/long
  progress NUMERIC DEFAULT 0, -- chronic: 0-10（10點量表）
  event_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now(),
  resolved_at TIMESTAMP
);

-- 舊版可能沒有這個欄位，補上去且不影響既有資料
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_date DATE DEFAULT CURRENT_DATE;

CREATE TABLE IF NOT EXISTS quick_notes (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  triaged BOOLEAN DEFAULT FALSE,
  triaged_at TIMESTAMP
);

-- category: skill(專業技能力) / stamina(體力) / mental(精神穩定度)
--           knowledge(知識力) / life(生活穩定度) / economic(經濟力)
CREATE TABLE IF NOT EXISTS growth_stats (
  id SERIAL PRIMARY KEY,
  category VARCHAR(20) NOT NULL,
  amount NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_margin (
  date DATE PRIMARY KEY,
  margin NUMERIC,
  breakdown JSONB
);

CREATE TABLE IF NOT EXISTS weekly_plans (
  week_start DATE PRIMARY KEY,
  items JSONB,
  predicted_curve JSONB
);

-- category: growth(成長類) / explore(探索類) / relax(放鬆類)
CREATE TABLE IF NOT EXISTS suggestions (
  id SERIAL PRIMARY KEY,
  category VARCHAR(20) NOT NULL,
  title TEXT NOT NULL
);
