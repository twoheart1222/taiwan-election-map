# 網站部署與後台設定教學

## 1. 檔案結構

把這幾個檔案放在同一個資料夾（例如要放到 GitHub Pages 的話就是 repo 根目錄）：

```
index.html
admin.html
data/
  counties.json
  towns/
    towns-63000.json
    towns-65000.json
    ...（共 22 個檔案，一個縣市一個）
  villages/
    villages-63000070.json
    villages-63000010.json
    ...（共 368 個檔案，一個鄉鎮市區一個）
```

`data/` 資料夾請直接解壓縮附上的 `data.zip`，路徑要跟上面一樣（`index.html` 是用相對路徑 `./data/...` 抓資料的）。

## 2. 為什麼改成這種結構（對應你說的載入太慢問題）

原本整包 `taiwan_data.json` 大約 2.8MB，村里資料要一次全部下載完才能顯示地圖。現在改成分層延遲載入：

- 開站只載入 `data/counties.json`（約 210KB，22 個縣市的邊界+候選人資料）
- 點一個縣市，才去抓該縣市的 `data/towns/towns-{縣市代碼}.json`（幾 KB 到十幾 KB）
- 點一個鄉鎮市區，才去抓該鄉鎮市區的 `data/villages/villages-{鄉鎮市區代碼}.json`（幾 KB）

跟你提供的 kiang/vote2026 是同樣的「分層小檔案、按需載入」精神，只是我把候選人資料直接內嵌在對應層級的邊界檔案裡（而不是像該專案一樣每個村里存一個檔案），這樣點擊一個縣市/鄉鎮市區只需要一次 fetch，邊界圖形跟候選人名冊一起拿到，減少 HTTP 請求數。

## 3. 地圖互動方式

- 一開始顯示全台 22 縣市的邊界（可點擊）。
- 點一個縣市 → 放大聚焦、顯示該縣市底下的鄉鎮市區邊界（可點擊）、右側抽屜顯示首長候選人。
- 點一個鄉鎮市區 → 放大聚焦、顯示該區底下的村里邊界（可點擊）、右側抽屜顯示鄉鎮市長/區長候選人。
- 點一個村里 → 右側抽屜顯示村里長候選人。
- 左上角麵包屑（全台灣 > 縣市 > 鄉鎮市區）可以點回上一層；右上角下拉選單效果相同，是給想直接搜尋跳轉的人用的捷徑。

邊界圖資來源：內政部國土測繪中心公開圖資（村里/鄉鎮市區/縣市界線），經簡化後轉為 TopoJSON。

## 4. Firebase 後台設定

### 4.1 建立 Firebase 專案

1. 前往 https://console.firebase.google.com/ → 新增專案。
2. 專案設定 → 你的應用程式 → 新增網頁應用程式 → 複製 `firebaseConfig`。

### 4.2 貼上設定值

`index.html` 和 `admin.html` 裡都各有一段 `firebaseConfig = { apiKey: "YOUR_API_KEY", ... }`，換成你剛剛複製的真實設定值（兩個檔案要貼一樣的）。

### 4.3 開啟 Google 登入

Authentication → Sign-in method → 啟用「Google」。

### 4.4 建立 Firestore 資料庫

Firestore Database → 建立資料庫 → 正式環境模式 → 選 `asia-east1`。

### 4.5 安全規則

Firestore Database → 規則，貼上並發布：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /overrides/{docId} {
      allow read: if true;
      allow write: if request.auth != null &&
        exists(/databases/$(database)/documents/admins/$(request.auth.token.email));
    }

    match /admins/{email} {
      allow read: if request.auth != null && request.auth.token.email == email;
      allow write: if false;
    }
  }
}
```

### 4.6 新增管理者帳號

Firestore Database → 資料 → 新增集合 `admins` → 文件 ID 填管理者的 Google 信箱（例如 `you@gmail.com`）→ 隨意加一個欄位（例如 `role: "editor"`）→ 儲存。之後要加其他管理者，同樣在 `admins` 底下新增一筆文件即可。

### 4.7 覆寫資料怎麼存的

`overrides` collection 裡每筆文件的 ID 就是被編輯節點的官方行政區代碼：
- 縣市層級：5 碼縣市代碼（例如 `63000` = 臺北市）
- 鄉鎮市區層級：8 碼代碼（例如 `63000070` = 臺北市萬華區）
- 村里層級：11 碼代碼（例如 `63000070015`）

後台頁面選單裡選到哪一層、代碼是什麼，畫面上「代碼：」那行都會顯示出來，方便對照。

## 5. 資料範圍與已知限制

- **候選人資料**：完整涵蓋 9 種 115 年（2026）選舉類型 — 直轄市/縣市長、直轄市/縣市議員（依選舉區分組）、鄉鎮市長、鄉鎮市民代表（依選舉區分組）、山地原住民區長／區民代表、村里長 — 共 22 縣市、368 鄉鎮市區、約 8,044 村里，全部來自你提供的中選會官方登記彙總表 PDF。
- **地理邊界**：改用較新版本的內政部國土測繪中心村里/鄉鎮市區/縣市界線圖資（經社群轉換為 TopoJSON），涵蓋度比第一版用的 2010 年圖資更好，包含先前缺漏的烏坵鄉、頭份市/員林市（2015 年改制）等。約 96% 的村里能對應到正確邊界並顯示候選人名冊；其餘約 4%（多為近年行政區調整、少數生僻字在圖資中呈現異常）村里仍有邊界可顯示，但候選人名冊留空（顯示「審定中」），可透過後台手動補上。
- **選舉人口 / 應選席次**：官方登記表沒有這兩項資料，目前留空（顯示「--」），可透過後台在縣市層級手動填入。
- **選舉公報連結**：中選會尚未公布，目前全部留空，公布後可透過後台逐筆補上連結。
