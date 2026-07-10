require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stunfi_saas';

async function run() {
  await mongoose.connect(MONGO_URI);
  const studentSchema = new mongoose.Schema({}, { strict: false });
  const Student = mongoose.model('Student', studentSchema, 'students');
  const students = await Student.find({ email: { $exists: true, $ne: '' } }).limit(10).lean();
  if (!students || students.length === 0) {
    console.log('No students with email found');
    process.exit(0);
  }
  students.forEach((s, i) => {
    console.log(`${i+1}. ${s.name || '<no name>'} — ${s.email} — id:${s.studentId || s._id}`);
  });
  process.exit(0);
}

run().catch(err => { console.error('Error:', err && err.message ? err.message : err); process.exit(2); });
