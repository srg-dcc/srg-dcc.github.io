/**
 * =============================================================
 *  DCC (Document Control Center) — Backend (Google Apps Script)
 *  ไฟล์เก็บใน Google Drive / ข้อมูลเก็บใน Google Sheets
 * -------------------------------------------------------------
 *  วิธีติดตั้ง (ดูรายละเอียดใน README.md)
 *   1. สร้างโปรเจกต์ใหม่ที่ https://script.google.com
 *   2. วางโค้ดไฟล์นี้ลงใน Code.gs แล้วกด Save
 *   3. เลือกฟังก์ชัน setup แล้วกด Run (อนุญาตสิทธิ์ครั้งแรก)
 *   4. Deploy > New deployment > Web app
 *        Execute as: Me  /  Who has access: Anyone
 *   5. คัดลอก Web app URL ไปใส่ใน assets/js/config.js
 * =============================================================
 */

const APP = {
  ROOT_FOLDER: 'DCC',
  DEFAULT_PASSWORD: 'admin1234',
  SESSION_SECONDS: 6 * 60 * 60, // อยู่ในระบบได้ 6 ชั่วโมง
  MAX_FILE_MB: 25,
  MAX_PENDING: 100,            // รับเอกสารรอตรวจได้สูงสุดกี่รายการ (กันการส่งไฟล์ถล่มจนพื้นที่เต็ม)
  MIN_PASSWORD: 8,
};

// จำกัดความยาวข้อความแต่ละช่อง (กันข้อมูลขยะ/เกินขนาด cell ของ Sheets)
const MAX_LEN = { title: 200, author: 100, submitter: 100, contact: 150, note: 2000, reason: 1000, fileName: 255, name: 100, th: 100 };
const MIME_BY_EXT = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};

// ค่าเริ่มต้นของแผนก/ประเภทเอกสาร — หลังติดตั้งแล้วให้เพิ่ม/แก้ไขผ่านหน้า "ตั้งค่า" ในระบบ (เก็บในชีต Options)
const DEFAULT_OPTIONS = [
  ['type', 'QP', 'Quality Procedure', 'ระเบียบปฏิบัติ', 'indigo'],
  ['type', 'WI', 'Work Instruction', 'วิธีปฏิบัติงาน', 'sky'],
  ['type', 'SD', 'Supporting Document', 'เอกสารสนับสนุน', 'teal'],
  ['type', 'FM', 'Form', 'แบบฟอร์ม', 'amber'],
  ['type', 'AP', 'Annual Plan', 'แผนงานประจำปี', 'violet'],
  ['dept', 'PD', 'Production', 'ฝ่ายผลิต', ''],
  ['dept', 'QC', 'Quality Control', 'ฝ่ายควบคุมคุณภาพ', ''],
  ['dept', 'QA', 'Quality Assurance', 'ฝ่ายประกันคุณภาพ', ''],
  ['dept', 'MT', 'Maintenance', 'ฝ่ายซ่อมบำรุง', ''],
  ['dept', 'RD', 'Research and Development', 'ฝ่ายวิจัยและพัฒนา', ''],
  ['dept', 'HR', 'Human Resource', 'ฝ่ายบุคคล', ''],
  ['dept', 'ST', 'Store', 'ฝ่ายคลังสินค้า', ''],
];
const COLORS = ['indigo', 'sky', 'teal', 'amber', 'rose', 'violet', 'emerald', 'orange', 'pink', 'lime', 'cyan', 'slate'];
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png'];

const T = {
  DOCS: {
    name: 'Documents',
    headers: ['id', 'docCode', 'docType', 'dept', 'docNo', 'rev', 'title', 'effectiveDate', 'author', 'fileId', 'fileName',
      'mimeType', 'fileSize', 'status', 'submitter', 'createdAt', 'updatedAt', 'submissionId', 'note', 'submittedAt'],
  },
  SUBS: {
    name: 'Submissions',
    headers: ['id', 'refNo', 'docCode', 'docType', 'dept', 'docNo', 'rev', 'title', 'effectiveDate', 'author', 'submitter', 'contact',
      'fileId', 'fileName', 'mimeType', 'fileSize', 'status', 'submittedAt', 'reviewedAt', 'reviewNote', 'note'],
  },
  LOGS: { name: 'Logs', headers: ['time', 'action', 'docCode', 'rev', 'detail'] },
  OPTIONS: { name: 'Options', headers: ['kind', 'code', 'name', 'th', 'color', 'active'] },
};

