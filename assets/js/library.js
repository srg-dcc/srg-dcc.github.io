/* =============================================================
 * library.js — หน้ารายการเอกสารสำหรับพนักงานทั่วไป
 * ดูรายการได้อย่างเดียว ถ้าต้องการไฟล์ต้องส่งคำขอให้ผู้ดูแลอนุมัติ
 * แล้วระบบจะส่งไฟล์ให้ทางอีเมล
 * ============================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const LIB = {
  docs: [],
  loaded: false,
  f: { q: '', type: '', dept: '', status: 'Active' },
  shown: 50,
  picked: new Set(),
  deepReq: null, // รหัสเอกสารจากลิงก์/QR แบบ #req=<id> รอเปิดฟอร์มขอไฟล์หลังโหลดข้อมูล
};
const MAX_PICK = 20;
const MY_REQ_KEY = 'dc_my_requests';
const REQUESTER_KEY = 'dc_requester';
const libCacheKey = () => `dc_lib_v1:${(window.APP_CONFIG && APP_CONFIG.API_URL) || 'demo'}`;

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.cls || 'h-5 w-5');
    el.removeAttribute('data-icon');
  });
}

function highlight(text, tokens) {
  const s = String(text ?? '');
  if (!tokens.length) return escapeHtml(s);
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return s.split(re).map((part, i) => (i % 2 ? `<mark class="rounded bg-amber-100 px-0.5 text-inherit">${escapeHtml(part)}</mark>` : escapeHtml(part))).join('');
}

/* ---------------- โหลดข้อมูล (แสดงจากแคชก่อน แล้วอัปเดตเบื้องหลัง) ---------------- */
function applyData(d) {
  LIB.docs = d.documents || [];
  applyOptions(d.options);
  LIB.loaded = true;
  // ตัดรายการที่เลือกไว้แต่ไม่มีในระบบแล้วออก
  [...LIB.picked].forEach((id) => { if (!LIB.docs.some((x) => x.id === id)) LIB.picked.delete(id); });
}

async function loadData() {
  const cached = API.isDemo ? null : storageGet(libCacheKey());
  if (cached && Array.isArray(cached.documents)) {
    applyData(cached);
    renderAll();
    handleDeepLink(false);
  } else {
    $('#results').innerHTML = '<div class="skeleton h-64"></div>';
  }
  try {
    const d = await API.call('listPublic');
    const changed = JSON.stringify(d) !== JSON.stringify(cached);
    if (!API.isDemo) storageSet(libCacheKey(), d);
    applyData(d);
    if (changed || !cached) renderAll(document.activeElement === $('#q'));
    handleDeepLink(true);
  } catch (err) {
    if (!LIB.loaded) $('#results').innerHTML = `<div class="card p-8 text-center text-sm text-rose-600">${escapeHtml(err.message)}</div>`;
    else toast('อัปเดตรายการไม่สำเร็จ แสดงข้อมูลล่าสุดที่มี', 'info');
    if (LIB.loaded) handleDeepLink(true);
  }
}

