/* =============================================================
 * submit.js — หน้าส่งเอกสารสำหรับผู้ใช้ทั่วไป (ไม่ต้องเข้าสู่ระบบ)
 * Flow: 1) โยนไฟล์  →  2) กรอกข้อมูล  →  3) ส่งแล้ว
 * ============================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const MY_KEY = 'dc_my_submissions';
const PARSED_FIELDS = ['docType', 'dept', 'docNo', 'rev', 'title'];
let currentFile = null;
let currentStep = 1;
let updateCode = () => {};
let formReady = Promise.resolve();

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.cls || 'h-5 w-5');
    el.removeAttribute('data-icon');
  });
}

/* ---------------- Tabs ---------------- */
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

/* ---------------- Steps ---------------- */
function renderStepper() {
  const steps = ['เลือกไฟล์', 'กรอกข้อมูล', 'ส่งเรียบร้อย'];
  $('#stepper').innerHTML = steps.map((label, i) => {
    const n = i + 1;
    const done = n < currentStep || currentStep === 3;
    const on = n === currentStep;
    const dot = done
      ? `<span class="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-white">${icon('check', 'h-3.5 w-3.5')}</span>`
      : `<span class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${on ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'}">${n}</span>`;
    return `<li class="flex items-center gap-2 ${on || done ? 'text-slate-800' : 'text-slate-400'}">${dot}<span class="${on ? 'font-semibold' : ''} ${on ? '' : 'hidden sm:inline'}">${label}</span></li>
      ${n < steps.length ? `<li class="h-px flex-1 ${n < currentStep ? 'bg-teal-300' : 'bg-slate-200'}" aria-hidden="true"></li>` : ''}`;
  }).join('');
}

