require('dotenv').config();
const nodemailer = require('nodemailer');

const emailProvider = (process.env.EMAIL_PROVIDER || 'gmail').toLowerCase();
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const resendApiKey = process.env.RESEND_API_KEY;

if (emailProvider === 'resend' && !resendApiKey) {
  console.error('RESEND_API_KEY not set in environment');
  process.exit(1);
}

if (emailProvider !== 'resend' && (!emailUser || !emailPass)) {
  console.error('EMAIL_USER or EMAIL_PASS not set in environment');
  process.exit(1);
}

const transporter = nodemailer.createTransport(
  emailProvider === 'resend'
    ? {
        host: 'smtp.resend.com',
        port: 587,
        secure: false,
        auth: { user: 'resend', pass: resendApiKey },
        tls: { rejectUnauthorized: false }
      }
    : {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        family: 4,
        auth: { user: emailUser, pass: emailPass },
        tls: { rejectUnauthorized: false }
      }
);

transporter.verify((err, success) => {
  if (err) {
    console.error('SMTP verify failed:', err && err.message ? err.message : err);
    process.exit(2);
  }
  console.log('SMTP verified successfully');
  process.exit(0);
});
