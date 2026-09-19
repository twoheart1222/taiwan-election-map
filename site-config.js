/* 站台設定：日後更換網域，只需要改這個檔案。
 *
 * ELECTION_API_BASE：election-api Worker 的網址。
 *   - 之後把 API 綁到自己網域的同一個 origin（例如 formosawatch.tw/api/*）時，改成空字串 ''，
 *     前端就會用同網域相對路徑呼叫，不再出現任何 workers.dev 網址。
 * 已快取的照片一律以相對路徑 /api/photo/<hash> 存放，顯示時才套用這個網址。
 */
window.ELECTION_API_BASE = 'https://election-api.uprisevideoproduction.workers.dev';
window.SITE_CONTACT_EMAIL = 'hello@formosawatch.tw';
window.SITE_DATA_EMAIL = 'data@formosawatch.tw';