/* =============================================================
 *  ฟังก์ชันสำหรับรันเองใน Apps Script Editor
 * ============================================================= */

/** รันครั้งแรกครั้งเดียว: สร้าง Spreadsheet, โฟลเดอร์ และรหัสผ่านเริ่มต้น */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const root = rootFolder_();
  let ssId = props.getProperty('SPREADSHEET_ID');
  if (!ssId) {
    const ss = SpreadsheetApp.create('DCC Database');
    ssId = ss.getId();
    props.setProperty('SPREADSHEET_ID', ssId);
    DriveApp.getFileById(ssId).moveTo(root);
  }
  const ss = db_();
  Object.keys(T).forEach((k) => sheet_(T[k]));
  ss.getSheets().forEach((sh) => {
    const known = Object.keys(T).some((k) => T[k].name === sh.getName());
    if (!known && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  folder_(root, '01 รอตรวจสอบ (Pending)');
  folder_(root, '02 เอกสารใช้งาน (Active)');
  folder_(root, '03 Rev เก่า (Obsolete)');
  if (!props.getProperty('PASSWORD_HASH')) setPassword_(APP.DEFAULT_PASSWORD);
  options_(); // สร้างค่าเริ่มต้นของแผนก/ประเภท ถ้ายังไม่มี
  Logger.log('✅ ตั้งค่าเสร็จแล้ว');
  Logger.log('📁 โฟลเดอร์: ' + root.getUrl());
  Logger.log('📊 ฐานข้อมูล: ' + ss.getUrl());
  Logger.log('🔑 รหัสผ่านเริ่มต้น: ' + APP.DEFAULT_PASSWORD + ' (กรุณาเปลี่ยนหลังเข้าสู่ระบบ)');
}

/** ใช้เมื่อลืมรหัสผ่าน: รีเซ็ตกลับเป็นรหัสผ่านเริ่มต้น */
function resetPassword() {
  setPassword_(APP.DEFAULT_PASSWORD);
  Logger.log('รีเซ็ตรหัสผ่านเป็น ' + APP.DEFAULT_PASSWORD + ' แล้ว');
}

/* =============================================================
 *  Web App entry points
 * ============================================================= */

function doGet() {
  return out_({ ok: true, data: { service: 'DCC API', time: now_() } });
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(req.action || '');
    if (Object.prototype.hasOwnProperty.call(PUBLIC_ACTIONS, action)) {
      return out_({ ok: true, data: PUBLIC_ACTIONS[action](req) });
    }
    if (Object.prototype.hasOwnProperty.call(ADMIN_ACTIONS, action)) {
      requireAuth_(req.token);
      return out_({ ok: true, data: ADMIN_ACTIONS[action](req) });
    }
    fail_('ไม่รู้จักคำสั่ง: ' + action);
  } catch (err) {
    return out_({ ok: false, error: err.message || String(err), code: err.code || 'ERROR' });
  }
}

const PUBLIC_ACTIONS = {
  ping: () => ({ time: now_() }),
  getOptions: () => options_(),
  login: login_,
  submit: submit_,
  checkStatus: checkStatus_,
};

const ADMIN_ACTIONS = {
  bootstrap: bootstrap_,
  approveSubmission: approveSubmission_,
  rejectSubmission: rejectSubmission_,
  addDocument: addDocument_,
  updateDocument: updateDocument_,
  deleteDocument: deleteDocument_,
  getFile: getFile_,
  shareFile: shareFile_,
  changePassword: changePassword_,
  saveOption: saveOption_,
  deleteOption: deleteOption_,
  logout: logout_,
};

/* =============================================================
 *  Auth
 * ============================================================= */

function login_(req) {
  const cache = CacheService.getScriptCache();
  const attempts = Number(cache.get('login_fail') || 0);
  if (attempts >= 5) fail_('ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ 5 นาทีแล้วลองใหม่');
  if (!checkPassword_(req.password)) {
    cache.put('login_fail', String(attempts + 1), 300);
    fail_('รหัสผ่านไม่ถูกต้อง');
  }
  cache.remove('login_fail');
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('sess_' + token, sessionEpoch_(), APP.SESSION_SECONDS);
  // ยังใช้รหัสผ่านเริ่มต้นอยู่ → บังคับให้เปลี่ยน
  return { token: token, mustChangePassword: checkPassword_(APP.DEFAULT_PASSWORD) };
}

/** เปลี่ยนค่านี้เมื่อเปลี่ยนรหัสผ่าน → session เก่าทั้งหมดใช้ไม่ได้ทันที */
function sessionEpoch_() {
  return PropertiesService.getScriptProperties().getProperty('SESSION_EPOCH') || '1';
}

function logout_(req) {
  CacheService.getScriptCache().remove('sess_' + req.token);
  return true;
}

function requireAuth_(token) {
  const cache = CacheService.getScriptCache();
  const epoch = sessionEpoch_();
  if (!token || cache.get('sess_' + token) !== epoch) fail_('กรุณาเข้าสู่ระบบใหม่', 'AUTH');
  cache.put('sess_' + token, epoch, APP.SESSION_SECONDS); // ต่ออายุ session
}

function changePassword_(req) {
  if (!checkPassword_(req.oldPassword)) fail_('รหัสผ่านเดิมไม่ถูกต้อง');
  const pw = String(req.newPassword || '');
  if (pw.length < APP.MIN_PASSWORD) fail_('รหัสผ่านใหม่ต้องมีอย่างน้อย ' + APP.MIN_PASSWORD + ' ตัวอักษร');
  if (pw === APP.DEFAULT_PASSWORD) fail_('ห้ามใช้รหัสผ่านเริ่มต้น');
  setPassword_(pw);
  // ออกจากระบบทุกเครื่อง แล้วออก session ใหม่ให้เครื่องนี้
  PropertiesService.getScriptProperties().setProperty('SESSION_EPOCH', Utilities.getUuid());
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('sess_' + token, sessionEpoch_(), APP.SESSION_SECONDS);
  return { token: token };
}

function setPassword_(pw) {
  const salt = Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PASSWORD_SALT', salt);
  props.setProperty('PASSWORD_HASH', sha256_(salt + pw));
}

function checkPassword_(pw) {
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty('PASSWORD_HASH');
  if (!hash) fail_('ระบบยังไม่ได้ตั้งค่า กรุณารันฟังก์ชัน setup() ก่อน');
  return sha256_(props.getProperty('PASSWORD_SALT') + String(pw || '')) === hash;
}

function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map((b) => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

/* =============================================================
 *  Public: ส่งเอกสาร / ติดตามสถานะ
 * ============================================================= */

function submit_(req) {
  const data = req.data || {};
  const d = validateDoc_(data, true);
  const submitter = limit_(data.submitter, 'submitter');
  if (!submitter) fail_('กรุณาระบุชื่อผู้ส่ง');
  checkFile_(req.file);

  return withLock_(() => {
    if (readAll_(T.DOCS).some((x) => x.docCode === d.docCode && x.rev === d.rev)) {
      fail_('เอกสาร ' + d.docCode + ' Rev.' + d.rev + ' มีอยู่ในระบบแล้ว');
    }
    const pending = readAll_(T.SUBS).filter((x) => x.status === 'Pending');
    if (pending.length >= APP.MAX_PENDING) fail_('มีเอกสารรอตรวจสอบจำนวนมาก ระบบปิดรับชั่วคราว กรุณาติดต่อผู้ดูแลเอกสาร');
    if (pending.some((x) => x.docCode === d.docCode && x.rev === d.rev)) {
      fail_('เอกสาร ' + d.docCode + ' Rev.' + d.rev + ' ถูกส่งมาแล้วและกำลังรอตรวจสอบ');
    }
    const file = saveFile_(req.file, folder_(rootFolder_(), '01 รอตรวจสอบ (Pending)'), req.file.name);
    // เลขอ้างอิงสุ่ม 10 หลัก เดาไม่ได้ (ใช้ดูสถานะโดยไม่ต้อง Login)
    const refNo = 'SUB-' + Utilities.formatDate(new Date(), tz_(), 'yyMMdd') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    insert_(T.SUBS, Object.assign({}, d, {
      id: Utilities.getUuid(), refNo: refNo, submitter: submitter, contact: limit_(data.contact, 'contact'),
      fileId: file.getId(), fileName: limit_(req.file.name, 'fileName'), mimeType: file.getMimeType(), fileSize: file.getSize(),
      status: 'Pending', submittedAt: now_(), reviewedAt: '', reviewNote: '', note: limit_(data.note, 'note'),
    }));
    log_('SUBMIT', d.docCode, d.rev, 'ส่งโดย ' + submitter);
    return { refNo: refNo };
  });
}

function checkStatus_(req) {
  const ref = str_(req.refNo).toUpperCase();
  const s = readAll_(T.SUBS).find((x) => x.refNo.toUpperCase() === ref);
  if (!ref || !s) fail_('ไม่พบเลขอ้างอิงนี้');
  return {
    refNo: s.refNo, docCode: s.docCode, rev: s.rev, title: s.title, status: s.status,
    submittedAt: s.submittedAt, reviewedAt: s.reviewedAt, reviewNote: s.reviewNote,
  };
}

/* =============================================================
 *  Admin
 * ============================================================= */

function bootstrap_() {
  return {
    documents: readAll_(T.DOCS).map(clean_),
    submissions: readAll_(T.SUBS).map(clean_),
    logs: readLast_(T.LOGS, 40).reverse(),
    options: options_(),
  };
}

function approveSubmission_(req) {
  return withLock_(() => {
    const sub = readAll_(T.SUBS).find((s) => s.id === req.id);
    if (!sub) fail_('ไม่พบรายการ');
    if (sub.status !== 'Pending') fail_('รายการนี้ถูกตรวจสอบไปแล้ว');
    const d = validateDoc_(Object.assign({}, sub, req.data || {}));
    dupCheck_(d);
    const file = DriveApp.getFileById(sub.fileId);
    file.setName(fileName_(d, sub.fileName));
    file.moveTo(statusFolder_('Active', d.dept));
    const t = now_();
    const doc = Object.assign({}, d, {
      id: Utilities.getUuid(), fileId: sub.fileId, fileName: file.getName(), mimeType: sub.mimeType, fileSize: sub.fileSize,
      status: 'Active', submitter: sub.submitter, createdAt: t, updatedAt: t, submittedAt: sub.submittedAt, submissionId: sub.id,
      note: req.data && req.data.note !== undefined ? limit_(req.data.note, 'note') : sub.note, // เนื้อหาที่มีการแก้ไข
    });
    insert_(T.DOCS, doc);
    update_(T.SUBS, sub, Object.assign({}, d, { status: 'Approved', reviewedAt: t, reviewNote: limit_(req.note, 'reason') }));
    const replaced = recalcStatus_(d.docCode);
    log_('APPROVE', d.docCode, d.rev, 'อนุมัติเอกสารจาก ' + sub.submitter);
    return { document: doc, replaced: replaced };
  });
}

function rejectSubmission_(req) {
  const reason = limit_(req.reason, 'reason');
  if (!reason) fail_('กรุณาระบุเหตุผล');
  return withLock_(() => {
    const sub = readAll_(T.SUBS).find((s) => s.id === req.id);
    if (!sub) fail_('ไม่พบรายการ');
    if (sub.status !== 'Pending') fail_('รายการนี้ถูกตรวจสอบไปแล้ว');
    try { DriveApp.getFileById(sub.fileId).setTrashed(true); } catch (e) { /* ไฟล์อาจถูกลบไปแล้ว */ }
    update_(T.SUBS, sub, { status: 'Rejected', reviewedAt: now_(), reviewNote: reason });
    log_('REJECT', sub.docCode, sub.rev, reason);
    return true;
  });
}

function addDocument_(req) {
  const d = validateDoc_(req.data || {});
  checkFile_(req.file);
  return withLock_(() => {
    dupCheck_(d);
    const file = saveFile_(req.file, statusFolder_('Active', d.dept), fileName_(d, req.file.name));
    const t = now_();
    const doc = Object.assign({}, d, {
      id: Utilities.getUuid(), fileId: file.getId(), fileName: file.getName(), mimeType: file.getMimeType(), fileSize: file.getSize(),
      status: 'Active', submitter: 'ผู้ดูแลระบบ', createdAt: t, updatedAt: t, submittedAt: t, submissionId: '', note: limit_((req.data || {}).note, 'note'),
    });
    insert_(T.DOCS, doc);
    const replaced = recalcStatus_(d.docCode);
    log_('ADD', d.docCode, d.rev, 'เพิ่มเอกสารโดยผู้ดูแล');
    return { document: doc, replaced: replaced };
  });
}

function updateDocument_(req) {
  const d = validateDoc_(req.data || {});
  return withLock_(() => {
    const doc = readAll_(T.DOCS).find((x) => x.id === req.id);
    if (!doc) fail_('ไม่พบเอกสาร');
    dupCheck_(d, doc.id);
    const patch = Object.assign({}, d, { fileName: fileName_(d, doc.fileName), updatedAt: now_() });
    if (req.data.note !== undefined) patch.note = limit_(req.data.note, 'note');
    try {
      const file = DriveApp.getFileById(doc.fileId);
      file.setName(patch.fileName);
      if (d.dept !== doc.dept) file.moveTo(statusFolder_(doc.status, d.dept));
    } catch (e) { /* ไม่พบไฟล์ใน Drive */ }
    update_(T.DOCS, doc, patch);
    recalcStatus_(doc.docCode);
    if (doc.docCode !== d.docCode) recalcStatus_(d.docCode);
    log_('UPDATE', d.docCode, d.rev, 'แก้ไขข้อมูลเอกสาร');
    return { document: Object.assign(clean_(doc), patch) };
  });
}

function deleteDocument_(req) {
  return withLock_(() => {
    const doc = readAll_(T.DOCS).find((x) => x.id === req.id);
    if (!doc) fail_('ไม่พบเอกสาร');
    try { DriveApp.getFileById(doc.fileId).setTrashed(true); } catch (e) { /* ignore */ }
    sheet_(T.DOCS).deleteRow(doc._row);
    recalcStatus_(doc.docCode);
    log_('DELETE', doc.docCode, doc.rev, 'ลบเอกสาร');
    return true;
  });
}

function getFile_(req) {
  const list = req.kind === 'submission' ? readAll_(T.SUBS) : readAll_(T.DOCS);
  const item = list.find((x) => x.id === req.id);
  if (!item) fail_('ไม่พบไฟล์');
  let file;
  try { file = DriveApp.getFileById(item.fileId); } catch (e) { fail_('ไม่พบไฟล์ใน Google Drive'); }
  const blob = file.getBlob();
  if (req.kind !== 'submission' && req.log !== false) log_('DOWNLOAD', item.docCode, item.rev, item.fileName);
  return { name: file.getName(), mimeType: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

function shareFile_(req) {
  const doc = readAll_(T.DOCS).find((x) => x.id === req.id);
  if (!doc) fail_('ไม่พบเอกสาร');
  const file = DriveApp.getFileById(doc.fileId);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    fail_('ไม่สามารถเปิดแชร์ลิงก์ได้ (บัญชีองค์กรอาจไม่อนุญาตให้แชร์ภายนอก)');
  }
  log_('SHARE', doc.docCode, doc.rev, 'สร้างลิงก์แชร์');
  return { url: 'https://drive.google.com/file/d/' + doc.fileId + '/view?usp=sharing' };
}

/* =============================================================
 *  ตัวเลือก: แผนก / ประเภทเอกสาร
 * ============================================================= */

function options_() {
  let rows = readAll_(T.OPTIONS);
  const props = PropertiesService.getScriptProperties();
  if (rows.length && !props.getProperty('MIGRATED_AP')) {
    // ระบบที่ติดตั้งก่อนมีประเภท AP → เพิ่มให้ครั้งเดียว (ถ้าลบทิ้งภายหลังจะไม่ถูกเพิ่มกลับ)
    if (!rows.some((o) => o.kind === 'type' && o.code === 'AP')) {
      insert_(T.OPTIONS, { kind: 'type', code: 'AP', name: 'Annual Plan', th: 'แผนงานประจำปี', color: 'violet', active: 'TRUE' });
      rows = readAll_(T.OPTIONS);
    }
    props.setProperty('MIGRATED_AP', '1');
  }
  if (!rows.length) {
    props.setProperty('MIGRATED_AP', '1');
    DEFAULT_OPTIONS.forEach((r) => insert_(T.OPTIONS, { kind: r[0], code: r[1], name: r[2], th: r[3], color: r[4], active: 'TRUE' }));
    rows = readAll_(T.OPTIONS);
  }
  return rows.map((o) => ({ kind: o.kind, code: o.code, name: o.name, th: o.th, color: o.color, active: String(o.active).toUpperCase() !== 'FALSE' }));
}

function saveOption_(req) {
  const o = req.option || {};
  const kind = o.kind === 'type' || o.kind === 'dept' ? o.kind : fail_('ประเภทตัวเลือกไม่ถูกต้อง');
  const code = str_(o.code).toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(code)) fail_('รหัสต้องเป็นตัวอักษรภาษาอังกฤษ 2-4 ตัว');
  const name = limit_(o.name, 'name');
  if (!name) fail_('กรุณาระบุชื่อ');
  const row = {
    kind: kind, code: code, name: name, th: limit_(o.th, 'th'),
    color: kind === 'type' ? (COLORS.indexOf(o.color) >= 0 ? o.color : 'slate') : '',
    active: o.active === false ? 'FALSE' : 'TRUE',
  };
  return withLock_(() => {
    options_();
    const cur = readAll_(T.OPTIONS).find((x) => x.kind === kind && x.code === code);
    if (req.isNew && cur) fail_('รหัส ' + code + ' มีอยู่แล้ว');
    if (!req.isNew && !cur) fail_('ไม่พบตัวเลือกนี้');
    if (cur) update_(T.OPTIONS, cur, row); else insert_(T.OPTIONS, row);
    log_('SETTING', code, '', (req.isNew ? 'เพิ่ม' : 'แก้ไข') + (kind === 'type' ? 'ประเภทเอกสาร ' : 'แผนก ') + code);
    return options_();
  });
}

function deleteOption_(req) {
  const field = req.kind === 'type' ? 'docType' : 'dept';
  return withLock_(() => {
    const used = readAll_(T.DOCS).filter((d) => d[field] === req.code).length
      + readAll_(T.SUBS).filter((d) => d[field] === req.code).length;
    if (used) fail_('มีเอกสาร ' + used + ' รายการใช้รหัส ' + req.code + ' อยู่ ลบไม่ได้ (ใช้ "ปิดใช้งาน" แทน)');
    const cur = readAll_(T.OPTIONS).find((x) => x.kind === req.kind && x.code === req.code);
    if (!cur) fail_('ไม่พบตัวเลือกนี้');
    sheet_(T.OPTIONS).deleteRow(cur._row);
    log_('SETTING', req.code, '', 'ลบ' + (req.kind === 'type' ? 'ประเภทเอกสาร ' : 'แผนก ') + req.code);
    return options_();
  });
}

/* =============================================================
 *  Business logic
 * ============================================================= */

function validateDoc_(src, requireActive) {
  const d = {
    docType: str_(src.docType).toUpperCase(),
    dept: str_(src.dept).toUpperCase(),
    docNo: str_(src.docNo),
    rev: pad2_(src.rev),
    title: limit_(src.title, 'title'),
    effectiveDate: str_(src.effectiveDate),
    author: limit_(src.author, 'author'),
  };
  const opts = options_();
  const has = (kind, code) => opts.some((o) => o.kind === kind && o.code === code && (!requireActive || o.active));
  if (!has('type', d.docType)) fail_('ประเภทเอกสารไม่ถูกต้อง หรือถูกปิดใช้งาน');
  if (!has('dept', d.dept)) fail_('รหัสแผนกไม่ถูกต้อง หรือถูกปิดใช้งาน');
  if (!/^\d{2,3}(\.\d{2,3})?$/.test(d.docNo)) fail_('เลขที่เอกสารไม่ถูกต้อง (เช่น 01 หรือ 11.01)');
  if (!d.rev) fail_('กรุณาระบุ Revision');
  if (!d.title) fail_('กรุณาระบุชื่อเอกสาร');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.effectiveDate)) fail_('กรุณาระบุวันที่บังคับใช้');
  if (!d.author) fail_('กรุณาระบุผู้จัดทำ');
  d.docCode = d.docType + '-' + d.dept + '-' + d.docNo;
  return d;
}

