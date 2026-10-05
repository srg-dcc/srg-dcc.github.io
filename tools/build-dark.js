/**
 * สร้าง assets/css/dark.css จาก assets/css/tailwind.css อัตโนมัติ
 * --------------------------------------------------------------
 * อ่านทุก class สีของ Tailwind ที่หน้าเว็บใช้ แล้วสร้างสีสำหรับโหมดมืด (html.dark) ตามกฎ:
 *   - พื้นขาว/เทาอ่อน → พื้นเข้ม, ตัวอักษรเข้ม → ตัวอักษรสว่าง
 *   - พื้นสีอ่อน (เช่น teal-50) → สีเดียวกันแบบเข้มโปร่งแสง, ตัวอักษรสีเข้ม (teal-700) → สีสว่างขึ้น (teal-300)
 *   - สีเข้มของปุ่ม (เช่น teal-600) และตัวอักษรขาวบนปุ่ม คงเดิม
 * รันผ่าน: npm run build:css
 */
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const colors = require('tailwindcss/colors');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets/css/tailwind.css');
const OUT = path.join(ROOT, 'assets/css/dark.css');

// ---------- ตาราง rgb → { family, shade } ----------
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lookup = new Map();
const FAMILIES = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
for (const fam of FAMILIES) {
  for (const [shade, hex] of Object.entries(colors[fam] || {})) {
    const key = hexToRgb(hex).join(' ');
    if (!lookup.has(key)) lookup.set(key, { family: fam, shade: Number(shade) });
  }
}
lookup.set('255 255 255', { family: 'white' });
const rgbOf = (fam, shade) => hexToRgb(colors[fam][shade]).join(' ');
const NEUTRAL = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone']);

// ---------- กฎการแปลงสี ----------
// kind: bg | text | line (border/ring/divide/outline)
function darkOf(info, kind) {
  const { family, shade } = info;
  if (family === 'white') {
    if (kind === 'text') return null; // ตัวอักษรขาวบนปุ่มสี คงเดิม
    return { rgb: rgbOf('slate', 900) }; // พื้นขาว → พื้นการ์ดเข้ม
  }
  if (NEUTRAL.has(family)) {
    const map = {
      bg: { 50: [800, 0.55], 100: [800, 1], 200: [700, 1], 300: [600, 1], 400: [500, 1] },
      text: { 900: 50, 800: 100, 700: 200, 600: 300, 500: 400, 400: 500, 300: 600, 200: 700, 100: 800 },
      line: { 50: 800, 100: 800, 200: 700, 300: 600, 400: 500 },
    }[kind];
    const m = map[shade];
    if (m === undefined) return null;
    if (kind === 'bg') return { rgb: rgbOf(family, m[0]), alpha: m[1] };
    return { rgb: rgbOf(family, m) };
  }
  // สีเน้น (teal, amber, rose, ...)
  if (kind === 'bg') {
    const m = { 50: [950, 0.45], 100: [900, 0.55], 200: [800, 0.6], 300: [700, 1] }[shade];
    return m ? { rgb: rgbOf(family, m[0]), alpha: m[1] } : null;
  }
  if (kind === 'text') {
    const m = { 900: 100, 800: 200, 700: 300, 600: 400, 500: 400 }[shade];
    return m ? { rgb: rgbOf(family, m) } : null;
  }
  const m = { 50: 900, 100: 900, 200: 800, 300: 700 }[shade];
  return m ? { rgb: rgbOf(family, m) } : null;
}

const KIND = (prop) => {
  if (prop === 'background-color') return 'bg';
  if (prop === 'color' || prop === 'fill' || prop === 'stroke') return 'text';
  if (/^border(-[a-z]+)?-color$/.test(prop) || prop === 'outline-color' || prop === '--tw-ring-color' || prop === '--tw-ring-offset-color') return 'line';
  return null;
};

// แปลงค่าสีในประกาศ CSS: rgb(r g b/alpha) หรือ #fff
function convertValue(value, kind) {
  // รูปแบบที่ Tailwind สร้าง: rgb(255 255 255/var(--tw-bg-opacity,1)), rgba(240,253,250,.4), #fff
  let m = value.match(/^rgb\((\d+) (\d+) (\d+)\s*\/\s*(.+)\)$/);
  const m2 = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  let rgb;
  let alphaExpr;
  if (m) {
    rgb = `${m[1]} ${m[2]} ${m[3]}`;
    alphaExpr = m[4].trim();
  } else if (m2) {
    rgb = `${m2[1]} ${m2[2]} ${m2[3]}`;
    alphaExpr = m2[4];
  } else if (/^hsla\(0,\s*0%,\s*100%,\s*([\d.]+)\)$/.test(value)) {
    // สีขาวโปร่งแสง Tailwind เขียนเป็น hsla(0,0%,100%,.85)
    rgb = '255 255 255';
    alphaExpr = value.match(/([\d.]+)\)$/)[1];
  } else if (/^#[0-9a-f]{3,6}$/i.test(value)) {
    rgb = hexToRgb(value).join(' ');
    alphaExpr = '1';
  } else {
    return null;
  }
  const info = lookup.get(rgb);
  if (!info) return null;
  const d = darkOf(info, kind);
  if (!d) return null;
  // คงค่าโปร่งแสงเดิม (เช่น /40, var(--tw-bg-opacity)) แล้วคูณกับค่าของโหมดมืด
  let alpha = alphaExpr;
  if (d.alpha !== undefined && d.alpha !== 1) {
    alpha = /^[\d.]+$/.test(alphaExpr) ? String(+(parseFloat(alphaExpr) * d.alpha).toFixed(3)) : `calc(${alphaExpr} * ${d.alpha})`;
  }
  return `rgb(${d.rgb} / ${alpha})`;
}

const css = fs.readFileSync(SRC, 'utf8');
const root = postcss.parse(css);
const out = postcss.root();
let count = 0;

root.walkRules((rule) => {
  if (!rule.selector.includes('.')) return; // เฉพาะ class (ข้าม base/preflight)
  if (rule.parent && rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') return;
  const decls = [];
  rule.walkDecls((decl) => {
    const kind = KIND(decl.prop);
    if (!kind) return;
    const v = convertValue(decl.value, kind);
    if (v) decls.push(postcss.decl({ prop: decl.prop, value: v, important: decl.important }));
  });
  if (!decls.length) return;
  const selector = rule.selectors.map((s) => `html.dark ${s}`).join(',\n');
  const newRule = postcss.rule({ selector });
  decls.forEach((d) => newRule.append(d));
  // คง @media เดิมไว้ (เช่น sm:, lg:)
  let target = out;
  if (rule.parent && rule.parent.type === 'atrule') {
    const at = postcss.atRule({ name: rule.parent.name, params: rule.parent.params });
    out.append(at);
    target = at;
  }
  target.append(newRule);
  count++;
});

const header = '/* สร้างอัตโนมัติจาก tools/build-dark.js — ห้ามแก้ไฟล์นี้โดยตรง (รัน npm run build:css) */\n';
fs.writeFileSync(OUT, header + out.toString().replace(/\n\s*\n/g, '\n') + '\n');
console.log(`dark.css: ${count} rules`);
