/** สร้างไฟล์ CSS ล่วงหน้า: npm install แล้ว npm run build:css (ต้องรันใหม่เมื่อแก้ class ใน HTML/JS) */
module.exports = {
  content: ['./index.html', './submit.html', './assets/js/**/*.js'],
  theme: { extend: {} },
};
