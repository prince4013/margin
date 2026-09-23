-- 留學生活儀表板 資料庫結構（v3 — 全新概念，取代舊版餘裕管理）

-- 六個向度：learning / social / energy / economy / exploration / reflection
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  dimension VARCHAR(20) NOT NULL,
  event_date DATE NOT NULL,
  description TEXT NOT NULL,
  intensity NUMERIC NOT NULL DEFAULT 3, -- 1-5，投入程度
  satisfaction NUMERIC NOT NULL DEFAULT 3, -- 1-5，滿意度（不等於投入程度，兩者分開評）
  kind VARCHAR(10) NOT NULL DEFAULT 'action', -- 'plan'(計畫/行程，藍) 或 'action'(今日行動，橘)，輸入當下由使用者明確選擇
  created_at TIMESTAMP DEFAULT now()
);

-- 舊版可能沒有這些欄位，補上去且不影響既有資料
ALTER TABLE entries ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'action';
ALTER TABLE entries ADD COLUMN IF NOT EXISTS satisfaction NUMERIC NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS quick_notes (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  triaged BOOLEAN DEFAULT FALSE,
  triaged_at TIMESTAMP
);

-- v3.1：City 頁改成靜態 2.5D 插畫，不再需要真實地點座標，building_locations 表不再使用
-- （保留舊表不刪，避免舊部署升級時出錯；程式碼已不再讀寫它）