function dupCheck_(d, exceptId) {
  if (readAll_(T.DOCS).some((x) => x.docCode === d.docCode && x.rev === d.rev && x.id !== exceptId)) {
    fail_('เอกสาร ' + d.docCode + ' Rev.' + d.rev + ' มีอยู่ในระบบแล้ว');
  }
}

/** ให้ Rev สูงสุดของรหัสเอกสารเป็น Active ที่เหลือเป็น Obsolete และย้ายไฟล์ให้ตรงโฟลเดอร์ */
function recalcStatus_(code) {
  const list = readAll_(T.DOCS).filter((d) => d.docCode === code);
  if (!list.length) return [];
  const max = Math.max.apply(null, list.map((d) => Number(d.rev)));
  const replaced = [];
  list.forEach((d) => {
    const st = Number(d.rev) === max ? 'Active' : 'Obsolete';
    if (d.status === st) return;
    if (st === 'Obsolete') replaced.push(d.rev);
    update_(T.DOCS, d, { status: st, updatedAt: now_() });
    try { DriveApp.getFileById(d.fileId).moveTo(statusFolder_(st, d.dept)); } catch (e) { /* ignore */ }
  });
  return replaced;
}

function fileName_(d, original) {
  const m = String(original || '').match(/\.([^.]+)$/);
  const ext = m ? m[1].toLowerCase() : '';
  // ตัดนามสกุลที่ติดมากับชื่อเอกสาร (เช่น "แผนงาน.pdf") เพื่อไม่ให้ได้ชื่อไฟล์ .pdf.pdf
  const title = ext ? d.title.replace(new RegExp('\\.' + ext + '$', 'i'), '') : d.title;
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, ' ');
  return d.docCode + ' Rev.' + d.rev + ' ' + safeTitle + (ext ? '.' + ext : '');
}

