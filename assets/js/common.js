/* =============================================================
 * common.js — ค่าคงที่และฟังก์ชันที่ใช้ร่วมกันทุกหน้า
 * ============================================================= */

/* ---------- ตัวเลือก (แผนก / ประเภทเอกสาร) ----------
 * ค่าเริ่มต้นด้านล่างใช้เมื่อยังโหลดจาก Server ไม่ได้
 * ตัวเลือกจริงจัดการได้ที่หน้า "ตั้งค่า" ในระบบ (เก็บใน Google Sheets ชีต Options)
 */
const COLORS = {
  indigo: { label: 'คราม', badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200', bar: 'bg-indigo-400' },
  sky: { label: 'ฟ้า', badge: 'bg-sky-50 text-sky-700 ring-sky-200', bar: 'bg-sky-400' },
  teal: { label: 'เขียวน้ำทะเล', badge: 'bg-teal-50 text-teal-700 ring-teal-200', bar: 'bg-teal-400' },
  amber: { label: 'เหลืองอำพัน', badge: 'bg-amber-50 text-amber-700 ring-amber-200', bar: 'bg-amber-400' },
  rose: { label: 'ชมพูแดง', badge: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-400' },
  violet: { label: 'ม่วง', badge: 'bg-violet-50 text-violet-700 ring-violet-200', bar: 'bg-violet-400' },
  emerald: { label: 'เขียว', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-400' },
  orange: { label: 'ส้ม', badge: 'bg-orange-50 text-orange-700 ring-orange-200', bar: 'bg-orange-400' },
  pink: { label: 'ชมพู', badge: 'bg-pink-50 text-pink-700 ring-pink-200', bar: 'bg-pink-400' },
  lime: { label: 'เขียวมะนาว', badge: 'bg-lime-50 text-lime-700 ring-lime-200', bar: 'bg-lime-500' },
  cyan: { label: 'ฟ้าอมเขียว', badge: 'bg-cyan-50 text-cyan-700 ring-cyan-200', bar: 'bg-cyan-400' },
  slate: { label: 'เทา', badge: 'bg-slate-100 text-slate-700 ring-slate-300', bar: 'bg-slate-400' },
};

const DEFAULT_OPTIONS = [
  { kind: 'type', code: 'QP', name: 'Quality Procedure', th: 'ระเบียบปฏิบัติ', color: 'indigo', active: true },
  { kind: 'type', code: 'WI', name: 'Work Instruction', th: 'วิธีปฏิบัติงาน', color: 'sky', active: true },
  { kind: 'type', code: 'SD', name: 'Supporting Document', th: 'เอกสารสนับสนุน', color: 'teal', active: true },
  { kind: 'type', code: 'FM', name: 'Form', th: 'แบบฟอร์ม', color: 'amber', active: true },
  { kind: 'dept', code: 'PD', name: 'Production', th: 'ฝ่ายผลิต', active: true },
  { kind: 'dept', code: 'QC', name: 'Quality Control', th: 'ฝ่ายควบคุมคุณภาพ', active: true },
  { kind: 'dept', code: 'QA', name: 'Quality Assurance', th: 'ฝ่ายประกันคุณภาพ', active: true },
  { kind: 'dept', code: 'MT', name: 'Maintenance', th: 'ฝ่ายซ่อมบำรุง', active: true },
  { kind: 'dept', code: 'RD', name: 'Research and Development', th: 'ฝ่ายวิจัยและพัฒนา', active: true },
  { kind: 'dept', code: 'HR', name: 'Human Resource', th: 'ฝ่ายบุคคล', active: true },
  { kind: 'dept', code: 'ST', name: 'Store', th: 'ฝ่ายคลังสินค้า', active: true },
];

// อ็อบเจกต์เหล่านี้ถูกเติมค่าใหม่โดย applyOptions() (ห้าม reassign เพราะไฟล์อื่นอ้างอิงอยู่)
const DOC_TYPES = {};
const DEPTS = {};
const OPTION_CODE_RE = /^[A-Z]{2,4}$/;

function applyOptions(list) {
  const rows = (list && list.length ? list : DEFAULT_OPTIONS).map((o) => ({
    ...o,
    code: String(o.code).toUpperCase(),
    active: !(o.active === false || o.active === 'false' || o.active === 'FALSE'),
  }));
  [DOC_TYPES, DEPTS].forEach((obj) => Object.keys(obj).forEach((k) => delete obj[k]));
  rows.forEach((o) => {
    if (o.kind === 'type') {
      const c = COLORS[o.color] || COLORS.slate;
      DOC_TYPES[o.code] = { name: o.name, th: o.th, color: COLORS[o.color] ? o.color : 'slate', badge: c.badge, bar: c.bar, active: o.active };
    } else if (o.kind === 'dept') {
      DEPTS[o.code] = { name: o.name, th: o.th, active: o.active };
    }
  });
}
applyOptions(DEFAULT_OPTIONS);

/** รายการตัวเลือกในรูปแบบ array (ใช้ส่งไป Server / แสดงในหน้าตั้งค่า) */
function optionList(kind) {
  const obj = kind === 'type' ? DOC_TYPES : DEPTS;
  return Object.entries(obj).map(([code, v]) => ({ kind, code, ...v }));
}

const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png'];
const DOC_NO_RE = /^\d{2,3}(\.\d{2,3})?$/;

/* ---------- รหัสเอกสาร ---------- */
function pad2(v) {
  const n = String(v ?? '').replace(/\D/g, '');
  return n ? n.padStart(2, '0').slice(-2) : '';
}

function buildCode(type, dept, no) {
  return [type, dept, no].filter(Boolean).join('-');
}

/** แยกข้อมูลจากชื่อไฟล์ เช่น "SD-QA-11.01 Rev.03 แผนการ Swab Test.pdf" (รองรับแผนก/ประเภทที่เพิ่มใหม่) */
function parseFileName(fileName) {
  const out = {};
  const base = String(fileName || '').replace(/\.[^.]+$/, '');
  const alt = (obj) => Object.keys(obj).sort((a, b) => b.length - a.length).join('|');
  const codeRe = new RegExp(`(?:^|[^A-Za-z])(${alt(DOC_TYPES)})[\\s_-]*(${alt(DEPTS)})[\\s_-]*(\\d{2,3}(?:\\.\\d{2,3})?)`, 'i');
  const revRe = /(?:^|[^A-Za-z])(Rev(?:ision)?[\s._-]*(\d{1,2}))(?!\d)/i;
  const m = Object.keys(DOC_TYPES).length && Object.keys(DEPTS).length ? base.match(codeRe) : null;
  let rest = base;
  if (m) {
    out.docType = m[1].toUpperCase();
    out.dept = m[2].toUpperCase();
    out.docNo = m[3];
    rest = rest.replace(m[0].replace(/^[^A-Za-z]/, ''), ' ');
  }
  const r = rest.match(revRe);
  if (r) {
    out.rev = pad2(r[2]);
    rest = rest.replace(r[1], ' ');
  }
  const title = rest.replace(/[_]+/g, ' ').replace(/^[\s\-–:.]+|[\s\-–:.]+$/g, '').replace(/\s{2,}/g, ' ');
  if (title) out.title = title;
  return out;
}

function fileExt(name) {
  const m = String(name || '').match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : '';
}

/* ---------- การแสดงผล ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(iso) {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : formatDate(iso);
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (isNaN(diff)) return '';
  if (diff < 60) return 'เมื่อสักครู่';
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  return formatDate(iso);
}

function formatSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function typeBadge(type) {
  const t = DOC_TYPES[type];
  return `<span class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${t ? t.badge : 'bg-slate-50 text-slate-600 ring-slate-200'}" title="${t ? escapeHtml(t.name) : ''}">${escapeHtml(type)}</span>`;
}

function fileIcon(name) {
  const ext = fileExt(name);
  const map = {
    pdf: 'text-rose-500', doc: 'text-blue-500', docx: 'text-blue-500', xls: 'text-emerald-600', xlsx: 'text-emerald-600',
    ppt: 'text-orange-500', pptx: 'text-orange-500', jpg: 'text-violet-500', jpeg: 'text-violet-500', png: 'text-violet-500',
  };
  return `<span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold uppercase ${map[ext] || 'text-slate-500'}">${escapeHtml(ext || 'file')}</span>`;
}

/* ---------- Icons (Heroicons outline) ---------- */
const ICONS = {
  search: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
  eye: 'M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  download: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3',
  upload: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5',
  link: 'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244',
  pencil: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125',
  trash: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
  grid: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
  folder: 'M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z',
  inbox: 'M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z',
  plus: 'M12 4.5v15m7.5-7.5h-15',
  x: 'M6 18 18 6M6 6l12 12',
  check: 'm4.5 12.75 6 6 9-13.5',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  logout: 'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9',
  key: 'M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z',
  doc: 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z',
  history: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
  menu: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  copy: 'M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184',
  warning: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
  info: 'm11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
  calendar: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  database: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125',
  up: 'm4.5 15.75 7.5-7.5 7.5 7.5',
  down: 'm19.5 8.25-7.5 7.5-7.5-7.5',
  left: 'M15.75 19.5 8.25 12l7.5-7.5',
  right: 'm8.25 4.5 7.5 7.5-7.5 7.5',
  send: 'M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5',
  cog: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  refresh: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
};

function icon(name, cls = 'h-5 w-5') {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="${cls}" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${ICONS[name] || ''}"/></svg>`;
}

/* ---------- Toast ---------- */
function toast(message, type = 'success') {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[70] flex flex-col items-end gap-2 pointer-events-none';
    document.body.appendChild(wrap);
  }
  const styles = {
    success: ['bg-white text-slate-700 ring-emerald-200', 'text-emerald-500', 'check'],
    error: ['bg-white text-slate-700 ring-rose-200', 'text-rose-500', 'warning'],
    info: ['bg-white text-slate-700 ring-slate-200', 'text-teal-600', 'info'],
  }[type] || [];
  const el = document.createElement('div');
  el.className = `toast pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${styles[0]}`;
  el.innerHTML = `<span class="${styles[1]} mt-0.5">${icon(styles[2], 'h-4 w-4')}</span><span class="flex-1">${escapeHtml(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 250); }, type === 'error' ? 5000 : 3000);
}

/* ---------- Modal ---------- */
function openModal(html, { size = 'max-w-lg', onClose } = {}) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modal-root';
  root.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4';
  root.innerHTML = `
    <div class="modal-backdrop absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" data-close></div>
    <div class="modal-panel relative w-full ${size} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">${html}</div>`;
  root._onClose = onClose;
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(root);
  document.body.classList.add('overflow-hidden');
  const first = root.querySelector('[autofocus], input:not([type=hidden]):not([readonly]), textarea, select');
  if (first) setTimeout(() => first.focus(), 50);
  return root;
}

function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const cb = root._onClose;
  root.remove();
  document.body.classList.remove('overflow-hidden');
  if (cb) cb();
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function modalHeader(title, subtitle = '') {
  return `<div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
    <div><h3 class="text-base font-semibold text-slate-800">${title}</h3>${subtitle ? `<p class="mt-0.5 text-sm text-slate-500">${subtitle}</p>` : ''}</div>
    <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" data-close aria-label="ปิด">${icon('x', 'h-5 w-5')}</button>
  </div>`;
}

function confirmDialog({ title, message, confirmText = 'ยืนยัน', danger = false, input = null }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const root = openModal(`
      <form class="p-5">
        <div class="flex gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-rose-50 text-rose-500' : 'bg-teal-50 text-teal-600'}">${icon(danger ? 'warning' : 'info')}</div>
          <div class="flex-1">
            <h3 class="font-semibold text-slate-800">${title}</h3>
            <p class="mt-1 text-sm text-slate-500">${message}</p>
            ${input ? `<textarea name="value" rows="3" class="input mt-3" placeholder="${escapeHtml(input.placeholder || '')}" ${input.required ? 'required' : ''}></textarea>` : ''}
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${confirmText}</button>
        </div>
      </form>`, { size: 'max-w-md', onClose: () => finish(false) });
    root.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input ? e.target.value.value.trim() : true;
      finish(v);
      closeModal();
    });
  });
}

/* ---------- Files ---------- */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    r.readAsDataURL(file);
  });
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

function validateFile(file) {
  if (!file) return 'กรุณาเลือกไฟล์';
  if (!ALLOWED_EXT.includes(fileExt(file.name))) return `รองรับเฉพาะไฟล์ ${ALLOWED_EXT.join(', ')}`;
  const max = (window.APP_CONFIG && APP_CONFIG.MAX_FILE_MB) || 25;
  if (file.size > max * 1024 * 1024) return `ไฟล์ใหญ่เกินไป (สูงสุด ${max} MB)`;
  return '';
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
    ta.remove();
    return ok;
  }
}

function storageGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

/* ---------- ฟอร์มข้อมูลเอกสาร (ใช้ร่วมกันทั้งหน้าส่งไฟล์และหน้าจัดการ) ---------- */
function docFieldsHtml(d = {}, { prefix = '' } = {}) {
  const opt = (obj, sel) => Object.entries(obj).filter(([k, v]) => v.active || k === sel)
    .map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${k} – ${escapeHtml(v.th)}</option>`).join('');
  return `
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <label class="col-span-1"><span class="label">ประเภท <span class="text-rose-500">*</span></span>
      <select name="docType" class="input" required><option value="">เลือก</option>${opt(DOC_TYPES, d.docType)}</select></label>
    <label class="col-span-1"><span class="label">แผนก <span class="text-rose-500">*</span></span>
      <select name="dept" class="input" required><option value="">เลือก</option>${opt(DEPTS, d.dept)}</select></label>
    <label class="col-span-1"><span class="label">เลขที่เอกสาร <span class="text-rose-500">*</span></span>
      <input name="docNo" class="input font-mono" placeholder="เช่น 11.01" value="${escapeHtml(d.docNo || '')}" required pattern="\\d{2,3}(\\.\\d{2,3})?" title="ตัวเลข 2-3 หลัก เช่น 01 หรือ 11.01"></label>
    <label class="col-span-1"><span class="label">Revision <span class="text-rose-500">*</span></span>
      <div class="relative"><span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rev.</span>
      <input name="rev" class="input !pl-11 font-mono" placeholder="00" inputmode="numeric" maxlength="2" value="${escapeHtml(d.rev || '')}" required pattern="\\d{1,2}"></div></label>
  </div>
  <div class="mt-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
    <span class="text-slate-500">รหัสเอกสาร:</span>
    <span class="${prefix}code-preview font-mono font-semibold text-slate-800">-</span>
  </div>
  <label class="mt-3 block"><span class="label">ชื่อเอกสาร <span class="text-rose-500">*</span></span>
    <input name="title" class="input" placeholder="เช่น แผนการ Swab Test" value="${escapeHtml(d.title || '')}" required></label>
  <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
    <label><span class="label">วันที่บังคับใช้ <span class="text-rose-500">*</span></span>
      <input type="date" name="effectiveDate" class="input" value="${escapeHtml(d.effectiveDate || '')}" required></label>
    <label><span class="label">ผู้จัดทำ <span class="text-rose-500">*</span></span>
      <input name="author" class="input" placeholder="ชื่อผู้จัดทำเอกสาร" value="${escapeHtml(d.author || '')}" required></label>
  </div>`;
}

function bindDocFields(form, prefix = '') {
  const preview = form.querySelector(`.${prefix}code-preview`);
  const update = () => {
    const f = form.elements;
    const code = buildCode(f.docType.value, f.dept.value, f.docNo.value.trim());
    const rev = f.rev.value ? `Rev.${pad2(f.rev.value)}` : '';
    preview.textContent = code ? `${code}${rev ? '  ·  ' + rev : ''}` : '-';
  };
  form.elements.rev.addEventListener('blur', () => { if (form.elements.rev.value) form.elements.rev.value = pad2(form.elements.rev.value); update(); });
  ['docType', 'dept', 'docNo', 'rev'].forEach((n) => form.elements[n].addEventListener('input', update));
  update();
  return update;
}

function readDocFields(form) {
  const f = form.elements;
  return {
    docType: f.docType.value,
    dept: f.dept.value,
    docNo: f.docNo.value.trim(),
    rev: pad2(f.rev.value),
    title: f.title.value.trim(),
    effectiveDate: f.effectiveDate.value,
    author: f.author.value.trim(),
  };
}

/** เติมฟอร์มจากชื่อไฟล์ (เฉพาะช่องที่ยังว่าง) คืนค่าจำนวนช่องที่เติม */
function autofillFromFileName(form, fileName) {
  const p = parseFileName(fileName);
  let n = 0;
  Object.entries(p).forEach(([k, v]) => {
    const el = form.elements[k];
    if (el && !el.value) { el.value = v; n++; }
  });
  return n;
}

/* ---------- Drop zone ---------- */
function dropZoneHtml(id, hint = '') {
  const max = (window.APP_CONFIG && APP_CONFIG.MAX_FILE_MB) || 25;
  return `
  <div id="${id}" class="dropzone group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center transition hover:border-teal-300 hover:bg-teal-50/40">
    <input type="file" class="absolute inset-0 cursor-pointer opacity-0" accept="${ALLOWED_EXT.map((e) => '.' + e).join(',')}">
    <div class="dz-empty">
      <div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-teal-600 shadow-sm ring-1 ring-slate-200">${icon('upload')}</div>
      <p class="text-sm font-medium text-slate-700">ลากไฟล์มาวาง หรือ <span class="text-teal-600">คลิกเพื่อเลือกไฟล์</span></p>
      <p class="mt-1 text-xs text-slate-400">PDF, Word, Excel, PowerPoint, รูปภาพ · ไม่เกิน ${max} MB</p>
      ${hint ? `<p class="mt-2 text-xs text-slate-500">${hint}</p>` : ''}
    </div>
    <div class="dz-file hidden w-full items-center gap-3 text-left"></div>
  </div>`;
}

function bindDropZone(el, onFile) {
  const input = el.querySelector('input[type=file]');
  const empty = el.querySelector('.dz-empty');
  const fileBox = el.querySelector('.dz-file');
  const show = (file) => {
    const err = validateFile(file);
    if (err) { toast(err, 'error'); input.value = ''; return; }
    empty.classList.add('hidden');
    fileBox.classList.remove('hidden');
    fileBox.classList.add('flex');
    fileBox.innerHTML = `${fileIcon(file.name)}<div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-slate-700">${escapeHtml(file.name)}</p><p class="text-xs text-slate-400">${formatSize(file.size)} · คลิกเพื่อเปลี่ยนไฟล์</p></div><span class="text-emerald-500">${icon('check')}</span>`;
    el.classList.add('border-teal-300', 'bg-teal-50/40');
    el._file = file;
    onFile && onFile(file);
  };
  input.addEventListener('change', () => input.files[0] && show(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add('dz-over'); }));
  ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, () => el.classList.remove('dz-over')));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) show(f);
  });
  return { getFile: () => el._file || null };
}

function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) {
    btn._html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${text ? `<span>${text}</span>` : ''}`;
  } else {
    btn.disabled = false;
    if (btn._html) btn.innerHTML = btn._html;
  }
}
