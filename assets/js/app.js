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
  reqs: [],
  reqTab: 'Pending',
  sig: '',
  syncedAt: 0,
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
    clearCache();
    S.loaded = false;
    showLogin();
  });
  // กลับมาที่แท็บนี้หลังไม่ได้ดูเกิน 1 นาที → อัปเดตข้อมูลเบื้องหลัง (เช่น มีเอกสารส่งเข้ามาใหม่)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && API.token && S.loaded && Date.now() - S.syncedAt > 60000 && !API.pending) loadData(true);
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
    // แสดงข้อมูลที่จำไว้ในเครื่องทันที แล้วค่อยอัปเดตจาก Server เบื้องหลัง
    const cached = loadCache();
    if (cached) {
      applyState(cached.d, { save: false });
      S.syncedAt = 0;
      route();
      setSync('cached', cached.at);
    }
    loadData(true);
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
    const { token, mustChangePassword } = await API.call('login', { password: e.target.password.value });
    API.token = token;
    e.target.reset();
    showApp();
    await loadData();
    if (mustChangePassword) openChangePassword(true);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setBusy(btn, false);
  }
}

async function loadData(silent = false) {
  const hadData = S.loaded;
  if (!hadData) main().innerHTML = skeleton();
  if (!(hadData && S.syncedAt === 0)) setSync('syncing'); // ถ้ากำลังแสดงข้อมูลจากแคช ให้คงข้อความ "ข้อมูลเมื่อ …" ไว้
  try {
    const d = await API.call('bootstrap');
    const changed = stateSig(d) !== S.sig;
    applyState(d);
    if (!hadData) route();
    else if (changed) rerender(); // มีข้อมูลเปลี่ยน → วาดใหม่โดยไม่รบกวนช่องค้นหา
    setSync('ok');
    return true;
  } catch (err) {
    if (err.code !== 'AUTH') {
      setSync('error');
      if (!S.loaded) main().innerHTML = errorState(err.message);
      else if (!silent) toast(err.message, 'error');
    }
    return false;
  }
}

/* ---------- แคชข้อมูลในเครื่อง (โหลดหน้าทันที) ---------- */
const cacheKey = () => `dc_cache_v1:${(window.APP_CONFIG && APP_CONFIG.API_URL) || 'demo'}`;
function loadCache() {
  if (API.isDemo) return null;
  const c = storageGet(cacheKey());
  return c && c.d && Array.isArray(c.d.documents) ? c : null;
}
function saveCache(d) {
  if (!API.isDemo) storageSet(cacheKey(), { at: Date.now(), d });
}
function clearCache() {
  storageRemove(cacheKey());
}
const stateSig = (d) => JSON.stringify([d.documents, d.submissions, d.logs, d.options, d.requests]);

/** วาดหน้าปัจจุบันใหม่ ถ้ากำลังพิมพ์ค้นหาอยู่จะอัปเดตเฉพาะตาราง */
function rerender() {
  if (S.view === 'documents' && $('#doc-results') && document.activeElement === $('#doc-search')) renderDocTable();
  else VIEWS[S.view].render();
}

function setSync(state, at) {
  const el = $('#sync-status');
  if (!el) return;
  const hhmm = (t) => new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const text = {
    syncing: 'กำลังอัปเดต…',
    cached: `ข้อมูลเมื่อ ${hhmm(at || Date.now())} · กำลังอัปเดต…`,
    ok: `อัปเดตล่าสุด ${hhmm(Date.now())}`,
    error: 'เชื่อมต่อไม่ได้ · แสดงข้อมูลล่าสุดที่มี',
  }[state];
  el.textContent = text;
  el.classList.toggle('text-amber-600', state === 'error');
  el.classList.toggle('text-slate-400', state !== 'error');
}

function applyState(d, { save = true } = {}) {
  S.sig = stateSig(d);
  S.syncedAt = Date.now();
  if (save) saveCache(d);
  S.docs = (d.documents || []).map((x) => ({ ...x, submittedAt: x.submittedAt || x.createdAt })); // ข้อมูลเก่าไม่มี submittedAt
  S.subs = d.submissions || [];
  S.reqs = d.requests || [];
  S.logs = d.logs || [];
  applyOptions(d.options);
  S.loaded = true;
  updateBadge();
}