function checkFile_(f) {
  if (!f || !f.name || !f.base64) fail_('กรุณาแนบไฟล์');
  const ext = (String(f.name).match(/\.([^.]+)$/) || [])[1];
  if (!ext || ALLOWED_EXT.indexOf(ext.toLowerCase()) < 0) fail_('ไม่รองรับไฟล์ประเภทนี้');
  if (f.base64.length * 0.75 > APP.MAX_FILE_MB * 1024 * 1024) fail_('ไฟล์ใหญ่เกิน ' + APP.MAX_FILE_MB + ' MB');
}

function saveFile_(f, folder, name) {
  // กำหนดชนิดไฟล์จากนามสกุลเอง ไม่เชื่อค่าที่ส่งมาจาก Browser (กันไฟล์ปลอมชนิด เช่น HTML แฝงเป็น PDF)
  const ext = (String(f.name).match(/\.([^.]+)$/) || [])[1].toLowerCase();
  const bytes = Utilities.base64Decode(f.base64);
  const blob = Utilities.newBlob(bytes, MIME_BY_EXT[ext] || 'application/octet-stream', name);
  return folder.createFile(blob);
}

/* =============================================================
 *  Drive helpers
 * ============================================================= */

function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* ถูกลบไป สร้างใหม่ */ }
  }
  const f = DriveApp.createFolder(APP.ROOT_FOLDER);
  props.setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}

