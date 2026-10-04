/* =============================================================
 * app.js — หน้าจัดการสำหรับผู้ดูแลระบบ
 * ============================================================= */

const S = {
  docs: [],
  subs: [],
  logs: [],
  loaded: false,
  view: 'dashboard',
  f: { q: '', type: '', dept: '', status: 'Active' },
  sort: { key: 'docCode', dir: 1 },
  page: 1,
  pageSize: 20,
  pendingTab: 'Pending',
};

const $ = (sel, root = document) => root.querySelector(sel);
const main = () => $('#main');
const STORAGE_LIMIT = 15 * 1024 ** 3; // Google Drive ฟรี 15 GB

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.cls || 'h-5 w-5');
    el.removeAttribute('data-icon');
  });
}

/* ---------------- เริ่มต้น ---------------- */
function init() {
  hydrateIcons();
  if (API.isDemo) {
    $('#demo-hint').classList.remove('hidden');
    $('#demo-banner').classList.remove('hidden');
  }
  $('#login-form').addEventListener('submit', onLogin);
  document.addEventListener('click', onAction);
  window.addEventListener('hashchange', route);
  window.addEventListener('auth-expired', () => {
    toast('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่', 'info');
    showLogin();
  });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === '/' && !['input', 'textarea', 'select'].includes(tag) && !$('#modal-root') && API.token) {
      e.preventDefault();
      if (S.view !== 'documents') location.hash = '#/documents';
      setTimeout(() => $('#doc-search') && $('#doc-search').focus(), 30);
    }
  });
  $('#boot').remove();
  if (API.token) {
    showApp();
    loadData();
  } else {
    showLogin();
  }
}

function showLogin() {
  $('#app-view').classList.add('hidden');
  const v = $('#login-view');
  v.classList.remove('hidden');
  v.classList.add('flex');
  closeModal();
  setTimeout(() => $('#login-form').password.focus(), 30);
}

function showApp() {
  const v = $('#login-view');
  v.classList.add('hidden');
  v.classList.remove('flex');
  $('#app-view').classList.remove('hidden');
}

async function onLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  setBusy(btn, true, 'กำลังตรวจสอบ...');
  try {
    const { token } = await API.call('login', { password: e.target.password.value });
    API.token = token;
    e.target.reset();
    showApp();
    await loadData();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setBusy(btn, false);
  }
}

async function loadData(silent = false) {
  if (!silent && !S.loaded) main().innerHTML = skeleton();
  try {
    const d = await API.call('bootstrap');
    S.docs = d.documents || [];
    S.subs = d.submissions || [];
    S.logs = d.logs || [];
    S.loaded = true;
    updateBadge();
    route();
  } catch (err) {
    if (err.code !== 'AUTH') {
      toast(err.message, 'error');
      if (!S.loaded) main().innerHTML = errorState(err.message);
    }
  }
}

