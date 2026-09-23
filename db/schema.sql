-- 留學生活儀表板 資料庫結構（v3 — 全新概念，取代舊版餘裕管理）

-- 六個向度：learning / social / energy / economy / exploration / reflection
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  dimension VARCHAR(20) NOT NULL,
  event_date DATE NOT NULL,
  description TEXT NOT NULL,
  intensity NUMERIC NOT NULL DEFAULT 3, -- 1-5
  created_at TIMESTAMP DEFAULT now()
  -- 「事前已知的計畫」還是「行程外的行動」由 event_date 跟 created_at 的日期差自動判斷，
  -- 不另外存欄位：created_at 的日期 < event_date → 計畫（藍）；>= event_date → 行程外（橘）
);

CREATE TABLE IF NOT EXISTS quick_notes (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  triaged BOOLEAN DEFAULT FALSE,
  triaged_at TIMESTAMP
);

-- 六個向度各自在地圖上釘的一個真實地點（只需設定一次）
CREATE TABLE IF NOT EXISTS building_locations (
  dimension VARCHAR(20) PRIMARY KEY,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  place_name TEXT
);
