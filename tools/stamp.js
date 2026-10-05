/**
 * ใส่เลขเวอร์ชันให้ไฟล์ CSS/JS ในทุกหน้า HTML (เช่น assets/js/app.js?v=1a2b3c4d)
 * --------------------------------------------------------------
 * เลขเวอร์ชันคำนวณจากเนื้อไฟล์ ไฟล์เปลี่ยน → เลขเปลี่ยน → Browser โหลดไฟล์ใหม่ทันที
 * กันปัญหา Browser ใช้ไฟล์ JS/CSS เก่าที่จำไว้ คู่กับ HTML ใหม่ (หน้าเว็บพัง/ปุ่มหาย)
 * รันผ่าน: npm run build
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const hashOf = (rel) => crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 8);

const CHECK = process.argv.includes('--check'); // ตรวจอย่างเดียว ไม่แก้ไฟล์ (ใช้ก่อน commit)
let changed = 0;
for (const page of pages) {
  const file = path.join(ROOT, page);
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(/(href|src)="(assets\/[^"?#]+\.(?:css|js))(?:\?v=[^"]*)?"/g, (m, attr, rel) => {
    if (!fs.existsSync(path.join(ROOT, rel))) throw new Error(`${page}: ไม่พบไฟล์ ${rel}`);
    return `${attr}="${rel}?v=${hashOf(rel)}"`;
  });
  if (out !== src) {
    changed++;
    if (CHECK) console.error(`stamp: ${page} มีเลขเวอร์ชันไม่ตรงกับไฟล์ล่าสุด → รัน npm run stamp`);
    else fs.writeFileSync(file, out);
  }
}
if (CHECK && changed) process.exit(1);
console.log(`stamp: ${pages.length} pages checked, ${CHECK ? 'all up to date' : changed + ' updated'}`);
