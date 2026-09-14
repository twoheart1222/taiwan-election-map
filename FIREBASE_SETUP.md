# 後台管理設定教學（Firebase）

`index.html`（公開地圖）與 `admin.html`（後台）都需要連到同一個 Firebase 專案。步驟如下：

## 1. 建立 Firebase 專案

1. 前往 https://console.firebase.google.com/ → 新增專案 → 依畫面指示建立（可以不啟用 Google Analytics）。
2. 專案建立後，左上「專案總覽」旁齒輪 → **專案設定** → 往下捲到「你的應用程式」→ 點擊 `</>`（網頁）圖示 → 註冊一個網頁應用程式（不需要勾 Firebase Hosting）。
3. 會看到一組 `firebaseConfig` 物件，把它複製起來。

## 2. 貼上設定值

`index.html` 和 `admin.html` 裡都各有一段：

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

把兩個檔案裡的這段換成你剛剛複製的真實設定值（兩個檔案要貼一樣的）。

## 3. 開啟 Google 登入

Firebase Console → 左側選單 **Authentication** → 開始使用 → **Sign-in method** 分頁 → 啟用「Google」提供者 → 儲存。

## 4. 建立 Firestore 資料庫

Firebase Console → 左側選單 **Firestore Database** → 建立資料庫 → 選「以正式環境模式啟動」（production mode）→ 選一個離台灣近的地區（例如 `asia-east1`）。

## 5. 設定安全規則（重要）

Firestore Database → **規則** 分頁，貼上以下內容並發布：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // overrides：公開網站要讀取，只有已授權管理者能寫入
    match /overrides/{docId} {
      allow read: if true;
      allow write: if request.auth != null &&
        exists(/databases/$(database)/documents/admins/$(request.auth.token.email));
    }

    // admins：只允許本人查詢自己是否在管理名單中，任何人都不能寫入
    match /admins/{email} {
      allow read: if request.auth != null && request.auth.token.email == email;
      allow write: if false;
    }
  }
}
```

## 6. 新增管理者帳號

Firestore Database → 資料分頁 → 開始建立集合 → 集合 ID 填 `admins` → 文件 ID 填**管理者的完整 Google 信箱**（例如 `you@gmail.com`），文件內容隨意加一個欄位即可，例如 `role: "editor"` → 儲存。

之後要新增其他管理者，只要在 `admins` collection 底下再新增一筆「文件 ID = 該信箱」的文件即可（不需要改程式碼）。

## 7. 完成

把 `index.html`、`admin.html`、`taiwan_data.json` 一起部署（例如 GitHub Pages）。用授權過的 Google 帳號打開 `admin.html` 右上角登入，就能編輯候選人資料、選舉人口、應選席次；存檔後 `index.html` 會自動讀到最新內容。

---

### 資料範圍與已知限制

- **候選人資料**：完整涵蓋 9 種 115 年（2026）選舉類型 — 直轄市/縣市長、直轄市/縣市議員（依選舉區分組）、鄉鎮市長、鄉鎮市民代表（依選舉區分組）、山地原住民區長／區民代表、村里長 — 共 22 縣市、374 鄉鎮市區、7,856 村里，全部來自你提供的中選會官方登記彙總表 PDF。
- **地理座標**：來自公開圖資（2010 年版村里界線，經 centroid 運算）。約 94.6% 村里能精確對應到目前的村里名稱；其餘約 5.4%（多為 2010 年後因行政區調整而改名/合併的村里）會退回使用所屬鄉鎮市區的座標，地圖位置仍在正確的鄉鎮市區範圍內，但不是該村里的精確中心點。若之後想提高精確度，可依你原本的構想，到政府資料開放平台下載最新一版「村里界線」SHP，用 Mapshaper 簡化後重新產生座標對照表。
- **選舉人口 / 應選席次**：官方登記表沒有這兩項資料，目前留空（顯示「--」），可透過後台在縣市層級手動填入。
- **選舉公報連結**：中選會尚未公布，目前全部留空，公布後可透過後台逐筆補上連結。
