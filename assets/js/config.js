/**
 * ตั้งค่าระบบ
 * --------------------------------------------------------------
 * API_URL : ใส่ URL ของ Google Apps Script Web App (ลงท้ายด้วย /exec)
 *           ถ้าปล่อยว่างไว้ ระบบจะทำงานใน "โหมดทดลอง" (เก็บข้อมูลใน Browser)
 */
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxtPQvY1o4vymFgGPOBTLGixKT1NMerIYrUDMCPKBuPZ0BCZGXckJAcOtmC3rYxrG7H/exec',
  APP_NAME: 'DCC',
  ORG_NAME: 'Document Control Center',
  MAX_FILE_MB: 25,
};
