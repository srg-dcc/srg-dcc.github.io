/* =============================================================
 * qr.js — สร้าง QR Code (ใช้ assets/vendor/qrcode.js, MIT License)
 * QR พื้นขาวตัวดำเสมอ (แม้โหมดมืด) เพื่อให้กล้องมือถือสแกนได้ง่าย
 * ============================================================= */

/** ลิงก์เต็มของหน้าในระบบ (คำนวณจากที่อยู่ปัจจุบัน ใช้ได้ทั้งเครื่องจริงและ GitHub Pages) */
function siteUrl(page, hash = '') {
  const u = new URL(page, location.href);
  u.search = '';
  u.hash = hash;
  return u.href;
}

function qrMake(text) {
  const qr = qrcode(0, 'M'); // ขนาดอัตโนมัติ, แก้ข้อผิดพลาดระดับ M (~15%)
  qr.addData(text);
  qr.make();
  return qr;
}

/** QR เป็น SVG — คมชัดทุกขนาด ทั้งบนจอและตอนพิมพ์ */
function qrSvg(text, size = 200, label = 'QR Code') {
  const qr = qrMake(text);
  const n = qr.getModuleCount();
  const pad = 2; // ขอบขาวรอบ QR (quiet zone)
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
    }
  }
  const w = n + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${escapeHtml(label)}">
    <rect width="${w}" height="${w}" fill="#ffffff"/><path d="${d}" fill="#0f172a"/></svg>`;
}

/** QR เป็นรูป PNG พร้อมข้อความใต้รูป (สำหรับดาวน์โหลด/ส่งต่อ) */
function qrPngDataUrl(text, caption = '') {
  const qr = qrMake(text);
  const n = qr.getModuleCount();
  const cell = Math.max(8, Math.floor(560 / n));
  const pad = cell * 3;
  const size = n * cell + pad * 2;
  const capH = caption ? 70 : 0;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size + capH;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#0f172a';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(pad + c * cell, pad + r * cell, cell, cell);
    }
  }
  if (caption) {
    ctx.fillStyle = '#0f172a';
    ctx.font = "600 30px 'IBM Plex Sans Thai', 'Noto Sans Thai', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(caption, size / 2, size + 30, size - 40);
  }
  return cv.toDataURL('image/png');
}

function downloadQrPng(text, caption, fileName) {
  const a = document.createElement('a');
  a.href = qrPngDataUrl(text, caption);
  // ชื่อไฟล์ภาษาไทยบาง Browser ไม่ยอมรับ (กลายเป็นชื่อ "download") จึงใช้อักษรอังกฤษ/ตัวเลขเท่านั้น
  a.download = String(fileName || 'DCC-QR.png').replace(/[^\w.-]+/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
}
