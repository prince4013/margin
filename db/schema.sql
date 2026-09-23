-- 留學生活儀表板 資料庫結構（v3 — 全新概念，取代舊版餘裕管理）

-- v3.5：投入與滿意度分開評分。投入(intensity)在輸入當下就有；滿意度(satisfaction)是事後才知道的，
-- 所以獨立成可為 NULL 的欄位，透過「滿意度」頁面事後評分。拿掉 kind(計畫/行動)這個概念。
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  dimension VARCHAR(20) NOT NULL,
  event_date DATE NOT NULL,
  description TEXT NOT NULL,
  intensity NUMERIC NOT NULL DEFAULT 3, -- 1-5，投入程度，輸入當下就填
  satisfaction NUMERIC, -- 1-5，滿意度，NULL 代表還沒評，事後在「滿意度」頁面填
  created_at TIMESTAMP DEFAULT now()
);

-- 舊版可能有 NOT NULL 限制或 kind 欄位，放寬/清掉，不影響既有資料
ALTER TABLE entries ALTER COLUMN satisfaction DROP NOT NULL;
ALTER TABLE entries ALTER COLUMN satisfaction DROP DEFAULT;
ALTER TABLE entries DROP COLUMN IF EXISTS kind;

CREATE TABLE IF NOT EXISTS quick_notes (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  triaged BOOLEAN DEFAULT FALSE,
  triaged_at TIMESTAMP
);

-- v3.1：City 頁改成靜態 2.5D 插畫，不再需要真實地點座標，building_locations 表不再使用
-- （保留舊表不刪，避免舊部署升級時出錯；程式碼已不再讀寫它）