function skeleton() {
  return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${'<div class="skeleton h-28"></div>'.repeat(4)}</div>
    <div class="mt-6 grid lg:grid-cols-3 gap-4"><div class="skeleton h-72 lg:col-span-2"></div><div class="skeleton h-72"></div></div>`;
}

function errorState(msg) {
  return `<div class="card mx-auto max-w-md p-8 text-center">
    <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">${icon('warning')}</div>
    <p class="font-medium text-slate-700">โหลดข้อมูลไม่สำเร็จ</p>
    <p class="mt-1 text-sm text-slate-500">${escapeHtml(msg)}</p>
    <button class="btn btn-ghost mt-4" data-action="refresh">${icon('refresh', 'h-4 w-4')}ลองใหม่</button></div>`;
}

function updateBadge() {
  const n = S.subs.filter((s) => s.status === 'Pending').length;
  const b = $('#pending-badge');
  b.textContent = n;
  b.classList.toggle('hidden', !n);
  document.title = `${n ? `(${n}) ` : ''}DocControl · ระบบจัดเก็บเอกสาร`;
}

/* ---------------- Router ---------------- */
const VIEWS = {
  dashboard: { title: 'ภาพรวม', render: renderDashboard },
  documents: { title: 'เอกสารทั้งหมด', render: renderDocuments },
  pending: { title: 'รอตรวจสอบ', render: renderPending },
};

function route() {
  const name = (location.hash.match(/^#\/(\w+)/) || [])[1];
  S.view = VIEWS[name] ? name : 'dashboard';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === S.view));
  $('#page-title').textContent = VIEWS[S.view].title;
  toggleSidebar(false);
  if (!S.loaded) return;
  VIEWS[S.view].render();
  main().classList.remove('fade-in');
  void main().offsetWidth;
  main().classList.add('fade-in');
}

function toggleSidebar(open) {
  $('#sidebar').classList.toggle('-translate-x-full', !open);
  $('#sidebar-backdrop').classList.toggle('hidden', !open);
}

/* ---------------- Helpers ---------------- */
const deptName = (c) => (DEPTS[c] ? DEPTS[c].th : c);
const activeDocs = () => S.docs.filter((d) => d.status === 'Active');
const revisionsOf = (code) => S.docs.filter((d) => d.docCode === code).sort((a, b) => Number(b.rev) - Number(a.rev));

function highlight(text, tokens) {
  const s = String(text ?? '');
  if (!tokens.length) return escapeHtml(s);
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return s.split(re).map((part, i) => (i % 2 ? `<mark class="rounded bg-amber-100 px-0.5 text-inherit">${escapeHtml(part)}</mark>` : escapeHtml(part))).join('');
}

const LOG_META = {
  SUBMIT: ['ส่งเอกสารเข้ามา', 'bg-sky-50 text-sky-600', 'send'],
  APPROVE: ['อนุมัติและจัดเก็บ', 'bg-emerald-50 text-emerald-600', 'check'],
  REJECT: ['ตีกลับเอกสาร', 'bg-rose-50 text-rose-500', 'x'],
  ADD: ['เพิ่มเอกสาร', 'bg-teal-50 text-teal-600', 'plus'],
  UPDATE: ['แก้ไขข้อมูล', 'bg-slate-100 text-slate-600', 'pencil'],
  DELETE: ['ลบเอกสาร', 'bg-rose-50 text-rose-500', 'trash'],
  DOWNLOAD: ['ดาวน์โหลด', 'bg-indigo-50 text-indigo-600', 'download'],
  SHARE: ['สร้างลิงก์แชร์', 'bg-violet-50 text-violet-600', 'link'],
};

/* =============================================================
 * Dashboard
 * ============================================================= */
function renderDashboard() {
  const active = activeDocs();
  const pending = S.subs.filter((s) => s.status === 'Pending');
  const month = todayIso().slice(0, 7);
  const today = todayIso();
  const newThisMonth = S.docs.filter((d) => (d.createdAt || '').startsWith(month)).length;
  const obsolete = S.docs.length - active.length;
  const storage = S.docs.reduce((a, d) => a + (Number(d.fileSize) || 0), 0);
  const storagePct = Math.min(100, (storage / STORAGE_LIMIT) * 100);

  const kpi = (label, value, sub, ic, tone, action = '') => `
    <div class="card p-4 sm:p-5 ${action ? 'cursor-pointer hover:ring-1 hover:ring-teal-200 transition' : ''}" ${action}>
      <div class="flex items-start justify-between">
        <p class="text-sm text-slate-500">${label}</p>
        <span class="flex h-9 w-9 items-center justify-center rounded-xl ${tone}">${icon(ic, 'h-5 w-5')}</span>
      </div>
      <p class="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-800">${value}</p>
      <p class="mt-1 text-xs text-slate-400">${sub}</p>
    </div>`;

  // แยกตามแผนก
  const byDept = Object.keys(DEPTS).map((k) => ({ k, n: active.filter((d) => d.dept === k).length }));
  const maxDept = Math.max(1, ...byDept.map((x) => x.n));
  // แยกตามประเภท
  const byType = Object.keys(DOC_TYPES).map((k) => ({ k, n: active.filter((d) => d.docType === k).length }));
  const totalActive = active.length || 1;

  const upcoming = active.filter((d) => d.effectiveDate > today).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).slice(0, 5);

  main().innerHTML = `
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
    ${kpi('เอกสารที่ใช้งานอยู่', active.length.toLocaleString(), `${S.docs.length} ไฟล์รวม Rev เก่า ${obsolete}`, 'folder', 'bg-teal-50 text-teal-600', 'data-action="goto-docs"')}
    ${kpi('รอตรวจสอบ', pending.length, pending.length ? 'มีเอกสารรอคุณตรวจสอบ' : 'ไม่มีงานค้าง', 'inbox', pending.length ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500', 'data-action="goto-pending"')}
    ${kpi('เพิ่มเข้าระบบเดือนนี้', newThisMonth, 'รวมเอกสารใหม่และ Rev ใหม่', 'calendar', 'bg-sky-50 text-sky-600')}
    <div class="card p-4 sm:p-5">
      <div class="flex items-start justify-between">
        <p class="text-sm text-slate-500">พื้นที่จัดเก็บ</p>
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">${icon('database')}</span>
      </div>
      <p class="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-800">${formatSize(storage)}</p>
      <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-indigo-400" style="width:${Math.max(storagePct, 0.5)}%"></div></div>
      <p class="mt-1 text-xs text-slate-400">จาก 15 GB (Google Drive ฟรี)</p>
    </div>
  </div>

  <div class="mt-4 grid gap-4 lg:grid-cols-5">
    <section class="card p-5 lg:col-span-3">
      <div class="mb-4 flex items-center justify-between">
        <div><h3 class="font-semibold text-slate-800">เอกสารแยกตามแผนก</h3><p class="text-xs text-slate-400">นับเฉพาะ Revision ที่ใช้งานอยู่ · คลิกเพื่อดูรายการ</p></div>
      </div>
      <div class="space-y-2.5">
        ${byDept.map(({ k, n }) => `
          <button class="group flex w-full items-center gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-slate-50" data-action="goto-dept" data-dept="${k}">
            <span class="w-9 font-mono text-xs font-semibold text-slate-600">${k}</span>
            <span class="hidden w-36 truncate text-sm text-slate-500 sm:block">${DEPTS[k].th}</span>
            <span class="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><span class="block h-full rounded-full bg-teal-500/80 transition-all group-hover:bg-teal-600" style="width:${(n / maxDept) * 100}%"></span></span>
            <span class="w-8 text-right text-sm font-semibold tabular-nums text-slate-700">${n}</span>
          </button>`).join('')}
      </div>
    </section>

    <section class="card p-5 lg:col-span-2">
      <h3 class="font-semibold text-slate-800">แยกตามประเภทเอกสาร</h3>
      <p class="mb-4 text-xs text-slate-400">สัดส่วนเอกสารที่ใช้งานอยู่</p>
      <div class="flex h-3 overflow-hidden rounded-full bg-slate-100 gap-0.5">
        ${byType.filter((x) => x.n).map(({ k, n }) => `<span class="${DOC_TYPES[k].bar}" style="width:${(n / totalActive) * 100}%" title="${k}: ${n}"></span>`).join('')}
      </div>
      <div class="mt-4 grid grid-cols-2 gap-2">
        ${byType.map(({ k, n }) => `
          <button class="rounded-xl border border-slate-100 p-3 text-left hover:border-teal-200 hover:bg-teal-50/30" data-action="goto-type" data-type="${k}">
            <div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full ${DOC_TYPES[k].bar}"></span><span class="text-sm font-semibold text-slate-700">${k}</span></div>
            <p class="mt-1 truncate text-xs text-slate-400">${DOC_TYPES[k].name}</p>
            <p class="mt-1 text-lg font-semibold text-slate-800">${n} <span class="text-xs font-normal text-slate-400">${active.length ? Math.round((n / active.length) * 100) : 0}%</span></p>
          </button>`).join('')}
      </div>
    </section>
  </div>

  <section class="card mt-4 p-5">
    <h3 class="font-semibold text-slate-800">ตารางสรุป แผนก × ประเภท</h3>
    <p class="mb-3 text-xs text-slate-400">คลิกตัวเลขเพื่อดูรายการเอกสาร</p>
    <div class="overflow-x-auto scrollbar-thin">
      <table class="w-full min-w-[520px] text-sm">
        <thead><tr class="text-xs text-slate-500">
          <th class="py-2 pr-3 text-left font-medium">แผนก</th>
          ${Object.keys(DOC_TYPES).map((t) => `<th class="px-2 py-2 text-center font-medium">${t}</th>`).join('')}
          <th class="px-2 py-2 text-center font-medium">รวม</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          ${Object.keys(DEPTS).map((dp) => {
            const row = Object.keys(DOC_TYPES).map((t) => active.filter((d) => d.dept === dp && d.docType === t).length);
            const sum = row.reduce((a, b) => a + b, 0);
            return `<tr><td class="py-2 pr-3"><span class="font-mono text-xs font-semibold text-slate-700">${dp}</span> <span class="text-slate-500">${DEPTS[dp].th}</span></td>
              ${row.map((n, i) => `<td class="px-2 py-1 text-center">${n ? `<button class="min-w-[2rem] rounded-md px-2 py-1 font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-700" data-action="goto-cell" data-dept="${dp}" data-type="${Object.keys(DOC_TYPES)[i]}">${n}</button>` : '<span class="text-slate-300">–</span>'}</td>`).join('')}
              <td class="px-2 py-1 text-center font-semibold text-slate-800">${sum}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </section>

  <div class="mt-4 grid gap-4 lg:grid-cols-3">
    <section class="card p-5">
      <div class="mb-3 flex items-center justify-between"><h3 class="font-semibold text-slate-800">รอตรวจสอบ</h3>
        ${pending.length ? `<a href="#/pending" class="text-xs font-medium text-teal-600 hover:underline">ดูทั้งหมด</a>` : ''}</div>
      ${pending.length ? `<ul class="space-y-2">${pending.slice(0, 5).map((s) => `
        <li><button class="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-50" data-action="review" data-id="${s.id}">
          ${fileIcon(s.fileName)}
          <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-slate-700">${escapeHtml(s.docCode)} <span class="text-slate-400">Rev.${escapeHtml(s.rev)}</span></p>
          <p class="truncate text-xs text-slate-400">${escapeHtml(s.submitter)} · ${timeAgo(s.submittedAt)}</p></div>
          <span class="text-slate-300">${icon('right', 'h-4 w-4')}</span></button></li>`).join('')}</ul>`
        : emptyMini('check', 'ตรวจครบทุกรายการแล้ว')}
    </section>

    <section class="card p-5">
      <h3 class="mb-3 font-semibold text-slate-800">จะเริ่มบังคับใช้เร็ว ๆ นี้</h3>
      ${upcoming.length ? `<ul class="space-y-2">${upcoming.map((d) => `
        <li class="flex items-center gap-3 rounded-lg p-2">
          <div class="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <span class="text-sm font-semibold leading-none">${d.effectiveDate.slice(8, 10)}</span><span class="text-[10px] leading-none mt-0.5">${d.effectiveDate.slice(5, 7)}/${d.effectiveDate.slice(2, 4)}</span></div>
          <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-slate-700">${escapeHtml(d.docCode)} <span class="text-slate-400">Rev.${escapeHtml(d.rev)}</span></p>
          <p class="truncate text-xs text-slate-400">${escapeHtml(d.title)}</p></div></li>`).join('')}</ul>`
        : emptyMini('calendar', 'ไม่มีเอกสารที่รอวันบังคับใช้')}
    </section>

    <section class="card p-5">
      <h3 class="mb-3 font-semibold text-slate-800">กิจกรรมล่าสุด</h3>
      ${S.logs.length ? `<ul class="space-y-3">${S.logs.slice(0, 7).map((l) => {
        const m = LOG_META[l.action] || [l.action, 'bg-slate-100 text-slate-500', 'info'];
        return `<li class="flex items-start gap-3">
          <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m[1]}">${icon(m[2], 'h-3.5 w-3.5')}</span>
          <div class="min-w-0 flex-1"><p class="text-sm text-slate-700"><span class="font-medium">${m[0]}</span> <span class="font-mono text-xs text-slate-500">${escapeHtml(l.docCode || '')}${l.rev ? ' Rev.' + escapeHtml(l.rev) : ''}</span></p>
          <p class="truncate text-xs text-slate-400">${timeAgo(l.time)}${l.detail ? ' · ' + escapeHtml(l.detail) : ''}</p></div></li>`;
      }).join('')}</ul>` : emptyMini('clock', 'ยังไม่มีกิจกรรม')}
    </section>
  </div>`;
}

function emptyMini(ic, text) {
  return `<div class="flex flex-col items-center justify-center py-8 text-center text-slate-400">${icon(ic, 'h-7 w-7')}<p class="mt-2 text-sm">${text}</p></div>`;
}

/* =============================================================
 * เอกสารทั้งหมด (ค้นหา + Filter)
 * ============================================================= */
function renderDocuments() {
  const chip = (group, val, label, title = '') =>
    `<button class="chip ${S.f[group] === val ? 'active' : ''}" data-action="filter" data-group="${group}" data-value="${val}" ${title ? `title="${escapeHtml(title)}"` : ''}>${label}</button>`;

  main().innerHTML = `
  <div class="card p-4 sm:p-5">
    <div class="flex flex-col gap-3 sm:flex-row">
      <div class="relative flex-1">
        <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">${icon('search', 'h-5 w-5')}</span>
        <input id="doc-search" type="search" class="input !h-11 !pl-11 !pr-12 !text-[15px]" placeholder="ค้นหารหัสเอกสาร ชื่อเอกสาร หรือผู้จัดทำ..." value="${escapeHtml(S.f.q)}" autocomplete="off">
        <kbd class="absolute right-3 top-1/2 hidden -translate-y-1/2 sm:block">/</kbd>
      </div>
      <button class="btn btn-primary !h-11" data-action="add-doc">${icon('plus', 'h-4 w-4')}เพิ่มเอกสาร</button>
    </div>

    <div class="mt-4 space-y-3">
      <div class="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
        <span class="w-14 shrink-0 text-xs font-medium text-slate-400">ประเภท</span>
        ${chip('type', '', 'ทั้งหมด')}
        ${Object.entries(DOC_TYPES).map(([k, v]) => chip('type', k, `<span class="h-2 w-2 rounded-full ${v.bar}"></span>${k}`, v.name)).join('')}
      </div>
      <div class="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
        <span class="w-14 shrink-0 text-xs font-medium text-slate-400">แผนก</span>
        ${chip('dept', '', 'ทั้งหมด')}
        ${Object.entries(DEPTS).map(([k, v]) => chip('dept', k, k, `${v.name} (${v.th})`)).join('')}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-14 shrink-0 text-xs font-medium text-slate-400">สถานะ</span>
        ${chip('status', 'Active', 'ใช้งานอยู่')}
        ${chip('status', 'Obsolete', 'Rev เก่า / ยกเลิก')}
        ${chip('status', 'all', 'ทั้งหมด')}
        <button id="clear-filter" class="ml-auto text-xs font-medium text-slate-500 hover:text-teal-600" data-action="clear-filter">ล้างตัวกรอง</button>
      </div>
    </div>
  </div>
  <div id="doc-results" class="mt-4"></div>`;

  const input = $('#doc-search');
  input.addEventListener('input', debounce(() => { S.f.q = input.value; S.page = 1; renderDocTable(); }, 150));
  renderDocTable();
}

function filteredDocs() {
  const tokens = S.f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = S.docs.filter((d) => {
    if (S.f.type && d.docType !== S.f.type) return false;
    if (S.f.dept && d.dept !== S.f.dept) return false;
    if (S.f.status !== 'all' && d.status !== S.f.status) return false;
    if (!tokens.length) return true;
    const hay = `${d.docCode} ${d.title} ${d.author} ${d.dept} ${deptName(d.dept)} rev.${d.rev} rev${d.rev} ${d.fileName} ${d.submitter || ''}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
  const { key, dir } = S.sort;
  list.sort((a, b) => {
    let x = a[key] ?? '';
    let y = b[key] ?? '';
    if (key === 'rev' || key === 'fileSize') { x = Number(x); y = Number(y); return (x - y) * dir; }
    const c = String(x).localeCompare(String(y), 'th', { numeric: true });
    return (c || Number(b.rev) - Number(a.rev)) * dir;
  });
  return { list, tokens };
}

function renderDocTable() {
  const box = $('#doc-results');
  if (!box) return;
  const { list, tokens } = filteredDocs();
  const pages = Math.max(1, Math.ceil(list.length / S.pageSize));
  S.page = Math.min(S.page, pages);
  const start = (S.page - 1) * S.pageSize;
  const rows = list.slice(start, start + S.pageSize);
  const today = todayIso();
  const hasFilter = S.f.q || S.f.type || S.f.dept || S.f.status !== 'Active';
  $('#clear-filter').classList.toggle('invisible', !hasFilter);

  const th = (key, label, cls = '') => {
    const on = S.sort.key === key;
    return `<th class="px-3 py-3 text-left text-xs font-medium text-slate-500 ${cls}">
      ${key ? `<button class="inline-flex items-center gap-1 hover:text-slate-800 ${on ? 'text-slate-800' : ''}" data-action="sort" data-key="${key}">${label}<span class="${on ? '' : 'opacity-0'}">${icon(on && S.sort.dir < 0 ? 'down' : 'up', 'h-3 w-3')}</span></button>` : label}</th>`;
  };

  if (!list.length) {
    box.innerHTML = `<div class="card flex flex-col items-center justify-center px-6 py-16 text-center">
      <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">${icon('search')}</div>
      <p class="font-medium text-slate-700">ไม่พบเอกสาร</p>
      <p class="mt-1 text-sm text-slate-500">${S.docs.length ? 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรอง' : 'ยังไม่มีเอกสารในระบบ เริ่มเพิ่มเอกสารแรกได้เลย'}</p>
      ${hasFilter ? `<button class="btn btn-ghost mt-4" data-action="clear-filter">ล้างตัวกรอง</button>` : `<button class="btn btn-primary mt-4" data-action="add-doc">${icon('plus', 'h-4 w-4')}เพิ่มเอกสาร</button>`}
    </div>`;
    return;
  }

  box.innerHTML = `
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm">
      <p class="text-slate-500">พบ <b class="text-slate-800">${list.length.toLocaleString()}</b> รายการ</p>
      <p class="text-xs text-slate-400 hidden sm:block">คลิกที่หัวคอลัมน์เพื่อเรียงลำดับ</p>
    </div>
    <div class="overflow-x-auto scrollbar-thin">
      <table class="table-docs w-full min-w-[1040px] text-sm">
        <thead class="border-b border-slate-100"><tr>
          ${th('docCode', 'รหัสเอกสาร', 'pl-4')}${th('title', 'ชื่อเอกสาร')}${th('dept', 'แผนก')}${th('rev', 'Revision')}
          ${th('effectiveDate', 'วันที่บังคับใช้')}${th('', 'ไฟล์')}${th('author', 'ผู้จัดทำ')}
          <th class="px-3 py-3 pr-4 text-right text-xs font-medium text-slate-500">จัดการไฟล์</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          ${rows.map((d) => {
            const revCount = S.docs.filter((x) => x.docCode === d.docCode).length;
            const future = d.effectiveDate > today;
            return `<tr>
            <td class="px-3 py-3 pl-4 align-middle"><div class="flex items-center gap-2">${typeBadge(d.docType)}<span class="font-mono text-[13px] font-semibold text-slate-800">${highlight(d.docCode, tokens)}</span></div></td>
            <td class="px-3 py-3 max-w-[280px]"><p class="truncate font-medium text-slate-700" title="${escapeHtml(d.title)}">${highlight(d.title, tokens)}</p>
              ${d.status === 'Obsolete' ? '<span class="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">Rev เก่า (ไม่ใช้งาน)</span>' : ''}</td>
            <td class="px-3 py-3"><span class="font-mono text-xs font-semibold text-slate-600">${d.dept}</span> <span class="text-xs text-slate-400">${escapeHtml(deptName(d.dept))}</span></td>
            <td class="px-3 py-3"><button class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[13px] text-slate-700 hover:bg-teal-50 hover:text-teal-700" data-action="history" data-code="${escapeHtml(d.docCode)}" title="ดูประวัติ Revision">
              Rev.${escapeHtml(d.rev)}${revCount > 1 ? `<span class="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">${revCount}</span>` : ''}</button></td>
            <td class="px-3 py-3 whitespace-nowrap ${future ? 'text-amber-600' : 'text-slate-600'}">${formatDate(d.effectiveDate)}${future ? '<span class="block text-[11px] text-amber-500">ยังไม่ถึงวันบังคับใช้</span>' : ''}</td>
            <td class="px-3 py-3"><button class="flex items-center gap-2 text-left" data-action="view" data-id="${d.id}" title="${escapeHtml(d.fileName)}">${fileIcon(d.fileName)}<span class="text-xs text-slate-400">${formatSize(d.fileSize)}</span></button></td>
            <td class="px-3 py-3 text-slate-600 whitespace-nowrap">${highlight(d.author, tokens)}</td>
            <td class="px-3 py-2 pr-4"><div class="flex justify-end gap-0.5">
              <button class="icon-btn" data-action="view" data-id="${d.id}" title="เปิดดู">${icon('eye', 'h-[18px] w-[18px]')}</button>
              <button class="icon-btn" data-action="download" data-id="${d.id}" title="ดาวน์โหลด">${icon('download', 'h-[18px] w-[18px]')}</button>
              <button class="icon-btn" data-action="share" data-id="${d.id}" title="สร้างลิงก์ส่งต่อ">${icon('link', 'h-[18px] w-[18px]')}</button>
              <button class="icon-btn" data-action="edit" data-id="${d.id}" title="แก้ไขข้อมูล">${icon('pencil', 'h-[18px] w-[18px]')}</button>
              <button class="icon-btn danger" data-action="delete" data-id="${d.id}" title="ลบ">${icon('trash', 'h-[18px] w-[18px]')}</button>
            </div></td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${pages > 1 ? `
    <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
      <p class="text-slate-500">แสดง ${start + 1}–${Math.min(start + S.pageSize, list.length)} จาก ${list.length}</p>
      <div class="flex items-center gap-1">
        <button class="icon-btn" data-action="page" data-page="${S.page - 1}" ${S.page <= 1 ? 'disabled style="opacity:.4"' : ''}>${icon('left', 'h-4 w-4')}</button>
        <span class="px-2 text-slate-600">${S.page} / ${pages}</span>
        <button class="icon-btn" data-action="page" data-page="${S.page + 1}" ${S.page >= pages ? 'disabled style="opacity:.4"' : ''}>${icon('right', 'h-4 w-4')}</button>
      </div>
    </div>` : ''}
  </div>`;
}

/* =============================================================
 * รอตรวจสอบ
 * ============================================================= */
function renderPending() {
  const pending = S.subs.filter((s) => s.status === 'Pending').sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const done = S.subs.filter((s) => s.status !== 'Pending').sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || ''));
  const tab = (key, label, n) => `<button class="relative px-1 pb-3 text-sm font-medium ${S.pendingTab === key ? 'text-teal-700' : 'text-slate-500 hover:text-slate-700'}" data-action="pending-tab" data-tab="${key}">
    ${label} <span class="ml-1 rounded-full px-1.5 text-xs ${S.pendingTab === key ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}">${n}</span>
    ${S.pendingTab === key ? '<span class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-teal-600"></span>' : ''}</button>`;

  let body;
  if (S.pendingTab === 'Pending') {
    body = pending.length ? `<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">${pending.map(pendingCard).join('')}</div>`
      : `<div class="card flex flex-col items-center px-6 py-16 text-center">
          <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">${icon('check')}</div>
          <p class="font-medium text-slate-700">ไม่มีเอกสารรอตรวจสอบ</p>
          <p class="mt-1 text-sm text-slate-500">ส่งลิงก์หน้าส่งไฟล์ให้ผู้อื่นเพื่อรับเอกสารเข้ามา</p>
          <button class="btn btn-ghost mt-4" data-action="copy-submit-link">${icon('link', 'h-4 w-4')}คัดลอกลิงก์หน้าส่งไฟล์</button></div>`;
  } else {
    body = done.length ? `<div class="card overflow-x-auto scrollbar-thin"><table class="w-full min-w-[760px] text-sm">
      <thead class="border-b border-slate-100 bg-slate-50 text-xs text-slate-500"><tr>
        <th class="px-4 py-3 text-left font-medium">เลขอ้างอิง</th><th class="px-3 py-3 text-left font-medium">เอกสาร</th>
        <th class="px-3 py-3 text-left font-medium">ผู้ส่ง</th><th class="px-3 py-3 text-left font-medium">ผลการตรวจ</th>
        <th class="px-3 py-3 text-left font-medium">วันที่ตรวจ</th><th class="px-3 py-3 text-left font-medium">หมายเหตุ</th></tr></thead>
      <tbody class="divide-y divide-slate-100">${done.map((s) => `<tr>
        <td class="px-4 py-3 font-mono text-xs text-slate-500">${escapeHtml(s.refNo)}</td>
        <td class="px-3 py-3"><p class="font-mono text-[13px] font-semibold text-slate-700">${escapeHtml(s.docCode)} <span class="font-normal text-slate-400">Rev.${escapeHtml(s.rev)}</span></p><p class="max-w-[240px] truncate text-xs text-slate-500">${escapeHtml(s.title)}</p></td>
        <td class="px-3 py-3 text-slate-600">${escapeHtml(s.submitter)}</td>
        <td class="px-3 py-3">${s.status === 'Approved' ? '<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">อนุมัติแล้ว</span>' : '<span class="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">ตีกลับ</span>'}</td>
        <td class="px-3 py-3 whitespace-nowrap text-slate-500">${formatDateTime(s.reviewedAt)}</td>
        <td class="px-3 py-3 max-w-[260px] truncate text-slate-500" title="${escapeHtml(s.reviewNote)}">${escapeHtml(s.reviewNote || '-')}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card py-12">${emptyMini('clock', 'ยังไม่มีประวัติการตรวจสอบ')}</div>`;
  }

  main().innerHTML = `
    <div class="mb-4 flex gap-6 border-b border-slate-200">${tab('Pending', 'รอตรวจสอบ', pending.length)}${tab('Done', 'ประวัติการตรวจ', done.length)}</div>
    ${body}`;
}

function pendingCard(s) {
  const existing = revisionsOf(s.docCode);
  const latest = existing[0];
  let hint = '<span class="text-sky-600">เอกสารใหม่</span>';
  if (existing.some((d) => d.rev === s.rev)) hint = `<span class="text-rose-600">Rev.${escapeHtml(s.rev)} มีในระบบแล้ว</span>`;
  else if (latest && Number(latest.rev) > Number(s.rev)) hint = `<span class="text-amber-600">เก่ากว่า Rev.${escapeHtml(latest.rev)} ในระบบ</span>`;
  else if (latest) hint = `<span class="text-teal-600">แทนที่ Rev.${escapeHtml(latest.rev)}</span>`;
  return `
  <div class="card flex flex-col p-4">
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2">${typeBadge(s.docType)}<span class="font-mono text-sm font-semibold text-slate-800">${escapeHtml(s.docCode)}</span></div>
      <span class="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">Rev.${escapeHtml(s.rev)}</span>
    </div>
    <p class="mt-2 font-medium text-slate-700">${escapeHtml(s.title)}</p>
    <p class="mt-0.5 text-xs">${hint}</p>
    <div class="mt-3 space-y-1 text-xs text-slate-500">
      <p>ส่งโดย <span class="text-slate-700">${escapeHtml(s.submitter)}</span>${s.contact ? ` · ${escapeHtml(s.contact)}` : ''}</p>
      <p>${formatDateTime(s.submittedAt)} (${timeAgo(s.submittedAt)})</p>
      ${s.note ? `<p class="mt-2 rounded-lg bg-slate-50 p-2 text-slate-600">“${escapeHtml(s.note)}”</p>` : ''}
    </div>
    <div class="mt-auto flex items-center gap-2 pt-4">
      <button class="btn btn-ghost flex-1 !px-3" data-action="view-sub" data-id="${s.id}">${icon('eye', 'h-4 w-4')}ดูไฟล์</button>
      <button class="btn btn-primary flex-1 !px-3" data-action="review" data-id="${s.id}">${icon('check', 'h-4 w-4')}ตรวจสอบ</button>
    </div>
  </div>`;
}

/* ---------- คำเตือนเรื่อง Revision ---------- */
function revHintHtml(d, exceptId) {
  if (!d.docType || !d.dept || !DOC_NO_RE.test(d.docNo || '') || !d.rev) return '';
  const code = buildCode(d.docType, d.dept, d.docNo);
  const revs = revisionsOf(code).filter((x) => x.id !== exceptId);
  const box = (tone, ic, text) => `<div class="flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${tone}">${icon(ic, 'h-4 w-4 mt-0.5 shrink-0')}<span>${text}</span></div>`;
  if (revs.some((x) => x.rev === d.rev)) return box('bg-rose-50 text-rose-700', 'warning', `<b>${code} Rev.${d.rev}</b> มีอยู่ในระบบแล้ว กรุณาตรวจสอบ Revision`);
  if (!revs.length) return box('bg-sky-50 text-sky-700', 'info', 'เป็นเอกสารรหัสใหม่ ยังไม่เคยมีในระบบ');
  const top = revs[0];
  if (Number(top.rev) > Number(d.rev)) return box('bg-amber-50 text-amber-700', 'warning', `ในระบบมี <b>Rev.${top.rev}</b> ซึ่งใหม่กว่า เอกสารนี้จะถูกเก็บเป็นประวัติ (Rev เก่า)`);
  return box('bg-teal-50 text-teal-700', 'history', `จะเป็น Revision ล่าสุดแทน <b>Rev.${top.rev}</b> (Rev เดิมจะถูกเก็บเป็นประวัติ)`);
}

function bindRevHint(form, exceptId) {
  const box = form.querySelector('.rev-hint');
  const upd = () => { box.innerHTML = revHintHtml(readDocFields(form), exceptId); };
  ['docType', 'dept', 'docNo', 'rev'].forEach((n) => { form.elements[n].addEventListener('input', upd); form.elements[n].addEventListener('change', upd); });
  form.elements.rev.addEventListener('blur', upd);
  upd();
  return upd;
}

/* ---------- Modal: ตรวจสอบเอกสารที่ส่งเข้ามา ---------- */
function openReview(id) {
  const s = S.subs.find((x) => x.id === id);
  if (!s) return;
  const root = openModal(`
    ${modalHeader('ตรวจสอบเอกสาร', `${escapeHtml(s.refNo)} · ส่งโดย ${escapeHtml(s.submitter)} · ${formatDateTime(s.submittedAt)}`)}
    <form class="p-5" novalidate>
      <div class="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
        ${fileIcon(s.fileName)}
        <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-slate-700">${escapeHtml(s.fileName)}</p><p class="text-xs text-slate-400">${formatSize(s.fileSize)}</p></div>
        <button type="button" class="btn btn-ghost !px-3 !py-1.5" data-action="view-sub" data-id="${s.id}">${icon('eye', 'h-4 w-4')}เปิดดู</button>
        <button type="button" class="icon-btn" data-action="download-sub" data-id="${s.id}" title="ดาวน์โหลด">${icon('download', 'h-[18px] w-[18px]')}</button>
      </div>
      ${s.contact || s.note ? `<div class="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        ${s.contact ? `<p><span class="text-slate-400">ติดต่อผู้ส่ง:</span> ${escapeHtml(s.contact)}</p>` : ''}
        ${s.note ? `<p class="${s.contact ? 'mt-1' : ''}"><span class="text-slate-400">ข้อความจากผู้ส่ง:</span> ${escapeHtml(s.note)}</p>` : ''}</div>` : ''}
      <p class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">ข้อมูลเอกสาร (แก้ไขได้ก่อนอนุมัติ)</p>
      ${docFieldsHtml(s, { prefix: 'rv-' })}
      <div class="rev-hint mt-3"></div>
      <label class="mt-4 block"><span class="label">หมายเหตุการตรวจสอบ <span class="font-normal text-slate-400">(จำเป็นเมื่อตีกลับ — ผู้ส่งจะเห็นข้อความนี้)</span></span>
        <textarea name="reviewNote" rows="2" class="input" placeholder="เช่น แก้ไขวันที่บังคับใช้ให้ถูกต้อง"></textarea></label>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button type="button" class="btn btn-ghost !text-rose-600 hover:!bg-rose-50" data-role="reject">${icon('x', 'h-4 w-4')}ตีกลับ</button>
        <button type="submit" class="btn btn-success">${icon('check', 'h-4 w-4')}อนุมัติและจัดเก็บ</button>
      </div>
    </form>`, { size: 'max-w-2xl' });
  const form = root.querySelector('form');
  bindDocFields(form, 'rv-');
  bindRevHint(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true, 'กำลังจัดเก็บ...');
    try {
      const res = await API.call('approveSubmission', { id, data: readDocFields(form), note: form.reviewNote.value.trim() });
      closeModal();
      toast(`จัดเก็บ ${res.document.docCode} Rev.${res.document.rev} แล้ว${res.replaced && res.replaced.length ? ` (Rev.${res.replaced.join(', ')} ย้ายเป็นประวัติ)` : ''}`);
      await loadData(true);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });

  form.querySelector('[data-role=reject]').addEventListener('click', async (e) => {
    const reason = form.reviewNote.value.trim();
    if (!reason) {
      toast('กรุณาระบุเหตุผลที่ตีกลับในช่องหมายเหตุ', 'error');
      form.reviewNote.focus();
      return;
    }
    const btn = e.currentTarget;
    setBusy(btn, true, 'กำลังบันทึก...');
    try {
      await API.call('rejectSubmission', { id, reason });
      closeModal();
      toast('ตีกลับเอกสารแล้ว', 'info');
      await loadData(true);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

/* ---------- Modal: เพิ่ม / แก้ไขเอกสาร ---------- */
function openDocForm(doc = null, preset = {}) {
  const edit = !!doc;
  const d = doc || preset;
  const root = openModal(`
    ${modalHeader(edit ? 'แก้ไขข้อมูลเอกสาร' : 'เพิ่มเอกสารเข้าระบบ', edit ? `${escapeHtml(doc.docCode)} Rev.${escapeHtml(doc.rev)}` : 'เอกสารที่เพิ่มโดยผู้ดูแลจะถูกจัดเก็บทันที')}
    <form class="p-5" novalidate>
      ${edit ? `<div class="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">${fileIcon(doc.fileName)}<div class="min-w-0"><p class="truncate text-sm text-slate-700">${escapeHtml(doc.fileName)}</p>
        <p class="text-xs text-slate-400">ต้องการเปลี่ยนไฟล์? ให้เพิ่มเป็น Revision ใหม่</p></div></div>`
        : `${dropZoneHtml('doc-drop', 'ตั้งชื่อไฟล์ตามรูปแบบ เช่น <span class="font-mono">SD-QA-11.01 Rev.03 แผนการ Swab Test.pdf</span> ระบบจะกรอกข้อมูลให้อัตโนมัติ')}<div class="h-4"></div>`}
      ${docFieldsHtml(d, { prefix: 'df-' })}
      <div class="rev-hint mt-3"></div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
        <button type="submit" class="btn btn-primary">${icon(edit ? 'check' : 'upload', 'h-4 w-4')}${edit ? 'บันทึก' : 'อัปโหลดและจัดเก็บ'}</button>
      </div>
    </form>`, { size: 'max-w-2xl' });
  const form = root.querySelector('form');
  const updCode = bindDocFields(form, 'df-');
  const updHint = bindRevHint(form, edit ? doc.id : undefined);
  if (!edit && !form.effectiveDate.value) form.effectiveDate.value = todayIso();
  let dz = null;
  if (!edit) {
    dz = bindDropZone(root.querySelector('#doc-drop'), (file) => {
      if (autofillFromFileName(form, file.name)) { updCode(); updHint(); toast('กรอกข้อมูลจากชื่อไฟล์ให้แล้ว กรุณาตรวจสอบ', 'info'); }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = dz && dz.getFile();
    if (!edit && !file) { toast('กรุณาเลือกไฟล์', 'error'); return; }
    if (!form.reportValidity()) return;
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true, edit ? 'กำลังบันทึก...' : 'กำลังอัปโหลด...');
    try {
      if (edit) {
        await API.call('updateDocument', { id: doc.id, data: readDocFields(form) });
        toast('บันทึกการแก้ไขแล้ว');
      } else {
        const base64 = await fileToBase64(file);
        const res = await API.call('addDocument', { data: readDocFields(form), file: { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, base64 } });
        toast(`จัดเก็บ ${res.document.docCode} Rev.${res.document.rev} แล้ว`);
      }
      closeModal();
      await loadData(true);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

/* ---------- Modal: ประวัติ Revision ---------- */
function openHistory(code) {
  const revs = revisionsOf(code);
  if (!revs.length) return;
  const top = revs[0];
  openModal(`
    ${modalHeader(`ประวัติ Revision · <span class="font-mono">${escapeHtml(code)}</span>`, escapeHtml(top.title))}
    <div class="p-5">
      <ol class="relative space-y-3 border-l border-slate-200 pl-5">
        ${revs.map((d) => `
        <li class="relative">
          <span class="absolute -left-[27px] top-3 h-3 w-3 rounded-full ring-4 ring-white ${d.status === 'Active' ? 'bg-teal-500' : 'bg-slate-300'}"></span>
          <div class="rounded-xl border ${d.status === 'Active' ? 'border-teal-200 bg-teal-50/30' : 'border-slate-200'} p-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2"><span class="font-mono font-semibold text-slate-800">Rev.${escapeHtml(d.rev)}</span>
                ${d.status === 'Active' ? '<span class="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-700">ใช้งานอยู่</span>' : '<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">ประวัติ</span>'}</div>
              <div class="flex gap-0.5">
                <button class="icon-btn" data-action="view" data-id="${d.id}" title="เปิดดู">${icon('eye', 'h-4 w-4')}</button>
                <button class="icon-btn" data-action="download" data-id="${d.id}" title="ดาวน์โหลด">${icon('download', 'h-4 w-4')}</button>
              </div>
            </div>
            <p class="mt-1 text-sm text-slate-600">${escapeHtml(d.title)}</p>
            <p class="mt-1 text-xs text-slate-400">บังคับใช้ ${formatDate(d.effectiveDate)} · ผู้จัดทำ ${escapeHtml(d.author)} · จัดเก็บ ${formatDate(d.createdAt)}</p>
          </div>
        </li>`).join('')}
      </ol>
      <div class="mt-5 flex justify-end">
        <button class="btn btn-primary" data-action="new-rev" data-code="${escapeHtml(code)}">${icon('plus', 'h-4 w-4')}เพิ่ม Revision ใหม่</button>
      </div>
    </div>`, { size: 'max-w-lg' });
}

/* ---------- ไฟล์: เปิดดู / ดาวน์โหลด / แชร์ ---------- */
async function fetchFile(kind, id, log) {
  return API.call('getFile', { id, kind, log });
}

async function viewFile(kind, id) {
  const item = kind === 'submission' ? S.subs.find((x) => x.id === id) : S.docs.find((x) => x.id === id);
  if (!item) return;
  // โหมดเชื่อมต่อจริง: เปิดตัวอย่างจาก Google Drive (รองรับ Word/Excel/PDF)
  if (!API.isDemo && item.fileId) {
    window.open(`https://drive.google.com/file/d/${encodeURIComponent(item.fileId)}/view`, '_blank', 'noopener');
    return;
  }
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:sans-serif;color:#64748b;padding:24px">กำลังโหลดไฟล์...</p>');
  try {
    const f = await fetchFile(kind, id, false);
    const url = URL.createObjectURL(base64ToBlob(f.base64, f.mimeType));
    if (w) w.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (w) w.close();
    toast(err.message, 'error');
  }
}

async function downloadFile(kind, id) {
  toast('กำลังเตรียมไฟล์...', 'info');
  try {
    const f = await fetchFile(kind, id, true);
    const url = URL.createObjectURL(base64ToBlob(f.base64, f.mimeType));
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function shareFile(id) {
  const d = S.docs.find((x) => x.id === id);
  if (!d) return;
  const ok = await confirmDialog({
    title: 'สร้างลิงก์สำหรับส่งต่อ',
    message: `ผู้ที่มีลิงก์จะสามารถเปิดดูและดาวน์โหลดไฟล์ <b>${escapeHtml(d.docCode)} Rev.${escapeHtml(d.rev)}</b> ได้ (ไม่สามารถแก้ไขได้)`,
    confirmText: 'สร้างลิงก์',
  });
  if (!ok) return;
  try {
    const { url } = await API.call('shareFile', { id });
    const root = openModal(`
      ${modalHeader('ลิงก์สำหรับส่งต่อ', `${escapeHtml(d.docCode)} Rev.${escapeHtml(d.rev)} · ${escapeHtml(d.title)}`)}
      <div class="p-5">
        <div class="flex gap-2"><input class="input font-mono !text-xs" value="${escapeHtml(url)}" readonly>
          <button class="btn btn-primary" data-role="copy">${icon('copy', 'h-4 w-4')}คัดลอก</button></div>
        <p class="mt-3 text-xs text-slate-400">ส่งลิงก์นี้ให้ผู้ที่ขอเอกสารทาง LINE หรือ Email ได้เลย</p>
      </div>`, { size: 'max-w-lg' });
    root.querySelector('[data-role=copy]').addEventListener('click', async () => {
      if (await copyText(url)) toast('คัดลอกลิงก์แล้ว');
    });
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteDoc(id) {
  const d = S.docs.find((x) => x.id === id);
  if (!d) return;
  const ok = await confirmDialog({
    title: 'ลบเอกสาร',
    message: `ต้องการลบ <b>${escapeHtml(d.docCode)} Rev.${escapeHtml(d.rev)}</b> ใช่หรือไม่? ไฟล์จะถูกย้ายไปถังขยะของ Google Drive (กู้คืนได้ภายใน 30 วัน)`,
    confirmText: 'ลบเอกสาร',
    danger: true,
  });
  if (!ok) return;
  try {
    await API.call('deleteDocument', { id });
    toast('ลบเอกสารแล้ว');
    await loadData(true);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openChangePassword() {
  const root = openModal(`
    ${modalHeader('เปลี่ยนรหัสผ่าน')}
    <form class="space-y-3 p-5">
      <label class="block"><span class="label">รหัสผ่านเดิม</span><input type="password" name="old" class="input" required autocomplete="current-password"></label>
      <label class="block"><span class="label">รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</span><input type="password" name="new1" class="input" required minlength="6" autocomplete="new-password"></label>
      <label class="block"><span class="label">ยืนยันรหัสผ่านใหม่</span><input type="password" name="new2" class="input" required minlength="6" autocomplete="new-password"></label>
      <div class="flex justify-end gap-2 pt-2"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึก</button></div>
    </form>`, { size: 'max-w-md' });
  root.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.new1.value !== f.new2.value) { toast('รหัสผ่านใหม่ไม่ตรงกัน', 'error'); return; }
    const btn = f.querySelector('button[type=submit]');
    setBusy(btn, true);
    try {
      await API.call('changePassword', { oldPassword: f.old.value, newPassword: f.new1.value });
      closeModal();
      toast('เปลี่ยนรหัสผ่านแล้ว');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

/* ---------- จัดการ Click ทั้งหมด ---------- */
async function onAction(e) {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  const id = el.dataset.id;
  const goDocs = (patch) => {
    S.f = { q: '', type: '', dept: '', status: 'Active', ...patch };
    S.page = 1;
    if (location.hash === '#/documents') route();
    else location.hash = '#/documents';
  };

  switch (a) {
    case 'open-sidebar': toggleSidebar(true); break;
    case 'close-sidebar': toggleSidebar(false); break;
    case 'refresh': loadData(true).then(() => toast('อัปเดตข้อมูลแล้ว', 'info')); break;
    case 'add-doc': toggleSidebar(false); openDocForm(); break;
    case 'goto-docs': goDocs({}); break;
    case 'goto-pending': location.hash = '#/pending'; break;
    case 'goto-dept': goDocs({ dept: el.dataset.dept }); break;
    case 'goto-type': goDocs({ type: el.dataset.type }); break;
    case 'goto-cell': goDocs({ dept: el.dataset.dept, type: el.dataset.type }); break;
    case 'filter':
      S.f[el.dataset.group] = el.dataset.value;
      S.page = 1;
      el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === el));
      renderDocTable();
      break;
    case 'clear-filter': S.f = { q: '', type: '', dept: '', status: 'Active' }; S.page = 1; renderDocuments(); break;
    case 'sort':
      S.sort = { key: el.dataset.key, dir: S.sort.key === el.dataset.key ? -S.sort.dir : 1 };
      renderDocTable();
      break;
    case 'page': S.page = Number(el.dataset.page); renderDocTable(); $('#doc-results').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'pending-tab': S.pendingTab = el.dataset.tab; renderPending(); break;
    case 'review': openReview(id); break;
    case 'view': viewFile('document', id); break;
    case 'view-sub': viewFile('submission', id); break;
    case 'download': downloadFile('document', id); break;
    case 'download-sub': downloadFile('submission', id); break;
    case 'share': shareFile(id); break;
    case 'edit': openDocForm(S.docs.find((d) => d.id === id)); break;
    case 'delete': deleteDoc(id); break;
    case 'history': openHistory(el.dataset.code); break;
    case 'new-rev': {
      const top = revisionsOf(el.dataset.code)[0];
      openDocForm(null, { docType: top.docType, dept: top.dept, docNo: top.docNo, rev: pad2(Number(top.rev) + 1), title: top.title, author: top.author });
      break;
    }
    case 'copy-submit-link': {
      const url = new URL('submit.html', location.href).href;
      if (await copyText(url)) toast('คัดลอกลิงก์หน้าส่งไฟล์แล้ว ส่งให้ผู้ส่งเอกสารได้เลย');
      break;
    }
    case 'change-password': toggleSidebar(false); openChangePassword(); break;
    case 'reset-demo': {
      const ok = await confirmDialog({ title: 'รีเซ็ตข้อมูลตัวอย่าง', message: 'ข้อมูลทดลองทั้งหมดใน Browser นี้จะถูกลบและสร้างใหม่', confirmText: 'รีเซ็ต', danger: true });
      if (ok) { await MockAPI.handle({ action: 'resetDemo' }); API.token = ''; S.loaded = false; location.hash = ''; showLogin(); }
      break;
    }
    case 'logout':
      try { await API.call('logout'); } catch (_) { /* ignore */ }
      API.token = '';
      S.loaded = false;
      showLogin();
      break;
    default: break;
  }
}

init();
