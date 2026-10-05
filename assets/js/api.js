/* =============================================================
 * api.js — เชื่อมต่อ Backend (Google Apps Script)
 * ถ้าไม่ได้ตั้งค่า API_URL จะใช้ MockAPI (โหมดทดลองใน Browser)
 * ============================================================= */

const TOKEN_KEY = 'dc_token';

const API = {
  get isDemo() {
    return !(window.APP_CONFIG && APP_CONFIG.API_URL);
  },
  get token() {
    return storageGet(TOKEN_KEY, '');
  },
  set token(v) {
    if (v) storageSet(TOKEN_KEY, v);
    else storageRemove(TOKEN_KEY);
  },

  async call(action, payload = {}) {
    const body = { action, token: this.token, ...payload };
    let res;
    if (this.isDemo) {
      res = await MockAPI.handle(JSON.parse(JSON.stringify(body)));
    } else {
      let r;
      try {
        // ใช้ text/plain เพื่อไม่ให้เกิด CORS preflight กับ Apps Script
        r = await fetch(APP_CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body),
          redirect: 'follow',
        });
      } catch (e) {
        throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
      }
      try {
        res = await r.json();
      } catch (e) {
        throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (ตรวจสอบ API_URL และการ Deploy)');
      }
    }
    if (!res.ok) {
      const err = new Error(res.error || 'เกิดข้อผิดพลาด');
      err.code = res.code;
      if (res.code === 'AUTH') {
        this.token = '';
        window.dispatchEvent(new Event('auth-expired'));
      }
      throw err;
    }
    return res.data;
  },
};

/* =============================================================
 * MockAPI — จำลอง Backend ด้วย localStorage (สำหรับทดลองใช้งาน)
 * ตรรกะเหมือนกับ backend/Code.gs
 * ============================================================= */