function goStep(n) {
  currentStep = n;
  $('#step-file').classList.toggle('hidden', n !== 1);
  $('#send-form').classList.toggle('hidden', n !== 2);
  $('#step-done').classList.toggle('hidden', n !== 3);
  const el = { 1: '#step-file', 2: '#send-form', 3: '#step-done' }[n];
  $(el).classList.remove('fade-in');
  void $(el).offsetWidth;
  $(el).classList.add('fade-in');
  renderStepper();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- รับไฟล์ ---------------- */
async function acceptFiles(fileList) {
  const files = Array.from(fileList || []); // คัดลอกก่อน เพราะ input จะถูกล้างค่า
  await formReady; // รอโหลดรายการแผนก/ประเภทให้เสร็จก่อน
  if (!files.length) return;
  if (files.length > 1) toast('ส่งได้ครั้งละ 1 ไฟล์ ระบบเลือกไฟล์แรกให้', 'info');
  const file = files[0];
  const err = validateFile(file);
  if (err) { toast(err, 'error'); return; }

  const form = $('#send-form');
  // ไฟล์ใหม่ → ล้างข้อมูลที่เคยกรอกจากชื่อไฟล์เดิม แล้วกรอกใหม่
  if (currentFile) PARSED_FIELDS.forEach((k) => { form.elements[k].value = ''; });
  currentFile = file;

  $('#file-icon').innerHTML = fileIcon(file.name);
  $('#file-name').textContent = file.name;
  $('#file-meta').textContent = formatSize(file.size);

  const n = autofillFromFileName(form, file.name);
  const ok = !!parseFileName(file.name).docType; // อ่านรหัสเอกสารจากชื่อไฟล์ได้หรือไม่
  const note = $('#autofill-note');
  note.innerHTML = ok
    ? `${icon('check', 'h-4 w-4 shrink-0')}<span>กรอกข้อมูลจากชื่อไฟล์ให้แล้ว ${n} ช่อง กรุณาตรวจสอบความถูกต้อง</span>`
    : `${icon('info', 'h-4 w-4 shrink-0')}<span>ชื่อไฟล์ไม่ตรงรูปแบบ (เช่น SD-QA-11.01 Rev.03 ชื่อเอกสาร.pdf) กรุณากรอกรหัสเอกสารด้านล่าง</span>`;
  note.classList.remove('hidden');
  note.classList.add('flex');
  note.classList.toggle('bg-teal-50', ok);
  note.classList.toggle('text-teal-800', ok);
  note.classList.toggle('bg-amber-50', !ok);
  note.classList.toggle('text-amber-800', !ok);
  updateCode();

  if (currentStep !== 2) goStep(2);
  // โฟกัสช่องแรกที่ยังว่าง
  const firstEmpty = [...form.querySelectorAll('input[required], select[required]')].find((el) => !el.value);
  if (firstEmpty) setTimeout(() => firstEmpty.focus({ preventScroll: true }), 250);
}

function initDrop() {
  const input = $('#file-input');
  input.accept = ALLOWED_EXT.map((e) => '.' + e).join(',');
  input.addEventListener('change', () => { acceptFiles(input.files); input.value = ''; });
  const max = (window.APP_CONFIG && APP_CONFIG.MAX_FILE_MB) || 25;
  $('#drop-hint').textContent = `รองรับ PDF, Word, Excel, PowerPoint และรูปภาพ · ไม่เกิน ${max} MB`;
  $('#change-file').addEventListener('click', () => input.click());

  // ลากไฟล์มาวางได้ทุกที่บนหน้า (ขั้นที่ 1 และ 2)
  const big = $('#big-drop');
  const overlay = $('#page-drop');
  let depth = 0;
  const canDrop = (e) => !$('#tab-send').classList.contains('hidden') && currentStep !== 3
    && e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const show = (on) => {
    big.classList.toggle('dz-over', on && currentStep === 1);
    const useOverlay = on && currentStep === 2;
    overlay.classList.toggle('hidden', !useOverlay);
    overlay.classList.toggle('flex', useOverlay);
  };
  document.addEventListener('dragenter', (e) => { if (!canDrop(e)) return; e.preventDefault(); depth++; show(true); });
  document.addEventListener('dragover', (e) => { if (!canDrop(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('dragleave', (e) => { if (!canDrop(e)) return; depth = Math.max(0, depth - 1); if (!depth) show(false); });
  document.addEventListener('drop', (e) => {
    if (!canDrop(e)) return;
    e.preventDefault();
    depth = 0;
    show(false);
    acceptFiles(e.dataTransfer.files);
  });
}

/* ---------------- ฟอร์ม ---------------- */
function initForm() {
  $('#type-list').innerHTML = Object.entries(DOC_TYPES).filter(([, v]) => v.active).map(([k, v]) => `<li><span class="inline-block w-8 font-mono font-semibold text-slate-800">${k}</span>${v.name} <span class="text-slate-400">(${v.th})</span></li>`).join('');
  $('#dept-list').innerHTML = Object.entries(DEPTS).filter(([, v]) => v.active).map(([k, v]) => `<li><span class="inline-block w-8 font-mono font-semibold text-slate-800">${k}</span>${v.name} <span class="text-slate-400">(${v.th})</span></li>`).join('');
  $('#fields-wrap').innerHTML = docFieldsHtml({});

  const form = $('#send-form');
  updateCode = bindDocFields(form);
  const saved = storageGet('dc_submitter', {});
  if (saved.name) form.submitter.value = saved.name;
  if (saved.contact) form.contact.value = saved.contact;
  $('#back-btn').addEventListener('click', () => goStep(1));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentFile) { goStep(1); return; }
    if (!form.reportValidity()) return;
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true, 'กำลังอัปโหลด...');
    try {
      const base64 = await fileToBase64(currentFile);
      const data = {
        ...readDocFields(form),
        submitter: form.submitter.value.trim(),
        contact: form.contact.value.trim(),
        note: form.note.value.trim(),
      };
      const res = await API.call('submit', {
        data,
        file: { name: currentFile.name, mimeType: currentFile.type || 'application/octet-stream', size: currentFile.size, base64 },
      });
      storageSet('dc_submitter', { name: data.submitter, contact: data.contact });
      const mine = storageGet(MY_KEY, []);
      mine.unshift({ refNo: res.refNo, code: `${buildCode(data.docType, data.dept, data.docNo)} Rev.${data.rev}`, at: new Date().toISOString() });
      storageSet(MY_KEY, mine.slice(0, 10));
      showSuccess(res.refNo, data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(btn, false);
    }
  });
}

function resetForNext() {
  const form = $('#send-form');
  PARSED_FIELDS.concat(['effectiveDate', 'author', 'note']).forEach((k) => { form.elements[k].value = ''; });
  currentFile = null;
  updateCode();
  goStep(1);
}

function showSuccess(refNo, d) {
  $('#step-done').innerHTML = `
    <div class="card p-6 text-center sm:p-10">
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
        <button class="btn btn-primary" id="send-another">${icon('upload', 'h-4 w-4')}ส่งเอกสารอื่น</button>
      </div>
    </div>`;
  $('#copy-ref').addEventListener('click', async () => { if (await copyText(refNo)) toast('คัดลอกเลขอ้างอิงแล้ว'); });
  $('#go-status').addEventListener('click', () => {
    setTab('status');
    $('#status-form').refNo.value = refNo;
    checkStatus(refNo);
    resetForNext();
  });
  $('#send-another').addEventListener('click', resetForNext);
  goStep(3);
}

/* ---------------- ติดตามสถานะ ---------------- */
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

/* ---------------- เริ่มต้น ---------------- */
async function loadOptions() {
  try {
    applyOptions(await API.call('getOptions'));
  } catch (e) {
    /* ใช้ค่าเริ่มต้นใน common.js แทน */
  }
}

function init() {
  initDrop();
  hydrateIcons();
  formReady = loadOptions().then(() => { initForm(); hydrateIcons(); });
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
  goStep(1);
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) { setTab('status'); $('#status-form').refNo.value = ref; checkStatus(ref); } else setTab('send');
}

init();
