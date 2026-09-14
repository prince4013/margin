-- 餘裕管理 App 資料庫結構
-- type: emotion(情緒型) / progress(進度型) / staged(分階段型，如諮商) / wish(長期心願型) / effort(主動做功加成型)

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  title TEXT NOT NULL,
  category VARCHAR(50) DEFAULT '未分類',
  initial_burden NUMERIC DEFAULT 10,
  decay_speed VARCHAR(10) DEFAULT 'medium', -- fast / medium / slow
  progress NUMERIC DEFAULT 0,
  anxious BOOLEAN DEFAULT FALSE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active', -- active / resolved
  created_at TIMESTAMP DEFAULT now(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS milestones (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  label TEXT,
  release_percent NUMERIC,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quick_notes (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  triaged BOOLEAN DEFAULT FALSE,
  triaged_at TIMESTAMP
);

-- category: knowledge(知識力) / stamina(體力) / mental(精神穩定度)
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
