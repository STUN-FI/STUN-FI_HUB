require('dotenv').config();
const nodemailer = require('nodemailer');

const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;

if (!emailUser || !emailPass) {
  console.error('EMAIL_USER or EMAIL_PASS not set in environment');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: emailUser, pass: emailPass }
});

transporter.verify((err, success) => {
  if (err) {
    console.error('SMTP verify failed:', err && err.message ? err.message : err);
    process.exit(2);
  }
  console.log('SMTP verified successfully');
  process.exit(0);
});