function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function statusFolder_(status, dept) {
  const base = status === 'Active' ? '02 เอกสารใช้งาน (Active)' : '03 Rev เก่า (Obsolete)';
  return folder_(folder_(rootFolder_(), base), dept);
}

/* =============================================================
 *  Sheet helpers (เก็บทุกค่าเป็นข้อความ เพื่อไม่ให้ Sheets แปลง 03 เป็น 3)
 * ============================================================= */

let SS_CACHE_ = null;
function db_() {
  if (!SS_CACHE_) {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) fail_('ระบบยังไม่ได้ตั้งค่า กรุณารันฟังก์ชัน setup() ใน Apps Script ก่อน');
    SS_CACHE_ = SpreadsheetApp.openById(id);
  }
  return SS_CACHE_;
}

function sheet_(t) {
  let sh = db_().getSheetByName(t.name);
  if (!sh) {
    sh = db_().insertSheet(t.name);
    sh.getRange(1, 1, 1, t.headers.length).setValues([t.headers]).setFontWeight('bold').setBackground('#f1f5f9');
    sh.setFrozenRows(1);
  } else if (!SHEET_CHECKED_[t.name]) {
    // ระบบเวอร์ชันใหม่เพิ่มคอลัมน์ต่อท้าย → เติมหัวคอลัมน์ให้ชีตเดิมอัตโนมัติ
    if (sh.getLastColumn() < t.headers.length) {
      sh.getRange(1, 1, 1, t.headers.length).setValues([t.headers]).setFontWeight('bold').setBackground('#f1f5f9');
    }
  }
  SHEET_CHECKED_[t.name] = true;
  return sh;
}
const SHEET_CHECKED_ = {};