/* ---------------- ลิงก์ตรงจาก QR: library.html#req=<id>[,<id>] ---------------- */
function readDeepLink() {
  const m = /^#req=([^&]*)/.exec(location.hash);
  if (!m) return;
  let raw = m[1];
  try { raw = decodeURIComponent(raw); } catch (e) { /* ใช้ค่าเดิม */ }
  const ids = [...new Set(raw.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, MAX_PICK);
  // ล้าง #req ออกจากแถบที่อยู่ กดรีเฟรชแล้วฟอร์มจะไม่เด้งซ้ำ
  history.replaceState(null, '', location.pathname + location.search);
  if (ids.length) LIB.deepReq = ids;
}

/** final = ได้ข้อมูลล่าสุดจากเซิร์ฟเวอร์แล้ว (ถ้ายังเป็นแค่แคช และหาเอกสารไม่ครบ ให้รอข้อมูลจริงก่อน) */
function handleDeepLink(final) {
  if (!LIB.deepReq || !LIB.loaded) return;
  const found = LIB.deepReq.filter((id) => LIB.docs.some((d) => d.id === id));
  if (!final && found.length < LIB.deepReq.length) return;
  LIB.deepReq = null;
  if (!found.length) { toast('ไม่พบเอกสารในลิงก์นี้ อาจถูกลบไปแล้ว ลองค้นหาจากรายการ', 'error'); return; }
  setTab('list');
  found.forEach((id) => { if (LIB.picked.size < MAX_PICK) LIB.picked.add(id); });
  renderTable();
  renderBasket();
  if (!$('#modal-root')) openRequestForm();
}

/* ---------------- ตัวกรอง + ตาราง ---------------- */
function renderAll(keepSearchFocus = false) {
  if (!keepSearchFocus) renderFilters();
  renderTable();
  renderBasket();
}

function visible(kind) {
  const obj = kind === 'type' ? DOC_TYPES : DEPTS;
  const field = kind === 'type' ? 'docType' : 'dept';
  return Object.keys(obj).filter((k) => LIB.docs.some((d) => d[field] === k));
}

function renderFilters() {
  const chip = (group, val, label, title = '') =>
    `<button class="chip ${LIB.f[group] === val ? 'active' : ''}" data-filter="${group}" data-value="${val}" ${title ? `title="${escapeHtml(title)}"` : ''}>${label}</button>`;
  $('#filters').innerHTML = `
    <div class="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
      <span class="w-14 shrink-0 text-xs font-medium text-slate-400">ประเภท</span>
      ${chip('type', '', 'ทั้งหมด')}
      ${visible('type').map((k) => chip('type', k, `<span class="chip-dot h-2 w-2 rounded-full ${DOC_TYPES[k].bar}"></span>${k}`, DOC_TYPES[k].name)).join('')}
    </div>
    <div class="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
      <span class="w-14 shrink-0 text-xs font-medium text-slate-400">แผนก</span>
      ${chip('dept', '', 'ทั้งหมด')}
      ${visible('dept').map((k) => chip('dept', k, k, `${DEPTS[k].name} (${DEPTS[k].th})`)).join('')}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="w-14 shrink-0 text-xs font-medium text-slate-400">สถานะ</span>
      ${chip('status', 'Active', 'ฉบับใช้งาน')}
      ${chip('status', 'Obsolete', 'Rev เก่า')}
      ${chip('status', 'all', 'ทั้งหมด')}
    </div>`;
}

function filtered() {
  const tokens = LIB.f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = LIB.docs.filter((d) => {
    if (LIB.f.type && d.docType !== LIB.f.type) return false;
    if (LIB.f.dept && d.dept !== LIB.f.dept) return false;
    if (LIB.f.status !== 'all' && d.status !== LIB.f.status) return false;
    if (!tokens.length) return true;
    const t = DEPTS[d.dept];
    const hay = `${d.docCode} ${d.title} ${d.author} ${d.dept} ${t ? t.th : ''} rev.${d.rev}`.toLowerCase();
    return tokens.every((x) => hay.includes(x));
  });
  list.sort((a, b) => a.docCode.localeCompare(b.docCode, 'th', { numeric: true }) || Number(b.rev) - Number(a.rev));
  return { list, tokens };
}

function renderTable() {
  const { list, tokens } = filtered();
  const box = $('#results');
  if (!list.length) {
    box.innerHTML = `<div class="card flex flex-col items-center px-6 py-14 text-center">
      <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">${icon('search')}</div>
      <p class="font-medium text-slate-700">ไม่พบเอกสาร</p>
      <p class="mt-1 text-sm text-slate-500">ลองเปลี่ยนคำค้นหา หรือเลือกสถานะ "ทั้งหมด"</p></div>`;
    return;
  }
  const rows = list.slice(0, LIB.shown);
  const today = todayIso();
  box.innerHTML = `
  <div class="card overflow-hidden">
    <div class="border-b border-slate-100 px-4 py-3 text-sm text-slate-500">พบ <b class="text-slate-800">${list.length.toLocaleString()}</b> รายการ</div>
    <div class="overflow-x-auto scrollbar-thin">
      <table class="table-docs w-full min-w-[760px] text-sm">
        <thead class="thead-strong"><tr>
          <th class="px-3 py-3 pl-4 text-left text-xs">รหัสเอกสาร</th><th class="px-3 py-3 text-left text-xs">ชื่อเอกสาร</th>
          <th class="px-3 py-3 text-left text-xs">แผนก</th><th class="px-3 py-3 text-left text-xs">Revision</th>
          <th class="px-3 py-3 text-left text-xs">วันที่บังคับใช้</th><th class="px-3 py-3 text-left text-xs">ผู้จัดทำ</th>
          <th class="sticky-col px-3 py-3 pr-4 text-right text-xs">ขอไฟล์</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          ${rows.map((d) => {
            const t = DOC_TYPES[d.docType];
            const on = LIB.picked.has(d.id);
            const future = d.effectiveDate > today;
            return `<tr class="${on ? 'bg-teal-50/50' : ''}">
              <td class="px-3 py-2.5 pl-4"><div class="flex items-center gap-2 whitespace-nowrap" title="${escapeHtml(t ? `${d.docType} · ${t.name}` : d.docType)}">
                <span class="h-2 w-2 shrink-0 rounded-full ${t ? t.bar : 'bg-slate-300'}"></span><span class="font-mono text-[13px] font-semibold text-slate-800">${highlight(d.docCode, tokens)}</span></div></td>
              <td class="max-w-[320px] px-3 py-2.5"><div class="flex min-w-0 items-center gap-2"><span class="truncate font-medium text-slate-700" title="${escapeHtml(d.title)}">${highlight(d.title, tokens)}</span>
                ${d.status === 'Active' ? '' : '<span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Rev เก่า</span>'}</div></td>
              <td class="px-3 py-2.5"><span class="font-mono text-xs font-semibold text-slate-600" title="${escapeHtml(DEPTS[d.dept] ? DEPTS[d.dept].th : '')}">${escapeHtml(d.dept)}</span></td>
              <td class="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-slate-700">Rev.${escapeHtml(d.rev)}</td>
              <td class="whitespace-nowrap px-3 py-2.5 ${future ? 'text-amber-600' : 'text-slate-600'}" ${future ? 'title="ยังไม่ถึงวันบังคับใช้"' : ''}>${formatDate(d.effectiveDate)}</td>
              <td class="whitespace-nowrap px-3 py-2.5 text-slate-600">${escapeHtml(d.author)}</td>
              <td class="sticky-col px-3 py-2 pr-4 text-right">
                <button class="btn ${on ? 'btn-primary' : 'btn-soft'} !px-3 !py-1.5 text-xs" data-pick="${d.id}" aria-pressed="${on}">${icon(on ? 'check' : 'plus', 'h-3.5 w-3.5')}${on ? 'เลือกแล้ว' : 'ขอไฟล์'}</button></td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${list.length > LIB.shown ? `<div class="border-t border-slate-100 p-3 text-center"><button class="btn btn-ghost" data-act="more">แสดงเพิ่ม (${list.length - LIB.shown} รายการ)</button></div>` : ''}
  </div>`;
}

function renderBasket() {
  const n = LIB.picked.size;
  $('#basket').classList.toggle('hidden', n === 0);
  $('#basket-count').textContent = n;
}

function togglePick(id) {
  if (LIB.picked.has(id)) LIB.picked.delete(id);
  else if (LIB.picked.size >= MAX_PICK) { toast(`ขอได้ครั้งละไม่เกิน ${MAX_PICK} รายการ`, 'error'); return; }
  else LIB.picked.add(id);
  renderTable();
  renderBasket();
}

/* ---------------- ฟอร์มขอไฟล์ ---------------- */
function openRequestForm() {
  const docs = [...LIB.picked].map((id) => LIB.docs.find((d) => d.id === id)).filter(Boolean);
  if (!docs.length) return;
  const saved = storageGet(REQUESTER_KEY, {});
  const deptOpts = Object.entries(DEPTS).filter(([k, v]) => v.active || k === saved.dept)
    .map(([k, v]) => `<option value="${k}" ${k === saved.dept ? 'selected' : ''}>${k} – ${escapeHtml(v.th)}</option>`).join('');
  const root = openModal(`
    ${modalHeader('ขอไฟล์เอกสาร', `${docs.length} รายการ · ระบบจะส่งไฟล์ให้ทางอีเมลเมื่อผู้ดูแลอนุมัติ`)}
    <form class="p-5" novalidate>
      <ul class="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
        ${docs.map((d) => `<li class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
          <span class="font-mono text-[13px] font-semibold text-slate-800">${escapeHtml(d.docCode)}</span>
          <span class="font-mono text-xs text-slate-500">Rev.${escapeHtml(d.rev)}</span>
          <span class="min-w-0 flex-1 truncate text-slate-600">${escapeHtml(d.title)}</span>
          ${d.status === 'Active' ? '' : '<span class="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">Rev เก่า</span>'}</li>`).join('')}
      </ul>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label><span class="label">ชื่อ-นามสกุล <span class="text-rose-500">*</span></span>
          <input name="name" class="input" value="${escapeHtml(saved.name || '')}" required autocomplete="name"></label>
        <label><span class="label">แผนก <span class="text-rose-500">*</span></span>
          <select name="dept" class="input" required><option value="">เลือกแผนก</option>${deptOpts}</select></label>
      </div>
      <label class="mt-3 block"><span class="label">อีเมลสำหรับรับไฟล์ <span class="text-rose-500">*</span></span>
        <input name="email" type="email" class="input" value="${escapeHtml(saved.email || '')}" placeholder="name@company.com" required autocomplete="email"></label>
      <label class="mt-3 block"><span class="label">วัตถุประสงค์ในการขอเอกสาร <span class="text-rose-500">*</span></span>
        <textarea name="purpose" rows="3" class="input" maxlength="500" placeholder="เช่น ใช้อบรมพนักงานใหม่ / ใช้ประกอบการตรวจ Audit" required></textarea></label>
      <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">เอกสารควบคุม ใช้ตามวัตถุประสงค์ที่ขอเท่านั้น ห้ามแก้ไขหรือแจกจ่ายต่อโดยไม่ได้รับอนุญาต</p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
        <button type="submit" class="btn btn-primary">${icon('send', 'h-4 w-4')}ส่งคำขอ</button>
      </div>
    </form>`, { size: 'max-w-xl' });
  const form = root.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = { name: form.name.value.trim(), dept: form.dept.value, email: form.email.value.trim(), purpose: form.purpose.value.trim() };
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true, 'กำลังส่ง...');
    try {
      const { refNo } = await API.call('requestFiles', { data, docIds: docs.map((d) => d.id) });
      storageSet(REQUESTER_KEY, { name: data.name, dept: data.dept, email: data.email });
      const mine = storageGet(MY_REQ_KEY, []);
      mine.unshift({ refNo, n: docs.length, at: new Date().toISOString() });
      storageSet(MY_REQ_KEY, mine.slice(0, 10));
      LIB.picked.clear();
      renderTable();
      renderBasket();
      showRequestSent(refNo, data.email, docs.length);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

function showRequestSent(refNo, email, n) {
  const root = openModal(`
    <div class="p-6 text-center sm:p-8">
      <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">${icon('check', 'h-7 w-7')}</div>
      <h3 class="mt-4 text-lg font-semibold text-slate-800">ส่งคำขอแล้ว</h3>
      <p class="mt-1 text-sm text-slate-500">ขอไฟล์ ${n} รายการ · เมื่อผู้ดูแลอนุมัติ ไฟล์จะถูกส่งไปที่<br><b class="text-slate-700">${escapeHtml(email)}</b></p>
      <div class="mx-auto mt-5 max-w-xs rounded-xl border border-dashed border-teal-300 bg-teal-50/50 p-4">
        <p class="text-xs text-slate-500">เลขอ้างอิงสำหรับติดตามคำขอ</p>
        <p class="mt-1 break-all font-mono text-lg font-semibold text-teal-700">${escapeHtml(refNo)}</p>
        <button class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline" data-role="copy">${icon('copy', 'h-3.5 w-3.5')}คัดลอก</button>
      </div>
      <button class="btn btn-primary mt-6" data-close>เสร็จสิ้น</button>
    </div>`, { size: 'max-w-md' });
  root.querySelector('[data-role=copy]').addEventListener('click', async () => { if (await copyText(refNo)) toast('คัดลอกเลขอ้างอิงแล้ว'); });
}

/* ---------------- ติดตามคำขอ ---------------- */
function renderRecent() {
  const box = $('#track-result');
  if (box.dataset.filled) return;
  const mine = storageGet(MY_REQ_KEY, []);
  box.innerHTML = mine.length ? `<p class="mb-2 text-xs font-medium text-slate-400">คำขอล่าสุดจากเครื่องนี้</p>
    <div class="flex flex-wrap gap-2">${mine.map((m) => `<button type="button" class="chip" data-ref="${escapeHtml(m.refNo)}"><span class="font-mono">${escapeHtml(m.refNo)}</span><span class="text-slate-400">${m.n} รายการ</span></button>`).join('')}</div>` : '';
}

async function checkRequest(refNo) {
  const box = $('#track-result');
  box.dataset.filled = '1';
  box.innerHTML = '<div class="skeleton h-24"></div>';
  try {
    const r = await API.call('checkRequest', { refNo });
    const meta = {
      Pending: ['รออนุมัติ', 'bg-amber-50 text-amber-700 ring-amber-200', 'clock', 'คำขออยู่ระหว่างรอผู้ดูแลเอกสารอนุมัติ'],
      Approved: ['ส่งไฟล์แล้ว', 'bg-emerald-50 text-emerald-700 ring-emerald-200', 'check', 'ไฟล์ถูกส่งไปที่อีเมลของคุณแล้ว (ถ้าไม่พบ ลองดูในโฟลเดอร์สแปม)'],
      Rejected: ['ไม่อนุมัติ', 'bg-rose-50 text-rose-700 ring-rose-200', 'x', 'คำขอนี้ไม่ได้รับการอนุมัติ'],
    }[r.status] || [r.status, 'bg-slate-50 text-slate-700 ring-slate-200', 'info', ''];
    box.innerHTML = `
      <div class="fade-in rounded-xl p-4 ring-1 ${meta[1]}">
        <div class="flex items-center gap-2 font-semibold">${icon(meta[2], 'h-5 w-5')}${meta[0]}</div>
        <p class="mt-1 text-sm opacity-90">${meta[3]}</p>
        <dl class="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="opacity-70">เอกสาร</dt><dd class="font-mono text-xs leading-6">${escapeHtml(r.docLabels).split('; ').join('<br>')}</dd>
          <dt class="opacity-70">วันที่ขอ</dt><dd>${formatDateTime(r.requestedAt)}</dd>
          ${r.reviewedAt ? `<dt class="opacity-70">วันที่ดำเนินการ</dt><dd>${formatDateTime(r.reviewedAt)}</dd>` : ''}
          ${r.reviewNote ? `<dt class="opacity-70">หมายเหตุ</dt><dd>${escapeHtml(r.reviewNote)}</dd>` : ''}
        </dl>
      </div>`;
  } catch (err) {
    box.innerHTML = `<div class="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">${escapeHtml(err.message)}</div>`;
  }
}

function setTab(name) {
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('bg-white', on);
    b.classList.toggle('shadow-sm', on);
    b.classList.toggle('text-slate-800', on);
    b.classList.toggle('text-slate-500', !on);
  });
  $('#tab-list').classList.toggle('hidden', name !== 'list');
  $('#tab-track').classList.toggle('hidden', name !== 'track');
  $('#basket').classList.toggle('invisible', name !== 'list');
  if (name === 'track') renderRecent();
}

/* ---------------- เริ่มต้น ---------------- */
function init() {
  hydrateIcons();
  if (API.isDemo) $('#demo-note').classList.remove('hidden');
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#q').addEventListener('input', debounce(() => { LIB.f.q = $('#q').value; LIB.shown = 50; renderTable(); }, 150));
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === '/' && !['input', 'textarea', 'select'].includes(tag) && !$('#modal-root')) { e.preventDefault(); setTab('list'); $('#q').focus(); }
  });
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      LIB.f[f.dataset.filter] = f.dataset.value;
      LIB.shown = 50;
      f.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === f));
      renderTable();
      return;
    }
    const p = e.target.closest('[data-pick]');
    if (p) { togglePick(p.dataset.pick); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'more') { LIB.shown += 100; renderTable(); }
    if (a.dataset.act === 'clear') { LIB.picked.clear(); renderTable(); renderBasket(); }
    if (a.dataset.act === 'request') openRequestForm();
  });
  $('#track-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.refNo.value.trim().toUpperCase();
    if (v) checkRequest(v);
  });
  $('#track-result').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ref]');
    if (b) { $('#track-form').refNo.value = b.dataset.ref; checkRequest(b.dataset.ref); }
  });
  readDeepLink();
  // เปิดลิงก์ #req ขณะหน้านี้เปิดอยู่แล้ว: ถ้าข้อมูลในเครื่องไม่มีเอกสารนั้น ให้โหลดรายการล่าสุดก่อน
  window.addEventListener('hashchange', () => {
    if (location.hash === '#track') { setTab('track'); return; }
    readDeepLink();
    handleDeepLink(false);
    if (LIB.deepReq && LIB.loaded) loadData();
  });
  setTab(location.hash === '#track' ? 'track' : 'list');
  loadData();
}

init();
