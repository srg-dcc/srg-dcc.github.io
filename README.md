# DocControl — ระบบจัดเก็บและควบคุมเอกสารองค์กร

ระบบเล็ก ๆ สำหรับรับเอกสารจากผู้อื่น ตรวจสอบ แล้วจัดเก็บอย่างเป็นระเบียบ ค้นหาเร็ว และส่งต่อไฟล์ได้ง่าย

- **Frontend:** HTML + Tailwind CSS + JavaScript (ไม่ต้อง build) — ฝากฟรีบน GitHub Pages
- **Backend:** Google Apps Script — ไฟล์เก็บใน **Google Drive (ฟรี 15 GB)**, ข้อมูลเก็บใน **Google Sheets**
- **ออนไลน์ตลอด:** ทั้ง GitHub Pages และ Apps Script ไม่มีการ sleep/pause และไม่มีค่าใช้จ่าย

## ความสามารถ

| หน้า | รายละเอียด |
|---|---|
| **ภาพรวม (Dashboard)** | จำนวนเอกสารที่ใช้งาน, งานรอตรวจ, เอกสารเพิ่มเดือนนี้, พื้นที่ที่ใช้, กราฟแยกแผนก/ประเภท, ตารางสรุปแผนก × ประเภท, เอกสารที่จะเริ่มบังคับใช้, กิจกรรมล่าสุด |
| **เอกสารทั้งหมด** | ช่องค้นหา (กด `/` เพื่อค้นหาได้ทันที), Filter ประเภท/แผนก/สถานะ, เรียงคอลัมน์ได้, ไฮไลต์คำค้น · คอลัมน์: รหัสเอกสาร, ชื่อเอกสาร, แผนก, Revision, วันที่บังคับใช้, ไฟล์, ผู้จัดทำ, จัดการไฟล์ (เปิดดู / ดาวน์โหลด / สร้างลิงก์ส่งต่อ / แก้ไข / ลบ) |
| **รอตรวจสอบ** | รายการที่ผู้อื่นส่งมา → เปิดดูไฟล์ → แก้ข้อมูลได้ → **อนุมัติและจัดเก็บ** หรือ **ตีกลับ** พร้อมเหตุผล · มีแท็บประวัติการตรวจ |
| **ประวัติ Revision** | คลิกที่ Rev ในตาราง เพื่อดู/โหลด Rev เก่าทั้งหมด และเพิ่ม Rev ใหม่ |
| **หน้าส่งเอกสาร** (`submit.html`) | สำหรับผู้อื่น ไม่ต้อง Login · ตั้งชื่อไฟล์ตามรูปแบบแล้วระบบกรอกข้อมูลให้อัตโนมัติ · ได้เลขอ้างอิงไว้ติดตามสถานะ |

**รูปแบบรหัสเอกสาร:** `ประเภท-แผนก-เลขที่` เช่น `SD-QA-11.01`
- ประเภท: `QP` Quality Procedure, `WI` Work Instruction, `SD` Supporting Document, `FM` Form
- แผนก: `PD` Production, `QC` Quality Control, `QA` Quality Assurance, `MT` Maintenance, `RD` Research and Development, `HR` Human Resource, `ST` Store
- Revision: `Rev.00`, `Rev.01`, `Rev.02`, ...

**ชื่อไฟล์ที่แนะนำ:** `SD-QA-11.01 Rev.03 แผนการ Swab Test.pdf`

**การจัดการ Revision:** เมื่ออนุมัติ Rev ใหม่ Rev เดิมจะถูกย้ายไปเป็น "ประวัติ" โดยอัตโนมัติ (ไม่ถูกลบ) ตารางหลักจะแสดงเฉพาะ Rev ล่าสุด และเลือกดู Rev เก่าได้ที่ Filter "สถานะ"

---

## ทดลองใช้ทันที (โหมดทดลอง)

ถ้ายังไม่ได้ตั้งค่า `API_URL` ระบบจะทำงานใน **โหมดทดลอง** ซึ่งเก็บข้อมูลใน Browser และมีข้อมูลตัวอย่างให้

1. เปิดไฟล์ `index.html` ผ่าน Web server เช่น `npx serve .` หรือ `python3 -m http.server` แล้วเข้า `http://localhost:8000`
2. รหัสผ่านเริ่มต้นคือ `admin1234`

---

## ติดตั้งใช้งานจริง (ประมาณ 10 นาที)

### ขั้นที่ 1 — สร้าง Backend บน Google Apps Script

1. เข้า <https://script.google.com> ด้วยบัญชี Google ที่จะใช้เก็บไฟล์ แล้วกด **New project**
2. ตั้งชื่อโปรเจกต์ เช่น `DocControl API`
3. ลบโค้ดเดิมใน `Code.gs` แล้ว **วางโค้ดจากไฟล์ [`backend/Code.gs`](backend/Code.gs)** จากนั้นกด Save
4. (แนะนำ) ไปที่ ⚙️ **Project Settings** → ติ๊ก *Show "appsscript.json" manifest file* → เปิด `appsscript.json` แล้ววางเนื้อหาจาก [`backend/appsscript.json`](backend/appsscript.json) (ตั้งเขตเวลาเป็นไทย)
5. เลือกฟังก์ชัน **`setup`** ที่แถบด้านบน แล้วกด **Run**
   - ครั้งแรก Google จะขอสิทธิ์ → *Review permissions* → เลือกบัญชี → *Advanced* → *Go to DocControl API (unsafe)* → *Allow*
   - (ขึ้นคำว่า unsafe เพราะเป็นสคริปต์ที่เราเขียนเอง ยังไม่ได้ผ่านการรับรองจาก Google)
   - เมื่อเสร็จ ระบบจะสร้างโฟลเดอร์ `DocControl` ใน Google Drive พร้อม Spreadsheet ฐานข้อมูล