function readAll_(t) {
  const sh = sheet_(t);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, t.headers.length).getDisplayValues().map((r, i) => {
    const o = { _row: i + 2 };
    t.headers.forEach((h, j) => { o[h] = cellRead_(r[j]); });
    return o;
  });
}

function readLast_(t, count) {
  const sh = sheet_(t);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - count + 1);
  return sh.getRange(start, 1, last - start + 1, t.headers.length).getDisplayValues().map((r) => {
    const o = {};
    t.headers.forEach((h, j) => { o[h] = cellRead_(r[j]); });
    return o;
  });
}

function writeRow_(t, row, obj) {
  const vals = t.headers.map((h) => cellSafe_(obj[h]));
  sheet_(t).getRange(row, 1, 1, t.headers.length).setNumberFormat('@').setValues([vals]);
}

function insert_(t, obj) {
  writeRow_(t, sheet_(t).getLastRow() + 1, obj);
}

function update_(t, current, patch) {
  Object.assign(current, patch);
  writeRow_(t, current._row, current);
}

function log_(action, docCode, rev, detail) {
  insert_(T.LOGS, { time: now_(), action: action, docCode: docCode, rev: rev, detail: detail });
}

/* =============================================================
 *  Utils
 * ============================================================= */

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) fail_('ระบบกำลังทำงานอยู่ กรุณาลองใหม่อีกครั้ง');
  try { return fn(); } finally { lock.releaseLock(); }
}

function fail_(msg, code) {
  const e = new Error(msg);
  e.code = code || 'ERROR';
  throw e;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(o) {
  const c = Object.assign({}, o);
  delete c._row;
  return c;
}

/**
 * กัน Formula injection: ข้อความที่ขึ้นต้นด้วย = + - @ จะถูก Sheets มองเป็นสูตร
 * (เช่น =IMPORTXML(...) ที่ส่งข้อมูลในชีตออกไปภายนอก) จึงเติม ' นำหน้าให้เป็นข้อความเสมอ
 */
function cellSafe_(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /^[=+\-@']/.test(s) ? "'" + s : s;
}
function cellRead_(v) {
  return /^'[=+\-@']/.test(v) ? v.slice(1) : v;
}

/** ตัดช่องว่าง + จำกัดความยาวตาม MAX_LEN */
function limit_(v, key) {
  return str_(v).slice(0, MAX_LEN[key] || 500);
}

function str_(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function pad2_(v) { const n = String(v === undefined || v === null ? '' : v).replace(/\D/g, ''); return n ? ('0' + n).slice(-2) : ''; }
function tz_() { return Session.getScriptTimeZone() || 'Asia/Bangkok'; }
function now_() { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm:ss"); }
