# 餘裕 — 生活設計管理 App

個人餘裕管理工具：記錄煩惱與心願、每週規劃預測負擔曲線、餘裕超過 20% 時建議如何使用、追蹤長期投資（閱讀／運動／冥想）的累積成長。手機、電腦都能用同一個網址，資料存在 Render 的 PostgreSQL 裡。

## 功能對照

- **事件記錄**：情緒型（時間淡化）／進度型（如開戶）／分階段型（如諮商：會談完釋放 80%、記錄寫完再釋放 20%）／長期心願型（不計分，僅提醒）／主動做功加成（洗衣、看完一本書等，短期加分後淡化）
- **隨手記**：低摩擦捕捉腦中雜念，捕捉當下先釋放大半心理負擔，未整理的想法仍會佔一點點分數，提醒你找時間整理
- **每週規劃**：把下週已知行程輸進去，系統會用衰減公式預測本週每天的餘裕曲線
- **餘裕儀表板**：呼吸圓環顯示當下餘裕％、14 天趨勢圖、負擔來源分類
- **餘裕 > 20%** 時彈出建議卡，從成長類／探索類／放鬆類隨機挑一項（不做代幣兌換機制，純建議）
- **成長軸線**：閱讀 → 知識力、運動 → 體力、冥想 → 精神穩定度，長期累積可視化

## 部署到 Render（一次性設定）

1. 把這個資料夾推到你自己的 GitHub repo（新建一個 repo，`git init && git add . && git commit -m "init" && git push`）。
2. 登入 [Render](https://render.com) → 右上角 **New** → **Blueprint**。
3. 選擇你剛剛的 GitHub repo，Render 會讀取專案裡的 `render.yaml`，自動建立：
   - 一個 **Web Service**（跑 Node.js，`npm install` → `npm start`）
   - 一個 **PostgreSQL 資料庫**，並自動把連線字串填進 Web Service 的 `DATABASE_URL` 環境變數
4. 按下部署。伺服器啟動時會自動讀取 `db/schema.sql` 建表（用的是 `CREATE TABLE IF NOT EXISTS`，重複部署也安全），並自動塞入預設的活動建議清單。
5. 部署完成後，Render 會給你一個網址，例如 `https://margin-app-xxxx.onrender.com`，手機、電腦都用這個網址打開即可，記得加進手機主畫面方便使用。

免費方案的 Web Service 閒置一段時間會休眠，重新打開時第一次讀取會慢個幾秒，之後就正常。若想避免這個延遲，可以在 Render 把方案升級。

## 本機開發（選用）

若你想先在自己電腦跑起來測試：

```bash
npm install
export DATABASE_URL=postgres://使用者:密碼@localhost:5432/margin_app
npm start
```

打開 `http://localhost:3000` 即可。

## 之後想擴充時的入口

- 決定衰減公式的地方：`lib/calc.js`（`DECAY_K` 常數、`computeEventBurden`）
- 每週預測曲線邏輯：`lib/calc.js` 的 `computePredictedWeek`
- 活動建議清單：`lib/seed.js`
- 若要加自動化週期事件（例如「每週固定的諮商」自動生成），可以在 `events` 表的 `is_recurring` / `recurrence_rule` 欄位上加一支排程腳本，目前這版先讓你手動在每週規劃裡加入。