6. กด **Deploy → New deployment**
   - ⚙️ Select type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - กด **Deploy** แล้ว **คัดลอก Web app URL** (ลงท้ายด้วย `/exec`)

> ทุกครั้งที่แก้โค้ดใน Apps Script ต้อง **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** จึงจะมีผล (URL เดิม)

### ขั้นที่ 2 — ตั้งค่า Frontend

เปิดไฟล์ `assets/js/config.js` แล้วใส่ URL ที่คัดลอกมา

```js
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/xxxxxxxxxxxx/exec',
  ...
};
```

### ขั้นที่ 3 — เปิดเว็บออนไลน์ด้วย GitHub Pages (ฟรี)

1. Commit และ push ไปที่ GitHub
2. ไปที่ Repository → **Settings → Pages**
3. Source: **Deploy from a branch** → เลือก branch และโฟลเดอร์ `/ (root)` → Save
4. รอประมาณ 1 นาที จะได้ลิงก์ เช่น `https://<username>.github.io/ManageFileSystem/`
   - หน้าจัดการ (ของคุณ): `.../index.html`
   - หน้าส่งเอกสาร (ส่งให้ผู้อื่น): `.../submit.html` (คัดลอกได้จากเมนู "คัดลอกลิงก์หน้าส่งไฟล์")

> GitHub Pages ฟรีใช้ได้กับ repository แบบ **Public** ถ้าต้องการ Private สามารถใช้ **Cloudflare Pages** หรือ **Netlify** (ฟรี) แทนได้ โดยอัปโหลดโฟลเดอร์นี้ทั้งโฟลเดอร์
> ข้อมูลและไฟล์จริงจะอยู่ใน Google Drive ของคุณเท่านั้น ไม่ได้อยู่ใน GitHub

### ขั้นที่ 4 — เปลี่ยนรหัสผ่าน

เข้าสู่ระบบด้วย `admin1234` แล้วไปที่เมนู **เปลี่ยนรหัสผ่าน** ทันที
ถ้าลืมรหัสผ่าน ให้เข้า Apps Script แล้ว Run ฟังก์ชัน `resetPassword` ระบบจะรีเซ็ตกลับเป็น `admin1234`

---

## โครงสร้างไฟล์ใน Google Drive

```
DocControl/
├── DocControl Database        ← Google Sheets (Documents / Submissions / Logs)
├── 01 รอตรวจสอบ (Pending)     ← ไฟล์ที่ผู้อื่นส่งมา รอคุณตรวจ
├── 02 เอกสารใช้งาน (Active)
│   ├── PD/ QC/ QA/ MT/ RD/ HR/ ST/
└── 03 Rev เก่า (Obsolete)
    └── PD/ QC/ ...
```

ไฟล์จะถูกตั้งชื่อใหม่ให้อัตโนมัติเป็น `รหัส Rev.xx ชื่อเอกสาร.pdf` และย้ายโฟลเดอร์ตามสถานะ เปิดดูใน Google Drive ได้โดยตรงด้วย

## โครงสร้างโปรเจกต์

```
index.html            หน้าจัดการ (Login, Dashboard, เอกสาร, รอตรวจสอบ)
submit.html           หน้าส่งเอกสาร/ติดตามสถานะ สำหรับผู้อื่น
assets/css/app.css    สไตล์เพิ่มเติม (โทนสีสบายตา)
assets/js/config.js   ตั้งค่า API_URL
assets/js/common.js   ค่าคงที่ (ประเภท/แผนก) และฟังก์ชันที่ใช้ร่วมกัน
assets/js/api.js      เชื่อม Backend + โหมดทดลอง
assets/js/app.js      ตรรกะหน้าจัดการ
assets/js/submit.js   ตรรกะหน้าส่งเอกสาร
backend/Code.gs       โค้ด Google Apps Script
```

**ต้องการเพิ่มแผนก/ประเภทเอกสาร:** แก้ `DEPTS` / `DOC_TYPES` ใน `assets/js/common.js` และใน `backend/Code.gs` ให้ตรงกัน

## ข้อจำกัดที่ควรรู้

- ขนาดไฟล์สูงสุดต่อไฟล์ **25 MB** (ข้อจำกัดของ Apps Script)
- พื้นที่รวม **15 GB** ตามบัญชี Google ฟรี (ใช้ร่วมกับ Gmail/Photos) — ถ้าต้องการเพิ่มสามารถซื้อ Google One ได้ภายหลังโดยไม่ต้องแก้ระบบ
- ปุ่ม "เปิดดู" จะเปิดไฟล์ผ่าน Google Drive ต้อง Login บัญชี Google เดียวกับที่ติดตั้งระบบไว้ใน Browser (ปุ่ม "ดาวน์โหลด" ใช้ได้เสมอ)
- ปุ่ม "สร้างลิงก์ส่งต่อ" จะเปิดสิทธิ์ให้ทุกคนที่มีลิงก์ดูไฟล์นั้นได้ (แก้ไขไม่ได้)
