-- 留學生活儀表板 資料庫結構（v3 — 全新概念，取代舊版餘裕管理）

-- v3.5：投入與滿意度分開評分。投入(intensity)在輸入當下就有；滿意度(satisfaction)是事後才知道的，
-- 所以獨立成可為 NULL 的欄位，透過「滿意度」頁面事後評分。拿掉 kind(計畫/行動)這個概念。
-- v3.6：事情為主，分類(向度)可複選，改成 dimensions 陣列欄位。
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  dimensions TEXT[] NOT NULL DEFAULT '{}', -- 可複選，一件事可以同時屬於多個向度
  event_date DATE NOT NULL,
  description TEXT NOT NULL,
  intensity NUMERIC NOT NULL DEFAULT 3, -- 1-5，投入程度，輸入當下就填
  satisfaction NUMERIC, -- 1-5，滿意度，NULL 代表還沒評，事後在「滿意度」頁面填
  tags TEXT[] NOT NULL DEFAULT '{}', -- 向度底下的自由標籤，例如學習底下的「課堂」「自學」
  created_at TIMESTAMP DEFAULT now()
);

-- 舊版可能沒有 tags 欄位，補上去不影響既有資料
ALTER TABLE entries ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- 舊版可能有 NOT NULL 限制或 kind 欄位，放寬/清掉，不影響既有資料
ALTER TABLE entries ALTER COLUMN satisfaction DROP NOT NULL;
ALTER TABLE entries ALTER COLUMN satisfaction DROP DEFAULT;
ALTER TABLE entries DROP COLUMN IF EXISTS kind;

-- 從舊版單一 dimension 欄位遷移到可複選的 dimensions 陣列，不影響既有資料
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'dimension') THEN
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS dimensions TEXT[];
    UPDATE entries SET dimensions = ARRAY[dimension] WHERE dimensions IS NULL AND dimension IS NOT NULL;
    UPDATE entries SET dimensions = '{}' WHERE dimensions IS NULL;
    ALTER TABLE entries ALTER COLUMN dimensions SET DEFAULT '{}';
    ALTER TABLE entries ALTER COLUMN dimensions SET NOT NULL;
    ALTER TABLE entries DROP COLUMN dimension;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS quick_notes (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  triaged BOOLEAN DEFAULT FALSE,
  triaged_at TIMESTAMP
);

-- 「想做的事」清單，儀表板每天隨機挑一件出來提醒你
CREATE TABLE IF NOT EXISTS wishlist_items (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- v3.1：City 頁改成靜態 2.5D 插畫，不再需要真實地點座標，building_locations 表不再使用
-- （保留舊表不刪，避免舊部署升級時出錯；程式碼已不再讀寫它）