/** หลังบันทึก: ใช้ข้อมูลที่ Server ส่งกลับมาเลย (ไม่ต้องโหลดซ้ำอีกรอบ) */
async function refreshAfterSave() {
  const st = API.takeState();
  if (st) {
    applyState(st);
    route();
    setSync('ok');
  } else {
    await loadData(true);
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
  const r = S.reqs.filter((x) => x.status === 'Pending').length;
  const rb = $('#req-badge');
  rb.textContent = r;
  rb.classList.toggle('hidden', !r);
  document.title = `${n + r ? `(${n + r}) ` : ''}DCC · Document Control Center`;
}

/* ---------------- Router ---------------- */
const VIEWS = {
  dashboard: { title: 'ภาพรวม', render: renderDashboard },
  documents: { title: 'เอกสารทั้งหมด', render: renderDocuments },
  pending: { title: 'รอตรวจสอบ', render: renderPending },
  settings: { title: 'ตั้งค่าแผนกและประเภทเอกสาร', render: renderSettings },
  requests: { title: 'คำขอไฟล์', render: renderRequests },
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
/** รหัสที่ควรแสดงใน Filter/Dashboard: เปิดใช้งานอยู่ หรือยังมีเอกสารใช้รหัสนั้น */
function visibleCodes(kind) {
  const obj = kind === 'type' ? DOC_TYPES : DEPTS;
  const field = kind === 'type' ? 'docType' : 'dept';
  return Object.keys(obj).filter((k) => obj[k].active || S.docs.some((d) => d[field] === k));
}
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
  SETTING: ['ตั้งค่า', 'bg-slate-100 text-slate-600', 'cog'],
  REQUEST: ['ขอไฟล์', 'bg-sky-50 text-sky-600', 'inbox'],
  SEND: ['ส่งไฟล์ทางอีเมล', 'bg-emerald-50 text-emerald-600', 'send'],
  DENY: ['ปฏิเสธคำขอไฟล์', 'bg-rose-50 text-rose-500', 'x'],
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
  const deptKeys = visibleCodes('dept');
  const typeKeys = visibleCodes('type');
  const byDept = deptKeys.map((k) => ({ k, n: active.filter((d) => d.dept === k).length }));
  const maxDept = Math.max(1, ...byDept.map((x) => x.n));
  // แยกตามประเภท
  const byType = typeKeys.map((k) => ({ k, n: active.filter((d) => d.docType === k).length }));
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
            <span class="hidden w-36 truncate text-sm text-slate-500 sm:block">${escapeHtml(DEPTS[k].th)}</span>
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
            <p class="mt-1 truncate text-xs text-slate-400">${escapeHtml(DOC_TYPES[k].name)}</p>
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
        <thead class="thead-strong"><tr class="text-xs">
          <th class="px-3 py-2.5 text-left font-medium">แผนก</th>
          ${typeKeys.map((t) => `<th class="px-2 py-2 text-center font-medium">${t}</th>`).join('')}
          <th class="px-2 py-2 text-center font-medium">รวม</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          ${deptKeys.map((dp) => {
            const row = typeKeys.map((t) => active.filter((d) => d.dept === dp && d.docType === t).length);
            const sum = row.reduce((a, b) => a + b, 0);
            return `<tr><td class="px-3 py-2"><span class="font-mono text-xs font-semibold text-slate-700">${dp}</span> <span class="text-slate-500">${escapeHtml(DEPTS[dp].th)}</span></td>
              ${row.map((n, i) => `<td class="px-2 py-1 text-center">${n ? `<button class="min-w-[2rem] rounded-md px-2 py-1 font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-700" data-action="goto-cell" data-dept="${dp}" data-type="${typeKeys[i]}">${n}</button>` : '<span class="text-slate-300">–</span>'}</td>`).join('')}
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
        ${visibleCodes('type').map((k) => chip('type', k, `<span class="chip-dot h-2 w-2 rounded-full ${DOC_TYPES[k].bar}"></span>${k}`, DOC_TYPES[k].name)).join('')}
        <a href="#/settings" class="ml-1 shrink-0 text-xs text-slate-400 hover:text-teal-600" title="เพิ่ม/แก้ไขประเภทเอกสาร">${icon('plus', 'h-4 w-4')}</a>
      </div>
      <div class="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
        <span class="w-14 shrink-0 text-xs font-medium text-slate-400">แผนก</span>
        ${chip('dept', '', 'ทั้งหมด')}
        ${visibleCodes('dept').map((k) => chip('dept', k, k, `${DEPTS[k].name} (${DEPTS[k].th})`)).join('')}
        <a href="#/settings" class="ml-1 shrink-0 text-xs text-slate-400 hover:text-teal-600" title="เพิ่ม/แก้ไขแผนก">${icon('plus', 'h-4 w-4')}</a>
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
    return `<th class="px-3 py-3 text-left text-xs ${on ? 'sorted' : ''} ${cls}">
      ${key ? `<button class="inline-flex items-center gap-1" data-action="sort" data-key="${key}">${label}<span class="${on ? '' : 'opacity-0'}">${icon(on && S.sort.dir < 0 ? 'down' : 'up', 'h-3 w-3')}</span></button>` : label}</th>`;
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
      <table class="table-docs w-full min-w-[960px] text-sm">
        <thead class="thead-strong"><tr>
          ${th('docCode', 'รหัสเอกสาร', 'pl-4')}${th('title', 'ชื่อเอกสาร')}${th('dept', 'แผนก')}${th('rev', 'Revision')}
          ${th('effectiveDate', 'วันที่บังคับใช้')}${th('submittedAt', 'ส่งเข้าระบบ')}${th('', 'ไฟล์')}${th('author', 'ผู้จัดทำ')}
          <th class="sticky-col px-2 py-3 pr-3 text-right text-xs">จัดการ</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          ${rows.map((d) => {
            const revCount = S.docs.filter((x) => x.docCode === d.docCode).length;
            const future = d.effectiveDate > today;
            const t = DOC_TYPES[d.docType];
            return `<tr>
            <td class="px-3 py-2.5 pl-4"><div class="flex items-center gap-2 whitespace-nowrap" title="${escapeHtml(t ? `${d.docType} · ${t.name}` : d.docType)}">
              <span class="h-2 w-2 shrink-0 rounded-full ${t ? t.bar : 'bg-slate-300'}"></span><span class="font-mono text-[13px] font-semibold text-slate-800">${highlight(d.docCode, tokens)}</span></div></td>
            <td class="max-w-[300px] px-3 py-2.5"><button class="flex w-full min-w-0 items-center gap-2 text-left" data-action="detail" data-id="${d.id}" title="ดูรายละเอียด: ${escapeHtml(d.title)}">
              <span class="truncate font-medium text-slate-700 hover:text-teal-700">${highlight(d.title, tokens)}</span>
              ${d.status === 'Obsolete' ? '<span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Rev เก่า</span>' : ''}</button></td>
            <td class="px-3 py-2.5"><span class="font-mono text-xs font-semibold text-slate-600" title="${escapeHtml(deptName(d.dept))}">${d.dept}</span></td>
            <td class="px-3 py-2.5 whitespace-nowrap"><button class="rounded-md px-1 font-mono text-[13px] text-slate-700 hover:bg-teal-50 hover:text-teal-700" data-action="detail" data-id="${d.id}" title="ดูประวัติ Revision">Rev.${escapeHtml(d.rev)}${revCount > 1 ? `<sup class="ml-0.5 text-[10px] text-slate-400">${revCount}</sup>` : ''}</button></td>
            <td class="px-3 py-2.5 whitespace-nowrap ${future ? 'text-amber-600' : 'text-slate-600'}" ${future ? 'title="ยังไม่ถึงวันบังคับใช้"' : ''}>${formatDate(d.effectiveDate)}${future ? icon('clock', 'ml-1 inline h-3.5 w-3.5 -mt-0.5') : ''}</td>
            <td class="px-3 py-2.5 whitespace-nowrap text-slate-600" title="ส่งเข้าระบบโดย ${escapeHtml(d.submitter || '-')}">${formatDate(d.submittedAt)} <span class="text-xs text-slate-400">${formatDateTime(d.submittedAt).slice(11)}</span></td>
            <td class="px-3 py-2.5"><button class="file-chip" data-action="view" data-id="${d.id}" title="${escapeHtml(d.fileName)} (${formatSize(d.fileSize)})">
              <span class="font-bold uppercase ${fileExtColor(d.fileName)}">${escapeHtml(fileExt(d.fileName) || 'file')}</span>${icon('eye', 'h-3.5 w-3.5')}เปิดดู</button></td>
            <td class="px-3 py-2.5 whitespace-nowrap text-slate-600">${highlight(d.author, tokens)}</td>
            <td class="sticky-col px-2 py-1.5 pr-3"><div class="flex justify-end">
              <button class="icon-btn" data-action="download" data-id="${d.id}" title="ดาวน์โหลด">${icon('download', 'h-[18px] w-[18px]')}</button>
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
    body = done.length ? `<div class="card overflow-x-auto scrollbar-thin"><table class="w-full min-w-[880px] text-sm">
      <thead class="thead-strong text-xs"><tr>
        <th class="px-4 py-3 text-left font-medium">เลขอ้างอิง</th><th class="px-3 py-3 text-left font-medium">เอกสาร</th>
        <th class="px-3 py-3 text-left font-medium">ผู้ส่ง</th><th class="px-3 py-3 text-left font-medium">ส่งเข้าระบบ</th><th class="px-3 py-3 text-left font-medium">ผลการตรวจ</th>
        <th class="px-3 py-3 text-left font-medium">วันที่ตรวจ</th><th class="px-3 py-3 text-left font-medium">หมายเหตุ</th></tr></thead>
      <tbody class="divide-y divide-slate-100">${done.map((s) => `<tr>
        <td class="px-4 py-3 font-mono text-xs text-slate-500">${escapeHtml(s.refNo)}</td>
        <td class="px-3 py-3"><p class="font-mono text-[13px] font-semibold text-slate-700">${escapeHtml(s.docCode)} <span class="font-normal text-slate-400">Rev.${escapeHtml(s.rev)}</span></p><p class="max-w-[240px] truncate text-xs text-slate-500">${escapeHtml(s.title)}</p></td>
        <td class="px-3 py-3 text-slate-600">${escapeHtml(s.submitter)}</td>
        <td class="px-3 py-3 whitespace-nowrap text-slate-500">${formatDateTime(s.submittedAt)}</td>
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
      ${s.note ? `<div class="mt-2 rounded-lg bg-slate-50 p-2 text-slate-600"><p class="text-[11px] font-medium text-slate-400">เนื้อหาที่มีการแก้ไข</p><p class="mt-0.5 whitespace-pre-line">${escapeHtml(s.note)}</p></div>` : ''}
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

/** ข้อความหลังจัดเก็บสำเร็จ (ไม่พังถ้า Server ตอบกลับไม่ครบ) */
function savedMessage(res) {
  const d = res && res.document;
  if (!d) {
    console.warn('DCC: unexpected save response', res);
    return 'จัดเก็บเอกสารแล้ว';
  }
  const replaced = res.replaced && res.replaced.length ? ` (Rev.${res.replaced.join(', ')} ย้ายเป็นประวัติ)` : '';
  return `จัดเก็บ ${d.docCode} Rev.${d.rev} แล้ว${replaced}`;
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
      <div class="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        <p><span class="text-slate-400">ส่งเข้าระบบเมื่อ:</span> ${formatDateTime(s.submittedAt)} น.</p>
        ${s.contact ? `<p class="mt-1"><span class="text-slate-400">ติดต่อผู้ส่ง:</span> ${escapeHtml(s.contact)}</p>` : ''}</div>
      <p class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">ข้อมูลเอกสาร (แก้ไขได้ก่อนอนุมัติ)</p>
      ${docFieldsHtml(s, { prefix: 'rv-' })}
      <div class="rev-hint mt-3"></div>
      <label class="mt-3 block"><span class="label">เนื้อหาที่มีการแก้ไข</span>
        <textarea name="changeNote" rows="2" class="input" placeholder="เช่น ปรับรอบความถี่การ Swab / จัดทำใหม่">${escapeHtml(s.note || '')}</textarea></label>
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
      const res = await API.call('approveSubmission', { id, data: { ...readDocFields(form), note: form.changeNote.value.trim() }, note: form.reviewNote.value.trim() });
      closeModal();
      toast(savedMessage(res));
      await refreshAfterSave();
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
      await refreshAfterSave();
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
      <label class="mt-3 block"><span class="label">เนื้อหาที่มีการแก้ไข</span>
        <textarea name="changeNote" rows="2" class="input" placeholder="เช่น ปรับรอบความถี่การ Swab / จัดทำใหม่">${escapeHtml(d.note || '')}</textarea></label>
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
        await API.call('updateDocument', { id: doc.id, data: { ...readDocFields(form), note: form.changeNote.value.trim() } });
        toast('บันทึกการแก้ไขแล้ว');
      } else {
        const base64 = await fileToBase64(file);
        const res = await API.call('addDocument', { data: { ...readDocFields(form), note: form.changeNote.value.trim() }, file: { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, base64 } });
        toast(savedMessage(res));
      }
      closeModal();
      await refreshAfterSave();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

/* ---------- Modal: รายละเอียดเอกสาร + ประวัติ Revision ---------- */
function openDetail(id) {
  const d = S.docs.find((x) => x.id === id);
  if (!d) return;
  const revs = revisionsOf(d.docCode);
  const t = DOC_TYPES[d.docType];
  const field = (label, val, cls = '') => `<div class="${cls}"><dt class="text-xs text-slate-400">${label}</dt><dd class="mt-0.5 text-sm text-slate-700">${val}</dd></div>`;
  const statusPill = (x) => (x.status === 'Active'
    ? '<span class="shrink-0 whitespace-nowrap rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-inset ring-teal-200">ใช้งานอยู่</span>'
    : '<span class="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Rev เก่า</span>');
  openModal(`
    ${modalHeader(`<span class="font-mono">${escapeHtml(d.docCode)}</span> <span class="font-normal text-slate-400">Rev.${escapeHtml(d.rev)}</span>`, escapeHtml(d.title))}
    <div class="p-5">
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-primary !py-2" data-action="view" data-id="${d.id}">${icon('eye', 'h-4 w-4')}เปิดดู</button>
        <button class="btn btn-ghost !py-2" data-action="download" data-id="${d.id}">${icon('download', 'h-4 w-4')}ดาวน์โหลด</button>
        <button class="btn btn-ghost !py-2" data-action="share" data-id="${d.id}">${icon('link', 'h-4 w-4')}ลิงก์ส่งต่อ</button>
        <button class="btn btn-ghost !py-2" data-action="edit" data-id="${d.id}">${icon('pencil', 'h-4 w-4')}แก้ไขข้อมูล</button>
        <button class="btn btn-soft !py-2" data-action="qr-doc" data-id="${d.id}" title="ให้ผู้ขอสแกนเพื่อขอไฟล์นี้">${icon('qr', 'h-4 w-4')}QR ขอไฟล์นี้</button>
      </div>

      <dl class="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        ${field('ประเภท', `${typeBadge(d.docType)} <span class="ml-1">${escapeHtml(t ? t.name : '')}</span>`)}
        ${field('แผนก', `<span class="font-mono font-semibold">${escapeHtml(d.dept)}</span> <span class="text-slate-500">${escapeHtml(deptName(d.dept))}</span>`)}
        ${field('สถานะ', statusPill(d))}
        ${field('วันที่บังคับใช้', formatDate(d.effectiveDate))}
        ${field('ส่งเข้าระบบ', `${formatDateTime(d.submittedAt)} น.`)}
        ${field('ผู้จัดทำ', escapeHtml(d.author))}
        ${field('ส่งโดย', escapeHtml(d.submitter || '-'))}
        ${field('ไฟล์', `<span class="block truncate" title="${escapeHtml(d.fileName)}">${escapeHtml(d.fileName)}</span><span class="text-xs text-slate-400">${formatSize(d.fileSize)}</span>`, 'col-span-2')}
      </dl>
      ${d.note ? `<div class="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><p class="text-xs text-slate-400">เนื้อหาที่มีการแก้ไข</p><p class="mt-1 whitespace-pre-line text-slate-700">${escapeHtml(d.note)}</p></div>` : ''}

      <div class="mt-6 flex items-center justify-between">
        <h4 class="text-sm font-semibold text-slate-800">ประวัติ Revision <span class="font-normal text-slate-400">${revs.length}</span></h4>
        <button class="text-sm font-medium text-teal-600 hover:underline" data-action="new-rev" data-code="${escapeHtml(d.docCode)}">+ เพิ่ม Revision ใหม่</button>
      </div>
      <ul class="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        ${revs.map((r) => `
        <li class="flex items-center gap-3 px-3 py-2.5 ${r.id === d.id ? 'bg-teal-50/50' : 'hover:bg-slate-50'}">
          <button class="flex min-w-0 flex-1 items-center gap-3 text-left" data-action="detail" data-id="${r.id}" ${r.id === d.id ? 'disabled' : ''}>
            <span class="w-14 font-mono text-sm font-semibold text-slate-800">Rev.${escapeHtml(r.rev)}</span>
            ${statusPill(r)}
            <span class="hidden truncate text-xs text-slate-400 sm:block">บังคับใช้ ${formatDate(r.effectiveDate)} · ส่ง ${formatDate(r.submittedAt)}${r.note ? ` · ${escapeHtml(r.note)}` : ''}</span>
          </button>
          <button class="icon-btn" data-action="view" data-id="${r.id}" title="เปิดดู">${icon('eye', 'h-4 w-4')}</button>
          <button class="icon-btn" data-action="download" data-id="${r.id}" title="ดาวน์โหลด">${icon('download', 'h-4 w-4')}</button>
        </li>`).join('')}
      </ul>
    </div>`, { size: 'max-w-2xl' });
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
    const url = URL.createObjectURL(base64ToBlob(f.base64, safeMime(f.name)));
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
    const url = URL.createObjectURL(base64ToBlob(f.base64, safeMime(f.name)));
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
    await refreshAfterSave();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openChangePassword(forced = false) {
  const root = openModal(`
    ${modalHeader('เปลี่ยนรหัสผ่าน')}
    <form class="space-y-3 p-5">
      ${forced ? `<div class="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">${icon('warning', 'h-5 w-5 shrink-0')}<p>คุณยังใช้รหัสผ่านเริ่มต้นอยู่ ซึ่งใคร ๆ ก็เดาได้ กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน</p></div>` : ''}
      <label class="block"><span class="label">รหัสผ่านเดิม</span><input type="password" name="old" class="input" required autocomplete="current-password"></label>
      <label class="block"><span class="label">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</span><input type="password" name="new1" class="input" required minlength="8" autocomplete="new-password"></label>
      <label class="block"><span class="label">ยืนยันรหัสผ่านใหม่</span><input type="password" name="new2" class="input" required minlength="8" autocomplete="new-password"></label>
      <div class="flex justify-end gap-2 pt-2"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึก</button></div>
    </form>`, { size: 'max-w-md' });
  root.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.new1.value !== f.new2.value) { toast('รหัสผ่านใหม่ไม่ตรงกัน', 'error'); return; }
    const btn = f.querySelector('button[type=submit]');
    setBusy(btn, true);
    try {
      const res = await API.call('changePassword', { oldPassword: f.old.value, newPassword: f.new1.value });
      if (res && res.token) API.token = res.token; // เครื่องอื่นที่ Login ค้างไว้จะถูกออกจากระบบ
      closeModal();
      toast('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นที่เคย Login จะต้องเข้าสู่ระบบใหม่');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

/* =============================================================
 * คำขอไฟล์จากพนักงาน
 * ============================================================= */
function requestDocs(r) {
  let ids = [];
  try { ids = JSON.parse(r.docIds || '[]'); } catch (e) { /* ignore */ }
  return ids.map((id) => S.docs.find((d) => d.id === id) || { id, missing: true });
}

function renderRequests() {
  const pending = S.reqs.filter((r) => r.status === 'Pending').sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  const done = S.reqs.filter((r) => r.status !== 'Pending').sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || ''));
  const tab = (key, label, n) => `<button class="relative px-1 pb-3 text-sm font-medium ${S.reqTab === key ? 'text-teal-700' : 'text-slate-500 hover:text-slate-700'}" data-action="req-tab" data-tab="${key}">
    ${label} <span class="ml-1 rounded-full px-1.5 text-xs ${S.reqTab === key ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}">${n}</span>
    ${S.reqTab === key ? '<span class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-teal-600"></span>' : ''}</button>`;

  let body;
  if (S.reqTab === 'Pending') {
    body = pending.length ? `<div class="grid gap-3 lg:grid-cols-2">${pending.map(requestCard).join('')}</div>`
      : `<div class="card flex flex-col items-center px-6 py-16 text-center">
          <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">${icon('check')}</div>
          <p class="font-medium text-slate-700">ไม่มีคำขอไฟล์รอดำเนินการ</p>
          <p class="mt-1 text-sm text-slate-500">ส่งลิงก์หน้ารายการเอกสารให้พนักงาน เพื่อค้นหาและขอไฟล์</p>
          <button class="btn btn-ghost mt-4" data-action="copy-library-link">${icon('link', 'h-4 w-4')}คัดลอกลิงก์หน้ารายการเอกสาร</button></div>`;
  } else {
    body = done.length ? `<div class="card overflow-x-auto scrollbar-thin"><table class="w-full min-w-[900px] text-sm">
      <thead class="thead-strong text-xs"><tr>
        <th class="px-4 py-3 text-left font-medium">ผู้ขอ</th><th class="px-3 py-3 text-left font-medium">เอกสาร</th>
        <th class="px-3 py-3 text-left font-medium">วัตถุประสงค์</th><th class="px-3 py-3 text-left font-medium">ผล</th>
        <th class="px-3 py-3 text-left font-medium">วันที่ดำเนินการ</th><th class="px-3 py-3 text-left font-medium">หมายเหตุ</th></tr></thead>
      <tbody class="divide-y divide-slate-100">${done.map((r) => `<tr>
        <td class="px-4 py-3"><p class="font-medium text-slate-700">${escapeHtml(r.name)} <span class="font-mono text-xs text-slate-500">${escapeHtml(r.dept)}</span></p><p class="text-xs text-slate-400">${escapeHtml(r.email)}</p></td>
        <td class="px-3 py-3 font-mono text-xs text-slate-600">${escapeHtml(r.docLabels).split('; ').join('<br>')}</td>
        <td class="max-w-[220px] px-3 py-3 text-slate-500"><p class="line-clamp-2" title="${escapeHtml(r.purpose)}">${escapeHtml(r.purpose)}</p></td>
        <td class="px-3 py-3">${r.status === 'Approved' ? `<span class="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">ส่งแล้ว ${escapeHtml(r.sentCount || '')} ไฟล์</span>` : '<span class="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">ปฏิเสธ</span>'}</td>
        <td class="whitespace-nowrap px-3 py-3 text-slate-500">${formatDateTime(r.reviewedAt)}</td>
        <td class="max-w-[220px] truncate px-3 py-3 text-slate-500" title="${escapeHtml(r.reviewNote)}">${escapeHtml(r.reviewNote || '-')}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card py-12">${emptyMini('clock', 'ยังไม่มีประวัติการส่งไฟล์')}</div>`;
  }
  main().innerHTML = `
    <div class="mb-4 flex gap-6 border-b border-slate-200">${tab('Pending', 'รอดำเนินการ', pending.length)}${tab('Done', 'ประวัติการแจกจ่ายเอกสาร', done.length)}</div>
    ${body}`;
}

function requestCard(r) {
  const docs = requestDocs(r);
  return `
  <div class="card flex flex-col p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="font-semibold text-slate-800">${escapeHtml(r.name)} <span class="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600" title="${escapeHtml(deptName(r.dept))}">${escapeHtml(r.dept)}</span></p>
        <p class="mt-0.5 select-all truncate text-sm text-slate-500">${escapeHtml(r.email)}</p>
      </div>
      <p class="shrink-0 text-right text-xs text-slate-400">${formatDateTime(r.requestedAt)}<br>${timeAgo(r.requestedAt)}</p>
    </div>
    <div class="mt-3 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600"><p class="text-[11px] font-medium text-slate-400">วัตถุประสงค์</p><p class="mt-0.5 whitespace-pre-line">${escapeHtml(r.purpose)}</p></div>
    <p class="mb-1.5 mt-3 text-xs font-medium text-slate-400">เอกสารที่ขอ ${docs.length} รายการ</p>
    <ul class="space-y-1">${docs.map((d) => d.missing
      ? '<li class="rounded-lg px-2 py-1.5 text-sm text-rose-600">เอกสารถูกลบออกจากระบบแล้ว</li>'
      : `<li class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
          <span class="font-mono text-[13px] font-semibold text-slate-800">${escapeHtml(d.docCode)}</span><span class="font-mono text-xs text-slate-500">Rev.${escapeHtml(d.rev)}</span>
          <span class="min-w-0 flex-1 truncate text-slate-600">${escapeHtml(d.title)}</span>
          ${d.status === 'Active' ? '' : '<span class="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">Rev เก่า</span>'}
          <button class="icon-btn !h-7 !w-7" data-action="view" data-id="${d.id}" title="เปิดดู">${icon('eye', 'h-4 w-4')}</button></li>`).join('')}</ul>
    <div class="mt-auto flex items-center gap-2 pt-4">
      <button class="btn btn-ghost flex-1 !text-rose-600 hover:!bg-rose-50" data-action="req-reject" data-id="${r.id}">${icon('x', 'h-4 w-4')}ปฏิเสธ</button>
      <button class="btn btn-success flex-[2]" data-action="req-approve" data-id="${r.id}">${icon('send', 'h-4 w-4')}อนุมัติและส่งอีเมล</button>
    </div>
  </div>`;
}

async function approveRequest(id, btn) {
  const r = S.reqs.find((x) => x.id === id);
  if (!r) return;
  const n = requestDocs(r).filter((d) => !d.missing).length;
  const note = await confirmDialog({
    title: 'อนุมัติและส่งไฟล์ทางอีเมล',
    message: `ระบบจะส่งไฟล์ PDF ${n} รายการ เป็นไฟล์แนบไปที่ <b>${escapeHtml(r.email)}</b>`,
    confirmText: 'ส่งอีเมล',
    input: { placeholder: 'หมายเหตุถึงผู้ขอ (ไม่บังคับ)' },
  });
  if (note === false) return;
  setBusy(btn, true, 'กำลังส่ง...');
  try {
    const res = await API.call('approveRequest', { id, note });
    toast(`ส่งไฟล์ ${res.sent} รายการไปที่ ${r.email} แล้ว`);
    await refreshAfterSave();
  } catch (err) {
    toast(err.message, 'error');
    setBusy(btn, false);
  }
}

async function rejectRequest(id, btn) {
  const r = S.reqs.find((x) => x.id === id);
  if (!r) return;
  const reason = await confirmDialog({
    title: 'ปฏิเสธคำขอไฟล์',
    message: `ระบบจะส่งอีเมลแจ้งเหตุผลไปที่ <b>${escapeHtml(r.email)}</b>`,
    confirmText: 'ปฏิเสธคำขอ',
    danger: true,
    input: { placeholder: 'เหตุผล เช่น เอกสารไม่เกี่ยวข้องกับงานของแผนก', required: true },
  });
  if (!reason) return;
  setBusy(btn, true);
  try {
    await API.call('rejectRequest', { id, reason });
    toast('ปฏิเสธคำขอแล้ว', 'info');
    await refreshAfterSave();
  } catch (err) {
    toast(err.message, 'error');
    setBusy(btn, false);
  }
}

/* =============================================================
 * QR Code: ป้ายตั้งโต๊ะ และ QR ขอไฟล์ฉบับเจาะจง
 * ============================================================= */
function qrCard(title, desc, url, fileName, posterFor) {
  return `
  <div class="flex flex-col items-center rounded-2xl border border-slate-200 p-4 text-center">
    <p class="font-semibold text-slate-800">${title}</p>
    <p class="mt-0.5 text-xs text-slate-500">${desc}</p>
    <div class="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">${qrSvg(url, 180, title)}</div>
    <p class="mt-2 w-full select-all break-all font-mono text-[11px] text-slate-400">${escapeHtml(url)}</p>
    <div class="mt-3 grid w-full grid-cols-3 gap-1.5">
      <button class="btn btn-ghost !px-2 !py-1.5 text-xs" data-action="qr-copy" data-url="${escapeHtml(url)}">${icon('link', 'h-3.5 w-3.5')}ลิงก์</button>
      <button class="btn btn-ghost !px-2 !py-1.5 text-xs" data-action="qr-download" data-url="${escapeHtml(url)}" data-caption="${escapeHtml(title)}" data-file="${fileName}">${icon('download', 'h-3.5 w-3.5')}รูป</button>
      <a class="btn btn-primary !px-2 !py-1.5 text-xs" href="qr.html?for=${posterFor}" target="_blank" rel="noopener">${icon('printer', 'h-3.5 w-3.5')}พิมพ์</a>
    </div>
  </div>`;
}

function openQrLinks() {
  openModal(`
    ${modalHeader('QR Code ติดโต๊ะ', 'คนที่เดินมาขอเอกสาร สแกนได้เลย ไม่ต้องแอดไลน์เพื่อส่งลิงก์')}
    <div class="p-5">
      <div class="grid gap-3 sm:grid-cols-2">
        ${qrCard('ขอเอกสาร', 'ค้นหาเอกสาร · ขอไฟล์ PDF ทางอีเมล', siteUrl('library.html'), 'DCC-QR-request.png', 'library')}
        ${qrCard('ส่งเอกสาร', 'ส่งไฟล์ PDF เข้าระบบให้ตรวจ', siteUrl('submit.html'), 'DCC-QR-submit.png', 'submit')}
      </div>
      <p class="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">กด <b>พิมพ์</b> เพื่อเปิดป้ายขนาด A5 พร้อมวิธีใช้ แล้วพิมพ์ตั้งไว้ที่โต๊ะ · ถ้าคนมาขอเอกสารฉบับเจาะจง เปิดรายละเอียดเอกสารนั้นแล้วกด <b>QR ขอไฟล์นี้</b></p>
    </div>`, { size: 'max-w-2xl' });
}

function openQrDoc(id) {
  const d = S.docs.find((x) => x.id === id);
  if (!d) return;
  const url = siteUrl('library.html', `req=${d.id}`);
  const caption = `${d.docCode} Rev.${d.rev}`;
  openModal(`
    ${modalHeader('QR ขอไฟล์นี้', 'ให้ผู้ขอสแกนด้วยกล้องมือถือ ฟอร์มขอไฟล์ฉบับนี้จะเปิดขึ้นทันที')}
    <div class="flex flex-col items-center p-6 text-center">
      <p class="font-mono text-lg font-semibold text-slate-800">${escapeHtml(d.docCode)} <span class="text-slate-400">Rev.${escapeHtml(d.rev)}</span></p>
      <p class="text-sm text-slate-500">${escapeHtml(d.title)}</p>
      ${d.status === 'Active' ? '' : '<p class="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">ฉบับนี้เป็น Rev เก่า (ไม่ใช่ฉบับใช้งาน)</p>'}
      <div class="mt-4 rounded-2xl p-2 ring-2 ring-teal-500">${qrSvg(url, 260, `QR ขอไฟล์ ${caption}`)}</div>
      <p class="mt-3 text-sm text-slate-600">ผู้ขอกรอก ชื่อ · แผนก · อีเมล แล้วกดส่งคำขอ<br>คำขอจะเข้ามาที่เมนู <b>คำขอไฟล์</b> ให้คุณอนุมัติ</p>
      <div class="mt-4 flex gap-2">
        <button class="btn btn-ghost" data-action="qr-copy" data-url="${escapeHtml(url)}">${icon('link', 'h-4 w-4')}คัดลอกลิงก์</button>
        <button class="btn btn-ghost" data-action="qr-download" data-url="${escapeHtml(url)}" data-caption="${escapeHtml(caption)}" data-file="DCC-QR-${escapeHtml(d.docCode)}-Rev${escapeHtml(d.rev)}.png">${icon('download', 'h-4 w-4')}ดาวน์โหลดรูป</button>
      </div>
    </div>`, { size: 'max-w-md' });
}

/* =============================================================
 * ตั้งค่า: แผนก / ประเภทเอกสาร
 * ============================================================= */
const KIND_META = {
  dept: { title: 'แผนก', desc: 'ใช้เป็นส่วนที่ 2 ของรหัสเอกสาร เช่น SD-<b>QA</b>-11.01', field: 'dept', example: 'PC', exampleName: 'Purchasing', exampleTh: 'ฝ่ายจัดซื้อ' },
  type: { title: 'ประเภทเอกสาร', desc: 'ใช้เป็นส่วนที่ 1 ของรหัสเอกสาร เช่น <b>SD</b>-QA-11.01', field: 'docType', example: 'MN', exampleName: 'Manual', exampleTh: 'คู่มือ' },
};

function renderSettings() {
  main().innerHTML = `
    <div class="mb-4 flex items-start gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800">
      ${icon('info', 'h-5 w-5 shrink-0')}
      <p>เพิ่มแผนกหรือประเภทเอกสารใหม่ได้ที่นี่ ระบบจะนำไปใช้ใน Filter, Dashboard, หน้าส่งเอกสาร และการอ่านชื่อไฟล์อัตโนมัติทันที
      · ถ้าเลิกใช้ให้กด <b>ปิดใช้งาน</b> (เอกสารเดิมยังค้นหาได้ แต่จะเลือกใช้กับเอกสารใหม่ไม่ได้)</p>
    </div>
    <div class="grid gap-4 xl:grid-cols-2">${optionCard('dept')}${optionCard('type')}</div>`;
}

function optionCard(kind) {
  const m = KIND_META[kind];
  const list = optionList(kind);
  return `
  <section class="card overflow-hidden">
    <div class="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div><h3 class="font-semibold text-slate-800">${m.title} <span class="ml-1 text-sm font-normal text-slate-400">${list.length}</span></h3>
        <p class="mt-0.5 text-xs text-slate-500">${m.desc}</p></div>
      <button class="btn btn-primary !px-3 !py-1.5 text-sm" data-action="opt-add" data-kind="${kind}">${icon('plus', 'h-4 w-4')}เพิ่ม${m.title}</button>
    </div>
    <ul class="divide-y divide-slate-100">
      ${list.map((o) => {
        const used = S.docs.filter((d) => d[m.field] === o.code).length;
        const pend = S.subs.filter((d) => d.status === 'Pending' && d[m.field] === o.code).length;
        return `<li class="flex items-center gap-3 px-5 py-3 ${o.active ? '' : 'bg-slate-50/70'}">
          <span class="w-12 shrink-0">${kind === 'type' ? typeBadge(o.code) : `<span class="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700">${escapeHtml(o.code)}</span>`}</span>
          <div class="min-w-0 flex-1 ${o.active ? '' : 'opacity-60'}">
            <p class="truncate text-sm font-medium text-slate-700">${escapeHtml(o.name)}${o.active ? '' : ' <span class="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">ปิดใช้งาน</span>'}</p>
            <p class="truncate text-xs text-slate-400">${escapeHtml(o.th || '-')} · ${used} เอกสาร${pend ? ` · รอตรวจ ${pend}` : ''}</p>
          </div>
          <button class="switch ${o.active ? 'on' : ''}" role="switch" aria-checked="${o.active}" title="${o.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}" data-action="opt-toggle" data-kind="${kind}" data-code="${escapeHtml(o.code)}"><span></span></button>
          <button class="icon-btn" data-action="opt-edit" data-kind="${kind}" data-code="${escapeHtml(o.code)}" title="แก้ไข">${icon('pencil', 'h-4 w-4')}</button>
          <button class="icon-btn danger" data-action="opt-delete" data-kind="${kind}" data-code="${escapeHtml(o.code)}" title="${used + pend ? 'มีเอกสารใช้อยู่ ลบไม่ได้' : 'ลบ'}" ${used + pend ? 'disabled style="opacity:.3;cursor:not-allowed"' : ''}>${icon('trash', 'h-4 w-4')}</button>
        </li>`;
      }).join('')}
    </ul>
  </section>`;
}

function openOptionForm(kind, code) {
  const m = KIND_META[kind];
  const isNew = !code;
  const o = isNew ? { code: '', name: '', th: '', color: 'teal', active: true } : { code, ...(kind === 'type' ? DOC_TYPES : DEPTS)[code] };
  const root = openModal(`
    ${modalHeader(isNew ? `เพิ่ม${m.title}` : `แก้ไข${m.title} ${escapeHtml(code)}`)}
    <form class="space-y-3 p-5" novalidate>
      <label class="block"><span class="label">รหัส <span class="text-rose-500">*</span> <span class="font-normal text-slate-400">(ภาษาอังกฤษ 2-4 ตัว${isNew ? '' : ' · แก้ไขไม่ได้'})</span></span>
        <input name="code" class="input font-mono uppercase ${isNew ? '' : '!bg-slate-50 !text-slate-500'}" value="${escapeHtml(o.code)}" placeholder="เช่น ${m.example}" maxlength="4" pattern="[A-Za-z]{2,4}" required ${isNew ? 'autofocus' : 'readonly'}></label>
      <label class="block"><span class="label">ชื่อ (ภาษาอังกฤษ) <span class="text-rose-500">*</span></span>
        <input name="name" class="input" value="${escapeHtml(o.name)}" placeholder="เช่น ${m.exampleName}" required></label>
      <label class="block"><span class="label">ชื่อภาษาไทย</span>
        <input name="th" class="input" value="${escapeHtml(o.th || '')}" placeholder="เช่น ${m.exampleTh}"></label>
      ${kind === 'type' ? `<div><span class="label">สีป้าย</span>
        <div class="flex flex-wrap gap-2">${Object.entries(COLORS).map(([k, c]) => `
          <label class="cursor-pointer" title="${c.label}"><input type="radio" name="color" value="${k}" class="peer sr-only" ${k === o.color ? 'checked' : ''}>
            <span class="flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-slate-700 peer-focus-visible:ring-teal-400"><span class="h-6 w-6 rounded-full ${c.bar}"></span></span></label>`).join('')}
        </div></div>` : ''}
      <label class="flex items-center gap-2 pt-1 text-sm text-slate-700"><input type="checkbox" name="active" class="h-4 w-4 accent-teal-600" ${o.active ? 'checked' : ''}> เปิดใช้งาน (เลือกได้ในหน้าส่งเอกสาร)</label>
      <div class="flex justify-end gap-2 pt-2"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึก</button></div>
    </form>`, { size: 'max-w-md' });
  const form = root.querySelector('form');
  form.code.addEventListener('input', () => { form.code.value = form.code.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    saveOption({
      kind, code: form.code.value.trim().toUpperCase(), name: form.name.value.trim(), th: form.th.value.trim(),
      color: form.color ? form.color.value : '', active: form.active.checked,
    }, isNew, form.querySelector('button[type=submit]'));
  });
}

async function saveOption(option, isNew, btn) {
  setBusy(btn, true);
  try {
    const list = await API.call('saveOption', { option, isNew });
    const st = API.takeState();
    if (st) applyState(st); else applyOptions(list);
    closeModal();
    toast(`${isNew ? 'เพิ่ม' : 'บันทึก'} ${option.code} แล้ว`);
    if (S.view === 'settings') renderSettings();
  } catch (err) {
    toast(err.message, 'error');
    setBusy(btn, false);
  }
}

async function deleteOption(kind, code) {
  const ok = await confirmDialog({ title: `ลบ${KIND_META[kind].title} ${escapeHtml(code)}`, message: 'ต้องการลบตัวเลือกนี้ใช่หรือไม่?', confirmText: 'ลบ', danger: true });
  if (!ok) return;
  try {
    const list = await API.call('deleteOption', { kind, code });
    const st = API.takeState();
    if (st) applyState(st); else applyOptions(list);
    toast(`ลบ ${code} แล้ว`);
    renderSettings();
  } catch (err) {
    toast(err.message, 'error');
  }
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
    case 'refresh': loadData(false).then((ok) => ok && toast('อัปเดตข้อมูลแล้ว', 'info')); break;
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
    case 'req-tab': S.reqTab = el.dataset.tab; renderRequests(); break;
    case 'req-approve': approveRequest(id, el); break;
    case 'req-reject': rejectRequest(id, el); break;
    case 'qr-links': toggleSidebar(false); openQrLinks(); break;
    case 'qr-doc': openQrDoc(id); break;
    case 'qr-download': downloadQrPng(el.dataset.url, el.dataset.caption, el.dataset.file); break;
    case 'qr-copy': if (await copyText(el.dataset.url)) toast('คัดลอกลิงก์แล้ว'); break;
    case 'copy-library-link': {
      const url = new URL('library.html', location.href).href;
      if (await copyText(url)) toast('คัดลอกลิงก์หน้ารายการเอกสารแล้ว ส่งให้พนักงานได้เลย');
      break;
    }
    case 'review': openReview(id); break;
    case 'view': viewFile('document', id); break;
    case 'view-sub': viewFile('submission', id); break;
    case 'download': downloadFile('document', id); break;
    case 'download-sub': downloadFile('submission', id); break;
    case 'share': shareFile(id); break;
    case 'edit': openDocForm(S.docs.find((d) => d.id === id)); break;
    case 'delete': deleteDoc(id); break;
    case 'detail': openDetail(id); break;
    case 'history': { const top = revisionsOf(el.dataset.code)[0]; if (top) openDetail(top.id); break; }
    case 'new-rev': {
      const top = revisionsOf(el.dataset.code)[0];
      openDocForm(null, { docType: top.docType, dept: top.dept, docNo: top.docNo, rev: pad2(Math.min(99, Number(top.rev) + 1)), title: top.title, author: top.author });
      break;
    }
    case 'copy-submit-link': {
      const url = new URL('submit.html', location.href).href;
      if (await copyText(url)) toast('คัดลอกลิงก์หน้าส่งไฟล์แล้ว ส่งให้ผู้ส่งเอกสารได้เลย');
      break;
    }
    case 'change-password': toggleSidebar(false); openChangePassword(); break;
    case 'opt-add': openOptionForm(el.dataset.kind); break;
    case 'opt-edit': openOptionForm(el.dataset.kind, el.dataset.code); break;
    case 'opt-toggle': {
      const o = (el.dataset.kind === 'type' ? DOC_TYPES : DEPTS)[el.dataset.code];
      saveOption({ kind: el.dataset.kind, code: el.dataset.code, ...o, active: !o.active }, false, el);
      break;
    }
    case 'opt-delete': deleteOption(el.dataset.kind, el.dataset.code); break;
    case 'reset-demo': {
      const ok = await confirmDialog({ title: 'รีเซ็ตข้อมูลตัวอย่าง', message: 'ข้อมูลทดลองทั้งหมดใน Browser นี้จะถูกลบและสร้างใหม่', confirmText: 'รีเซ็ต', danger: true });
      if (ok) { await MockAPI.handle({ action: 'resetDemo' }); API.token = ''; S.loaded = false; location.hash = ''; showLogin(); }
      break;
    }
    case 'logout':
      try { await API.call('logout'); } catch (_) { /* ignore */ }
      API.token = '';
      clearCache(); // ไม่ทิ้งข้อมูลเอกสารไว้ในเครื่องหลังออกจากระบบ
      S.loaded = false;
      showLogin();
      break;
    default: break;
  }
}

init();
