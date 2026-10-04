/* =============================================================
 * submit.js — หน้าส่งเอกสารสำหรับผู้ใช้ทั่วไป (ไม่ต้องเข้าสู่ระบบ)
 * ============================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const MY_KEY = 'dc_my_submissions';
let dropZone;

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.cls || 'h-5 w-5');
    el.removeAttribute('data-icon');
  });
}

function setTab(name) {
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('bg-white', on);
    b.classList.toggle('shadow-sm', on);
    b.classList.toggle('text-slate-800', on);
    b.classList.toggle('text-slate-500', !on);
  });
  $('#tab-send').classList.toggle('hidden', name !== 'send');
  $('#tab-status').classList.toggle('hidden', name !== 'status');
  if (name === 'status') renderRecent();
}

function renderFormParts() {
  $('#type-list').innerHTML = Object.entries(DOC_TYPES).map(([k, v]) => `<li><span class="inline-block w-8 font-mono font-semibold text-slate-800">${k}</span>${v.name} <span class="text-slate-400">(${v.th})</span></li>`).join('');
  $('#dept-list').innerHTML = Object.entries(DEPTS).map(([k, v]) => `<li><span class="inline-block w-8 font-mono font-semibold text-slate-800">${k}</span>${v.name} <span class="text-slate-400">(${v.th})</span></li>`).join('');
  $('#drop-wrap').innerHTML = dropZoneHtml('drop');
  $('#fields-wrap').innerHTML = docFieldsHtml({ effectiveDate: '' });
}

function initForm() {
  const form = $('#send-form');
  const updateCode = bindDocFields(form);
  dropZone = bindDropZone($('#drop'), (file) => {
    if (autofillFromFileName(form, file.name)) {
      updateCode();
      toast('กรอกข้อมูลจากชื่อไฟล์ให้แล้ว กรุณาตรวจสอบความถูกต้อง', 'info');
    }
  });
  const saved = storageGet('dc_submitter', {});
  if (saved.name) form.submitter.value = saved.name;
  if (saved.contact) form.contact.value = saved.contact;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = dropZone.getFile();
    if (!file) { toast('กรุณาแนบไฟล์เอกสาร', 'error'); $('#drop').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!form.reportValidity()) return;
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true, 'กำลังอัปโหลด...');
    try {
      const base64 = await fileToBase64(file);
      const data = {
        ...readDocFields(form),
        submitter: form.submitter.value.trim(),
        contact: form.contact.value.trim(),
        note: form.note.value.trim(),
      };
      const res = await API.call('submit', { data, file: { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, base64 } });
      storageSet('dc_submitter', { name: data.submitter, contact: data.contact });
      const mine = storageGet(MY_KEY, []);
      mine.unshift({ refNo: res.refNo, code: `${buildCode(data.docType, data.dept, data.docNo)} Rev.${data.rev}`, at: new Date().toISOString() });
      storageSet(MY_KEY, mine.slice(0, 10));
      showSuccess(res.refNo, data);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

function showSuccess(refNo, d) {
  $('#tab-send').innerHTML = `
    <div class="card fade-in p-6 text-center sm:p-10">
      <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">${icon('check', 'h-7 w-7')}</div>
      <h2 class="mt-4 text-lg font-semibold text-slate-800">ส่งเอกสารเรียบร้อยแล้ว</h2>
      <p class="mt-1 text-sm text-slate-500">${escapeHtml(buildCode(d.docType, d.dept, d.docNo))} Rev.${escapeHtml(d.rev)} · ${escapeHtml(d.title)}</p>
      <p class="mt-1 text-sm text-slate-500">เอกสารจะถูกตรวจสอบก่อนจัดเก็บเข้าระบบ</p>
      <div class="mx-auto mt-5 max-w-xs rounded-xl border border-dashed border-teal-300 bg-teal-50/50 p-4">
        <p class="text-xs text-slate-500">เลขอ้างอิงสำหรับติดตามสถานะ</p>
        <p class="mt-1 font-mono text-xl font-semibold tracking-wide text-teal-700">${escapeHtml(refNo)}</p>
        <button class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline" id="copy-ref">${icon('copy', 'h-3.5 w-3.5')}คัดลอก</button>
      </div>
      <div class="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <button class="btn btn-ghost" id="go-status">ติดตามสถานะ</button>
        <button class="btn btn-primary" id="send-another">${icon('send', 'h-4 w-4')}ส่งเอกสารอื่น</button>
      </div>
    </div>`;
  $('#copy-ref').addEventListener('click', async () => { if (await copyText(refNo)) toast('คัดลอกเลขอ้างอิงแล้ว'); });
  $('#go-status').addEventListener('click', () => { setTab('status'); $('#status-form').refNo.value = refNo; checkStatus(refNo); });
  $('#send-another').addEventListener('click', () => location.reload());
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderRecent() {
  const mine = storageGet(MY_KEY, []);
  const box = $('#status-result');
  if (box.dataset.filled) return;
  if (!mine.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<p class="mb-2 text-xs font-medium text-slate-400">เอกสารที่คุณส่งล่าสุดจากเครื่องนี้</p>
    <div class="flex flex-wrap gap-2">${mine.map((m) => `<button type="button" class="chip" data-ref="${escapeHtml(m.refNo)}"><span class="font-mono">${escapeHtml(m.refNo)}</span><span class="text-slate-400">${escapeHtml(m.code)}</span></button>`).join('')}</div>`;
}

async function checkStatus(refNo) {
  const box = $('#status-result');
  box.dataset.filled = '1';
  box.innerHTML = '<div class="skeleton h-24"></div>';
  try {
    const s = await API.call('checkStatus', { refNo });
    const meta = {
      Pending: ['รอตรวจสอบ', 'bg-amber-50 text-amber-700 ring-amber-200', 'clock', 'เอกสารอยู่ระหว่างรอการตรวจสอบ'],
      Approved: ['อนุมัติแล้ว', 'bg-emerald-50 text-emerald-700 ring-emerald-200', 'check', 'เอกสารผ่านการตรวจสอบและจัดเก็บเข้าระบบแล้ว'],
      Rejected: ['ตีกลับ', 'bg-rose-50 text-rose-700 ring-rose-200', 'x', 'เอกสารไม่ผ่านการตรวจสอบ กรุณาแก้ไขแล้วส่งใหม่'],
    }[s.status] || [s.status, 'bg-slate-50 text-slate-700 ring-slate-200', 'info', ''];
    box.innerHTML = `
      <div class="fade-in rounded-xl p-4 ring-1 ${meta[1]}">
        <div class="flex items-center gap-2 font-semibold">${icon(meta[2], 'h-5 w-5')}${meta[0]}</div>
        <p class="mt-1 text-sm opacity-90">${meta[3]}</p>
        <dl class="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="opacity-70">เอกสาร</dt><dd class="font-mono">${escapeHtml(s.docCode)} Rev.${escapeHtml(s.rev)}</dd>
          <dt class="opacity-70">ชื่อเอกสาร</dt><dd>${escapeHtml(s.title)}</dd>
          <dt class="opacity-70">วันที่ส่ง</dt><dd>${formatDateTime(s.submittedAt)}</dd>
          ${s.reviewedAt ? `<dt class="opacity-70">วันที่ตรวจ</dt><dd>${formatDateTime(s.reviewedAt)}</dd>` : ''}
          ${s.reviewNote ? `<dt class="opacity-70">หมายเหตุ</dt><dd>${escapeHtml(s.reviewNote)}</dd>` : ''}
        </dl>
      </div>`;
  } catch (err) {
    box.innerHTML = `<div class="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">${escapeHtml(err.message)}</div>`;
  }
}

function init() {
  hydrateIcons();
  renderFormParts();
  initForm();
  if (API.isDemo) $('#demo-note').classList.remove('hidden');
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#status-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.refNo.value.trim().toUpperCase();
    if (v) checkStatus(v);
  });
  $('#status-result').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ref]');
    if (b) { $('#status-form').refNo.value = b.dataset.ref; checkStatus(b.dataset.ref); }
  });
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) { setTab('status'); $('#status-form').refNo.value = ref; checkStatus(ref); } else setTab('send');
}

init();