const MockAPI = (() => {
  const KEY = 'dc_demo_db';
  const FILE_KEY = 'dc_demo_files';
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const now = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const fail = (msg, code = 'ERROR') => { const e = new Error(msg); e.code = code; throw e; };

  function seed() {
    const people = ['สมชาย ใจดี', 'วิภาวดี ศรีสุข', 'อนุชา พงษ์ไพร', 'กมลชนก แก้วมณี', 'ธนพล รุ่งเรือง'];
    const rows = [
      ['SD', 'QA', '11.01', '03', 'แผนการ Swab Test', '2026-09-18'],
      ['SD', 'QA', '11.01', '02', 'แผนการ Swab Test', '2025-06-01'],
      ['QP', 'QA', '01', '05', 'การควบคุมเอกสารและบันทึก', '2026-01-10'],
      ['QP', 'QC', '02', '02', 'การตรวจสอบวัตถุดิบรับเข้า', '2026-03-15'],
      ['WI', 'QC', '05.02', '01', 'วิธีการสุ่มตัวอย่างผลิตภัณฑ์', '2026-04-20'],
      ['WI', 'PD', '03.01', '04', 'วิธีการทำความสะอาดเครื่องบรรจุ', '2026-07-01'],
      ['WI', 'PD', '03.02', '02', 'การตั้งค่าเครื่องผสม', '2026-02-11'],
      ['FM', 'PD', '07', '01', 'แบบบันทึกการผลิตประจำวัน', '2026-05-05'],
      ['FM', 'QC', '08.01', '03', 'แบบบันทึกผลการตรวจคุณภาพ', '2026-08-01'],
      ['QP', 'MT', '01', '01', 'การบำรุงรักษาเชิงป้องกัน', '2026-01-25'],
      ['FM', 'MT', '02.01', '02', 'แบบฟอร์มแจ้งซ่อม', '2026-06-12'],
      ['QP', 'RD', '01', '00', 'การพัฒนาผลิตภัณฑ์ใหม่', '2026-03-01'],
      ['SD', 'RD', '04.01', '01', 'สูตรมาตรฐานผลิตภัณฑ์', '2026-10-15'],
      ['QP', 'HR', '01', '02', 'การสรรหาและคัดเลือกพนักงาน', '2026-02-01'],
      ['FM', 'HR', '03', '01', 'แบบประเมินการฝึกอบรม', '2026-09-01'],
      ['WI', 'ST', '01.01', '01', 'การรับและจัดเก็บวัตถุดิบ', '2026-04-01'],
      ['FM', 'ST', '02', '02', 'ใบเบิกวัสดุ', '2026-07-20'],
    ];
    const docs = rows.map(([docType, dept, docNo, rev, title, eff], i) => {
      const docCode = `${docType}-${dept}-${docNo}`;
      const created = `${eff}T09:${String(10 + i).padStart(2, '0')}:00`;
      return {
        id: uuid(), docCode, docType, dept, docNo, rev, title, effectiveDate: eff, author: people[i % people.length],
        fileId: '', fileName: `${docCode} Rev.${rev} ${title}.pdf`, mimeType: 'application/pdf',
        fileSize: String(150000 + i * 53211), status: 'Active', submitter: people[(i + 2) % people.length],
        createdAt: created, updatedAt: created, submittedAt: created, submissionId: '', note: i === 0 ? 'ปรับรอบความถี่การ Swab และเพิ่มจุดตรวจบริเวณสายพาน' : '',
      };
    });
    const t = now();
    const subs = [
      { docType: 'WI', dept: 'QC', docNo: '05.03', rev: '01', title: 'วิธีตรวจวัดค่า pH', submitter: 'วิภาวดี ศรีสุข', contact: 'ต่อ 214' },
      { docType: 'SD', dept: 'QA', docNo: '11.01', rev: '04', title: 'แผนการ Swab Test', submitter: 'สมชาย ใจดี', contact: 'somchai@example.com' },
    ].map((s, i) => ({
      id: uuid(), refNo: `SUB-DEMO-00${i + 1}`, ...s, docCode: `${s.docType}-${s.dept}-${s.docNo}`,
      effectiveDate: '2026-11-01', author: s.submitter, fileId: '', fileName: `${s.docType}-${s.dept}-${s.docNo} Rev.${s.rev} ${s.title}.pdf`,
      mimeType: 'application/pdf', fileSize: '284311', status: 'Pending', submittedAt: t, reviewedAt: '', reviewNote: '', note: i === 1 ? 'ปรับรอบความถี่การ Swab จาก 1 เดือนเป็น 2 สัปดาห์' : '',
    }));
    const db = { docs, subs, logs: [], password: 'admin1234', options: DEFAULT_OPTIONS.map((o) => ({ ...o })) };
    recalc(db, 'SD-QA-11.01');
    db.logs.push({ time: t, action: 'SUBMIT', docCode: subs[0].docCode, rev: '01', detail: `ส่งโดย ${subs[0].submitter}` });
    db.logs.push({ time: t, action: 'SUBMIT', docCode: subs[1].docCode, rev: '04', detail: `ส่งโดย ${subs[1].submitter}` });
    return db;
  }

  const load = () => {
    const db = storageGet(KEY) || (() => { const d = seed(); storageSet(KEY, d); return d; })();
    if (!db.options) db.options = DEFAULT_OPTIONS.map((o) => ({ ...o })); // ข้อมูลทดลองรุ่นเก่า
    if (!db.migratedAP) { // เพิ่มประเภท AP ให้ข้อมูลทดลองที่สร้างไว้ก่อนหน้า
      if (!db.options.some((o) => o.kind === 'type' && o.code === 'AP')) db.options.push({ ...DEFAULT_OPTIONS.find((o) => o.code === 'AP') });
      db.migratedAP = true;
    }
    return db;
  };
  const save = (db) => storageSet(KEY, db);
  const files = () => storageGet(FILE_KEY, {});
  const log = (db, action, docCode, rev, detail) => db.logs.push({ time: now(), action, docCode, rev, detail });

  function putFile(file) {
    const id = uuid();
    if (file && file.base64 && file.base64.length < 1500000) {
      const all = files();
      all[id] = { base64: file.base64, mimeType: file.mimeType };
      if (!storageSet(FILE_KEY, all)) return '';
    }
    return id;
  }

  const optActive = (o) => !(o.active === false || o.active === 'false');

  function validateDoc(db, d, requireActive = false) {
    const out = {
      docType: String(d.docType || '').toUpperCase(),
      dept: String(d.dept || '').toUpperCase(),
      docNo: String(d.docNo || '').trim(),
      rev: pad2(d.rev),
      title: String(d.title || '').trim(),
      effectiveDate: String(d.effectiveDate || '').trim(),
      author: String(d.author || '').trim(),
    };
    const has = (kind, code) => db.options.some((o) => o.kind === kind && o.code === code && (!requireActive || optActive(o)));
    if (!has('type', out.docType)) fail('ประเภทเอกสารไม่ถูกต้อง หรือถูกปิดใช้งาน');
    if (!has('dept', out.dept)) fail('รหัสแผนกไม่ถูกต้อง หรือถูกปิดใช้งาน');
    if (!DOC_NO_RE.test(out.docNo)) fail('เลขที่เอกสารไม่ถูกต้อง (เช่น 01 หรือ 11.01)');
    if (!out.rev) fail('กรุณาระบุ Revision');
    if (!out.title) fail('กรุณาระบุชื่อเอกสาร');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out.effectiveDate)) fail('กรุณาระบุวันที่บังคับใช้');
    if (!out.author) fail('กรุณาระบุผู้จัดทำ');
    out.docCode = `${out.docType}-${out.dept}-${out.docNo}`;
    return out;
  }

  function recalc(db, code) {
    const list = db.docs.filter((d) => d.docCode === code);
    if (!list.length) return [];
    const max = Math.max(...list.map((d) => Number(d.rev)));
    const replaced = [];
    list.forEach((d) => {
      const st = Number(d.rev) === max ? 'Active' : 'Obsolete';
      if (d.status !== st) {
        if (st === 'Obsolete') replaced.push(d.rev);
        d.status = st;
        d.updatedAt = now();
      }
    });
    return replaced;
  }

  function dupCheck(db, d, exceptId) {
    if (db.docs.some((x) => x.docCode === d.docCode && x.rev === d.rev && x.id !== exceptId)) {
      fail(`เอกสาร ${d.docCode} Rev.${d.rev} มีอยู่ในระบบแล้ว`);
    }
  }

  function auth(req) {
    const s = storageGet('dc_demo_session');
    if (!req.token || req.token !== s) fail('กรุณาเข้าสู่ระบบใหม่', 'AUTH');
  }

  const fileName = (d, orig) => `${d.docCode} Rev.${d.rev} ${d.title}${fileExt(orig) ? '.' + fileExt(orig) : ''}`;

  const actions = {
    ping: () => ({ demo: true }),

    getOptions: () => load().options,

    saveOption(req) {
      auth(req);
      const db = load();
      const o = req.option || {};
      const kind = o.kind === 'type' ? 'type' : o.kind === 'dept' ? 'dept' : fail('ประเภทตัวเลือกไม่ถูกต้อง');
      const code = String(o.code || '').trim().toUpperCase();
      if (!OPTION_CODE_RE.test(code)) fail('รหัสต้องเป็นตัวอักษรภาษาอังกฤษ 2-4 ตัว');
      const name = String(o.name || '').trim();
      if (!name) fail('กรุณาระบุชื่อ');
      const row = { kind, code, name, th: String(o.th || '').trim(), color: kind === 'type' ? (COLORS[o.color] ? o.color : 'slate') : '', active: o.active !== false };
      const i = db.options.findIndex((x) => x.kind === kind && x.code === code);
      if (req.isNew && i >= 0) fail(`รหัส ${code} มีอยู่แล้ว`);
      if (!req.isNew && i < 0) fail('ไม่พบตัวเลือกนี้');
      if (i >= 0) db.options[i] = row; else db.options.push(row);
      log(db, 'SETTING', code, '', `${req.isNew ? 'เพิ่ม' : 'แก้ไข'}${kind === 'type' ? 'ประเภทเอกสาร' : 'แผนก'} ${code}`);
      save(db);
      return db.options;
    },

    deleteOption(req) {
      auth(req);
      const db = load();
      const field = req.kind === 'type' ? 'docType' : 'dept';
      const used = db.docs.filter((d) => d[field] === req.code).length + db.subs.filter((d) => d[field] === req.code).length;
      if (used) fail(`มีเอกสาร ${used} รายการใช้รหัส ${req.code} อยู่ ลบไม่ได้ (ใช้ "ปิดใช้งาน" แทน)`);
      db.options = db.options.filter((o) => !(o.kind === req.kind && o.code === req.code));
      log(db, 'SETTING', req.code, '', `ลบ${req.kind === 'type' ? 'ประเภทเอกสาร' : 'แผนก'} ${req.code}`);
      save(db);
      return db.options;
    },

    login(req) {
      const db = load();
      if (req.password !== db.password) fail('รหัสผ่านไม่ถูกต้อง');
      const token = uuid();
      storageSet('dc_demo_session', token);
      return { token };
    },

    submit(req) {
      const db = load();
      const d = validateDoc(db, req.data || {}, true);
      if (!String(req.data.submitter || '').trim()) fail('กรุณาระบุชื่อผู้ส่ง');
      if (!req.file || !req.file.name) fail('กรุณาแนบไฟล์');
      if (db.docs.some((x) => x.docCode === d.docCode && x.rev === d.rev)) fail(`เอกสาร ${d.docCode} Rev.${d.rev} มีอยู่ในระบบแล้ว`);
      if (db.subs.some((x) => x.status === 'Pending' && x.docCode === d.docCode && x.rev === d.rev)) fail(`เอกสาร ${d.docCode} Rev.${d.rev} ถูกส่งมาแล้วและกำลังรอตรวจสอบ`);
      const refNo = `SUB-${now().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      db.subs.push({
        id: uuid(), refNo, ...d, submitter: req.data.submitter.trim(), contact: (req.data.contact || '').trim(),
        fileId: putFile(req.file), fileName: req.file.name, mimeType: req.file.mimeType, fileSize: String(req.file.size || 0),
        status: 'Pending', submittedAt: now(), reviewedAt: '', reviewNote: '', note: (req.data.note || '').trim(),
      });
      log(db, 'SUBMIT', d.docCode, d.rev, `ส่งโดย ${req.data.submitter.trim()}`);
      save(db);
      return { refNo };
    },

    checkStatus(req) {
      const db = load();
      const s = db.subs.find((x) => x.refNo.toUpperCase() === String(req.refNo || '').trim().toUpperCase());
      if (!s) fail('ไม่พบเลขอ้างอิงนี้');
      return { refNo: s.refNo, docCode: s.docCode, rev: s.rev, title: s.title, status: s.status, submittedAt: s.submittedAt, reviewedAt: s.reviewedAt, reviewNote: s.reviewNote };
    },

    bootstrap(req) {
      auth(req);
      const db = load();
      return { documents: db.docs, submissions: db.subs, logs: db.logs.slice(-40).reverse(), options: db.options, demo: true };
    },

    approveSubmission(req) {
      auth(req);
      const db = load();
      const sub = db.subs.find((s) => s.id === req.id);
      if (!sub) fail('ไม่พบรายการ');
      if (sub.status !== 'Pending') fail('รายการนี้ถูกตรวจสอบไปแล้ว');
      const d = validateDoc(db, { ...sub, ...(req.data || {}) });
      dupCheck(db, d);
      const t = now();
      const doc = {
        id: uuid(), ...d, fileId: sub.fileId, fileName: fileName(d, sub.fileName), mimeType: sub.mimeType, fileSize: sub.fileSize,
        status: 'Active', submitter: sub.submitter, createdAt: t, updatedAt: t, submittedAt: sub.submittedAt, submissionId: sub.id, note: String((req.data && req.data.note) ?? sub.note ?? '').trim(),
      };
      db.docs.push(doc);
      Object.assign(sub, d, { status: 'Approved', reviewedAt: t, reviewNote: req.note || '' });
      const replaced = recalc(db, d.docCode);
      log(db, 'APPROVE', d.docCode, d.rev, `อนุมัติเอกสารจาก ${sub.submitter}`);
      save(db);
      return { document: doc, replaced };
    },

    rejectSubmission(req) {
      auth(req);
      const db = load();
      const sub = db.subs.find((s) => s.id === req.id);
      if (!sub) fail('ไม่พบรายการ');
      if (sub.status !== 'Pending') fail('รายการนี้ถูกตรวจสอบไปแล้ว');
      if (!String(req.reason || '').trim()) fail('กรุณาระบุเหตุผล');
      Object.assign(sub, { status: 'Rejected', reviewedAt: now(), reviewNote: req.reason.trim() });
      log(db, 'REJECT', sub.docCode, sub.rev, req.reason.trim());
      save(db);
      return true;
    },

    addDocument(req) {
      auth(req);
      const db = load();
      const d = validateDoc(db, req.data || {});
      if (!req.file || !req.file.name) fail('กรุณาแนบไฟล์');
      dupCheck(db, d);
      const t = now();
      const doc = {
        id: uuid(), ...d, fileId: putFile(req.file), fileName: fileName(d, req.file.name), mimeType: req.file.mimeType,
        fileSize: String(req.file.size || 0), status: 'Active', submitter: 'ผู้ดูแลระบบ', createdAt: t, updatedAt: t, submittedAt: t, submissionId: '', note: String(req.data.note || '').trim(),
      };
      db.docs.push(doc);
      const replaced = recalc(db, d.docCode);
      log(db, 'ADD', d.docCode, d.rev, 'เพิ่มเอกสารโดยผู้ดูแล');
      save(db);
      return { document: doc, replaced };
    },

    updateDocument(req) {
      auth(req);
      const db = load();
      const doc = db.docs.find((x) => x.id === req.id);
      if (!doc) fail('ไม่พบเอกสาร');
      const d = validateDoc(db, req.data || {});
      dupCheck(db, d, doc.id);
      const oldCode = doc.docCode;
      Object.assign(doc, d, { fileName: fileName(d, doc.fileName), updatedAt: now() });
      if (req.data.note !== undefined) doc.note = String(req.data.note).trim();
      recalc(db, oldCode);
      recalc(db, d.docCode);
      log(db, 'UPDATE', d.docCode, d.rev, 'แก้ไขข้อมูลเอกสาร');
      save(db);
      return { document: doc };
    },

    deleteDocument(req) {
      auth(req);
      const db = load();
      const i = db.docs.findIndex((x) => x.id === req.id);
      if (i < 0) fail('ไม่พบเอกสาร');
      const [doc] = db.docs.splice(i, 1);
      recalc(db, doc.docCode);
      log(db, 'DELETE', doc.docCode, doc.rev, 'ลบเอกสาร');
      save(db);
      return true;
    },

    getFile(req) {
      auth(req);
      const db = load();
      const item = req.kind === 'submission' ? db.subs.find((s) => s.id === req.id) : db.docs.find((d) => d.id === req.id);
      if (!item) fail('ไม่พบไฟล์');
      if (req.kind !== 'submission' && req.log !== false) { log(db, 'DOWNLOAD', item.docCode, item.rev, item.fileName); save(db); }
      const f = item.fileId && files()[item.fileId];
      if (f) return { name: item.fileName, mimeType: f.mimeType, base64: f.base64 };
      const text = `โหมดทดลอง (Demo)\n\nไฟล์ตัวอย่างของ: ${item.fileName}\nรหัสเอกสาร: ${item.docCode} Rev.${item.rev}\n\nเมื่อเชื่อมต่อ Google Drive แล้วจะได้ไฟล์จริง`;
      const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
      return { name: item.fileName.replace(/\.[^.]+$/, '') + '.txt', mimeType: 'text/plain;charset=utf-8', base64: b64 };
    },

    shareFile(req) {
      auth(req);
      const db = load();
      const doc = db.docs.find((d) => d.id === req.id);
      if (!doc) fail('ไม่พบเอกสาร');
      log(db, 'SHARE', doc.docCode, doc.rev, 'สร้างลิงก์แชร์');
      save(db);
      return { url: `https://drive.google.com/file/d/DEMO-${doc.id.slice(0, 8)}/view` };
    },

    changePassword(req) {
      auth(req);
      const db = load();
      if (req.oldPassword !== db.password) fail('รหัสผ่านเดิมไม่ถูกต้อง');
      if (String(req.newPassword || '').length < 6) fail('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      db.password = req.newPassword;
      save(db);
      return true;
    },

    logout() {
      storageRemove('dc_demo_session');
      return true;
    },

    resetDemo() {
      storageRemove(KEY);
      storageRemove(FILE_KEY);
      return true;
    },
  };

  return {
    async handle(req) {
      await delay(req.action === 'bootstrap' ? 250 : 150);
      try {
        const fn = actions[req.action];
        if (!fn) fail('ไม่รู้จักคำสั่ง ' + req.action);
        return { ok: true, data: fn(req) };
      } catch (e) {
        return { ok: false, error: e.message, code: e.code || 'ERROR' };
      }
    },
  };
})();
