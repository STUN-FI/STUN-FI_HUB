require("dotenv").config();

const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const registerAdminRoutes = require("./admin-routes");
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "stunfi_secret_key";
const MONGO_URI = (process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || "mongodb://127.0.0.1:27017/stunfi_saas").trim();

if (/\s/.test(MONGO_URI)) {
  console.warn("WARNING: MONGO_URI contains whitespace. Remove spaces from the Render env var.");
}

app.use(express.static(path.join(__dirname, "../SaaS")));

// Log environment status for debugging
if (process.env.NODE_ENV === 'production') {
  console.log("[PRODUCTION] Environment Variables Status:");
  console.log("  JWT_SECRET:", process.env.JWT_SECRET ? "SET" : "NOT SET (using default)");
  console.log("  MONGO_URI:", process.env.MONGO_URI ? "SET" : "NOT SET");
  console.log("  MONGODB_URI:", process.env.MONGODB_URI ? "SET" : "NOT SET");
  console.log("  EMAIL_USER:", process.env.EMAIL_USER ? "SET" : "NOT SET");
  console.log("  EMAIL_PASS:", process.env.EMAIL_PASS ? "SET" : "NOT SET");
  console.log("  GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "SET" : "NOT SET");
}

const emailUser = process.env.EMAIL_USER || "stunfihub@gmail.com";
const emailPass = process.env.EMAIL_PASS || "fxsjcbfkndfypxhf";
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: emailUser,
    pass: emailPass
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000
});

if (!emailUser || !emailPass) {
  console.warn("EMAIL_USER or EMAIL_PASS is not configured. Forgot password email delivery will fail.");
}

const geminiApiKey = process.env.GEMINI_API_KEY || "AIzaSyBW_begbhYKhDyHFl8k111Uhhp9JZY_mFE";
const genAI = new GoogleGenerativeAI({ apiKey: geminiApiKey });

if (!geminiApiKey) {
  console.warn("GEMINI_API_KEY is not configured. AI report comment generation will be disabled.");
}

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Helper to determine the public base URL for links in emails.
// Prefers explicit `BASE_URL` env var (set in production), falls back to request host for local testing.
function getBaseUrl(req) {
  if (process.env.BASE_URL && process.env.BASE_URL.trim()) return process.env.BASE_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

// Lightweight Google OAuth endpoints so frontend "Continue with Google" buttons work.
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to fully complete the flow.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).send('Google OAuth not configured (GOOGLE_CLIENT_ID missing).');
  }

  const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
  const scope = encodeURIComponent('openid email profile');
  const state = encodeURIComponent(req.query.redirect || '/');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=online&state=${state}`;
  return res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state || '/';

  if (!code) return res.status(400).send('Missing code parameter');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    // Informative response — developer can configure env to complete the flow
    return res.status(501).send('Google OAuth callback received but server is not configured with client credentials (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).');
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${req.protocol}://${req.get('host')}/auth/google/callback`,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Google token exchange error', tokenData);
      return res.status(502).json({ message: 'Token exchange failed', details: tokenData });
    }

    // For now, simply redirect back to the frontend with the id_token as a query param (developer can swap for a real session)
    const idToken = tokenData.id_token;
    const redirectTo = state || '/';
    const separator = redirectTo.includes('?') ? '&' : '?';
    return res.redirect(`${redirectTo}${separator}google_id_token=${encodeURIComponent(idToken || '')}`);
  } catch (err) {
    console.error('Google callback error', err);
    return res.status(500).send('Internal server error during Google callback');
  }
});

// Use the MONGO_URI variable defined above (not a separate dbURI)
const maskedMongoUri = MONGO_URI
  ? MONGO_URI.replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/, '$1<user>:<pass>@')
  : 'NOT SET';
console.log('Connecting to MongoDB URI:', maskedMongoUri);

mongoose.connect(MONGO_URI, {
  connectTimeoutMS: 30000,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000
})
  .then(async () => {
    console.log("Database connected successfully!");
    await seedAdmin();
  })
  .catch((err) => {
    console.error("Database connection error:", err);
  });

/* =========================
   HELPERS
========================= */

const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

function normalizeEmail(value = "") {
  return value.trim().toLowerCase();
}

function validatePassword(password = "") {
  if (password.length < 8) {
    return "Password must be at least 8 characters long";
  }

  if (!/[A-Za-z]/.test(password)) {
    return "Password must contain at least one letter";
  }

  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }

  return null;
}

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function passwordMatches(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Invalid token format" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function getGrade(score) {
  if (score >= 80) return "A1";
  if (score >= 70) return "B2";
  if (score >= 60) return "B3";
  if (score >= 50) return "C4";
  if (score >= 45) return "C5";
  if (score >= 40) return "C6";
  if (score >= 35) return "D7";
  if (score >= 30) return "E8";
  return "F9";
}

function computeTotalFromComponents(components = []) {
  return components.reduce((sum, item) => sum + Number(item.score || 0), 0);
}

function getNextClass(currentClass) {
  const map = {
    JSS1: "JSS2",
    JSS2: "JSS3",
    JSS3: "SS1",
    SS1: "SS2",
    SS2: "SS3"
  };
  return map[currentClass] || null;
}

function getOverallGrade(average = 0) {
  return getGrade(Math.round(average));
}

function getDefaultPromotionSettings(session) {
  return {
    schoolId: "",
    session: session || "",
    promoteAverage: 50,
    repeatAverage: 40,
    withdrawAverage: 30,
    ss3GraduationAverage: 50,
    notPromotedAverage: 50,
    allowAutoSuggestions: true,
    autoSuggestionNote: "Auto-suggestions are generated from finalized session results.",
    createdBy: "system",
    updatedBy: "system"
  };
}

async function generateStudentResultSummary(studentId, schoolId, session, term) {
  const scores = await Score.find({ studentId, schoolId, session, term });
  const total = scores.reduce((sum, item) => sum + item.total, 0);
  const average = scores.length ? total / scores.length : 0;
  const grade = getOverallGrade(average);
  return { total, average, grade, subjectCount: scores.length };
}

function extractGenAIText(response) {
  if (!response || !Array.isArray(response.output)) {
    return "";
  }

  for (const outputItem of response.output) {
    if (!outputItem || !Array.isArray(outputItem.content)) continue;

    for (const contentItem of outputItem.content) {
      if (typeof contentItem === "string" && contentItem.trim()) {
        return contentItem.trim();
      }
      if (contentItem && typeof contentItem.text === "string" && contentItem.text.trim()) {
        return contentItem.text.trim();
      }
    }
  }

  return "";
}

function buildAIPromptForStudentReport({ student, scores, session, term }) {
  const studentName = student.name || student.fullName || "Student";
  const className = student.className || "Unknown class";
  const studentId = student.studentId || student._id?.toString() || "Unknown ID";
  const validScores = Array.isArray(scores) ? scores : [];

  const subjectLines = validScores.length
    ? validScores.map((score) => {
        const grade = score.grade || getOverallGrade(Number(score.total || 0));
        const status = score.status || "Status not provided";
        return `- ${score.subject || "Unknown subject"}: ${score.total || 0} (${grade}) — ${status}`;
      }).join("\n")
    : "- No submitted scores available.";

  const average = validScores.length
    ? (validScores.reduce((sum, item) => sum + Number(item.total || 0), 0) / validScores.length).toFixed(2)
    : "N/A";
  const grade = validScores.length ? getOverallGrade(Number(average)) : "N/A";

  return `You are an experienced academic teacher writing a concise progress comment for a school report. Use the details below to write one short, positive, and honest teacher comment. Mention strengths and one area for improvement. Do not include a title or heading.

Student name: ${studentName}
Student ID: ${studentId}
Class: ${className}
Session: ${session}
Term: ${term}

Subjects:
${subjectLines}

Overall average: ${average}
Overall grade: ${grade}

Create a single report comment suitable for a teacher's remark box.`;
}

async function getPromotionSuggestionForStudent(student, resultDoc, settings) {
  const average = Number(resultDoc?.average ?? 0);
  const className = student.className || "";
  let promotionStatus = "repeat";
  let nextClass = null;

  if (className === "SS3") {
    if (average >= settings.ss3GraduationAverage) {
      promotionStatus = "graduated";
      nextClass = null;
    } else if (average >= settings.repeatAverage) {
      promotionStatus = "repeat";
      nextClass = className;
    } else {
      promotionStatus = "withdrawn";
      nextClass = null;
    }
  } else {
    if (average >= settings.promoteAverage) {
      promotionStatus = "promoted";
      nextClass = getNextClass(className);
    } else if (average >= settings.repeatAverage) {
      promotionStatus = "repeat";
      nextClass = className;
    } else {
      promotionStatus = "withdrawn";
      nextClass = null;
    }
  }

  return {
    suggestedPromotionStatus: promotionStatus,
    suggestedNextClass: nextClass
  };
}

async function generatePromotionSuggestions(schoolId, session, term, className) {
  const query = { schoolId };
  if (className) query.className = className;

  const students = await Student.find(query).sort({ name: 1 });
  const settingsDoc = await PromotionSetting.findOne({ schoolId, session });
  const settings = settingsDoc ? settingsDoc.toObject() : getDefaultPromotionSettings(session);

  const suggestions = [];

  for (const student of students) {
    const result = await Result.findOne({ studentId: student.studentId, schoolId, session, term });
    const hasFinalizedResult = !!result && result.isFinalized;
    const suggestion = await getPromotionSuggestionForStudent(student, result, settings);

    suggestions.push({
      studentId: student.studentId,
      name: student.name,
      regNumber: student.regNumber,
      className: student.className,
      session,
      term,
      average: result?.average ?? null,
      position: result?.position ?? null,
      promotionStatus: result?.promotionStatus || "pending",
      nextClass: result?.nextClass || null,
      resultFinalized: hasFinalizedResult,
      suggestedPromotionStatus: suggestion.suggestedPromotionStatus,
      suggestedNextClass: suggestion.suggestedNextClass
    });
  }

  return { suggestions, settings };
}

async function generatePromotionHistoryEntry({
  studentId,
  schoolId,
  session,
  term,
  previousStatus,
  previousNextClass,
  newStatus,
  newNextClass,
  changedBy,
  changeType = "manual",
  reason = "Promotion decision updated"
}) {
  return await PromotionHistory.create({
    studentId,
    schoolId,
    session,
    term,
    previousStatus,
    previousNextClass,
    newStatus,
    newNextClass,
    changedBy: changedBy || "system",
    changeType,
    reason
  });
}

async function generateStudentResultDocument(studentId, schoolId, session, term) {
  const summary = await generateStudentResultSummary(studentId, schoolId, session, term);
  if (!summary || summary.subjectCount === 0) {
    return null;
  }

  const existing = await Result.findOne({ studentId, schoolId, session, term });

  const resultDoc = await Result.findOneAndUpdate(
    { studentId, schoolId, session, term },
    {
      studentId,
      schoolId,
      session,
      term,
      average: summary.average,
      grade: summary.grade,
      promotionStatus: existing?.promotionStatus || "pending",
      nextClass: existing?.nextClass || null,
      isFinalized: true,
      finalizedAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return resultDoc;
}

async function generateStudentPromotionHistory(session, schoolId) {
  return await PromotionHistory.find({ schoolId, session }).sort({ changedAt: -1 });
}

async function getAcademicSessionOrFail(schoolId, session) {
  return await AcademicSession.findOne({ schoolId, session });
}

async function ensureSessionFinalizedResult(studentId, schoolId, session, term) {
  const result = await Result.findOne({ studentId, schoolId, session, term });
  return result && result.isFinalized;
}

async function applyPromotionDecisionToResult(studentId, schoolId, session, term, promotionStatus, nextClass) {
  return await Result.findOneAndUpdate(
    { studentId, schoolId, session, term },
    {
      promotionStatus,
      nextClass: nextClass || null,
      isFinalized: true,
      finalizedAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function applyPromotionDecisionToStudent(studentId, promotionStatus, nextClass) {
  if (promotionStatus === "promoted" && nextClass) {
    await Student.updateOne({ studentId }, { $set: { className: nextClass } });
  } else if (promotionStatus === "graduated") {
    await Student.updateOne({ studentId }, { $set: { status: "graduated", isActivated: false, graduatedAt: new Date() } });
  } else if (promotionStatus === "withdrawn") {
    await Student.updateOne({ studentId }, { $set: { status: "withdrawn", isActivated: false, withdrawnAt: new Date() } });
  }
  return;
}

async function generateStudentPromotionRecord(studentId, schoolId, session, term, promotionStatus, nextClass, processedBy) {
  const promotion = await StudentPromotion.findOneAndUpdate(
    { studentId, schoolId, session },
    {
      promotionStatus,
      nextClass: nextClass || null,
      processedAt: new Date(),
      processedBy: processedBy || "system"
    },
    { upsert: true, new: true }
  );

  return promotion;
}

async function requireFinalResult(studentId, schoolId, session, term) {
  const result = await Result.findOne({ studentId, schoolId, session, term });
  return result && result.isFinalized;
}

async function getPromotionSettings(schoolId, session) {
  const existing = await PromotionSetting.findOne({ schoolId, session });
  if (existing) return existing;
  const defaults = getDefaultPromotionSettings(session);
  return new PromotionSetting(defaults);
}

async function generateStudentId() {
  try {
    // Find the highest existing studentId to avoid duplicates on deletion
    const lastStudent = await Student.findOne({ studentId: { $exists: true } })
      .sort({ studentId: -1 })
      .select('studentId');
    
    let nextNum = 1;
    if (lastStudent && lastStudent.studentId) {
      const match = lastStudent.studentId.match(/\d+/);
      if (match) {
        nextNum = parseInt(match[0]) + 1;
      }
    }
    
    return "STD" + String(nextNum).padStart(4, "0");
  } catch (error) {
    console.error("Error in generateStudentId:", error.message);
    // Fallback to count if parsing fails
    const count = await Student.countDocuments();
    return "STD" + String(count + 1).padStart(4, "0");
  }
}

async function generateTeacherId() {
  try {
    const lastTeacher = await Teacher.findOne({ teacherId: { $exists: true } })
      .sort({ teacherId: -1 })
      .select('teacherId');
    
    let nextNum = 1;
    if (lastTeacher && lastTeacher.teacherId) {
      const match = lastTeacher.teacherId.match(/\d+/);
      if (match) {
        nextNum = parseInt(match[0]) + 1;
      }
    }
    
    return "TCH" + String(nextNum).padStart(4, "0");
  } catch (error) {
    console.error("Error in generateTeacherId:", error.message);
    const count = await Teacher.countDocuments();
    return "TCH" + String(count + 1).padStart(4, "0");
  }
}

async function generatePostId() {
  try {
    const lastPost = await Post.findOne({ postId: { $exists: true } })
      .sort({ postId: -1 })
      .select('postId');
    
    let nextNum = 1;
    if (lastPost && lastPost.postId) {
      const match = lastPost.postId.match(/\d+/);
      if (match) {
        nextNum = parseInt(match[0]) + 1;
      }
    }
    
    return "POST" + String(nextNum).padStart(4, "0");
  } catch (error) {
    console.error("Error in generatePostId:", error.message);
    const count = await Post.countDocuments();
    return "POST" + String(count + 1).padStart(4, "0");
  }
}

async function generateSchoolId() {
  try {
    const lastSchool = await School.findOne({
      $or: [
        { id: { $regex: /^SCH\d{4}$/ } },
        { schoolId: { $exists: true } }
      ]
    })
      .sort({ id: -1, schoolId: -1 })
      .select('id schoolId');

    const currentId = (lastSchool && (lastSchool.id || lastSchool.schoolId)) || "";
    let nextNum = 1;

    if (currentId) {
      const match = currentId.match(/\d+/);
      if (match) {
        nextNum = parseInt(match[0]) + 1;
      }
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = "SCH" + String(nextNum).padStart(4, "0");
      const exists = await School.exists({ id: candidate });
      if (!exists) {
        return candidate;
      }
      nextNum += 1;
    }

    // Fallback in case the sequential generation failed due to unexpected duplicates.
    const count = await School.countDocuments();
    return "SCH" + String(count + 1).padStart(4, "0");
  } catch (error) {
    console.error("Error in generateSchoolId:", error.message);
    const count = await School.countDocuments();
    return "SCH" + String(count + 1).padStart(4, "0");
  }
}

/* =========================
   SCHEMAS
========================= */

/* =========================
   SCHEMAS
========================= */

const schoolSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, required: true },
    name: { type: String, required: true },

    email: { type: String, unique: true, required: true },
    phone: { type: String, default: "" },
    password: { type: String, required: true },

    resetToken: String,
    resetTokenExpiry: Date,

    motto: { type: String, default: "" },
    logo: { type: String, default: "" },
    accentColor: { type: String, default: "#66cccc" },

    accountStatus: {
      type: String,
      enum: ["active", "pending", "suspended"],
      default: "active"
    },

    registeredBy: {
      type: String,
      enum: ["self", "super_admin"],
      default: "self"
    }

  },
  { timestamps: true }
);

const studentSchema = new mongoose.Schema(
  {
    studentId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    regNumber: { type: String, required: true },
    schoolId: { type: String, required: true },

    className: { type: String, default: "" },
    arm: { type: String, default: "" },

    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    gender: { type: String, default: "" },
    dob: { type: String, default: "" },
    homeTown: { type: String, default: "" },
    contactAddress: { type: String, default: "" },
    password: { type: String, default: "" },

    resetToken: String,
    resetTokenExpiry: Date,

    
    isActivated: { type: Boolean, default: false },

    // Lifecycle/status fields for promotion processing
    status: {
      type: String,
      enum: ["active", "graduated", "withdrawn"],
      default: "active"
    },
    graduatedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null }
  },
  { timestamps: true }
);

studentSchema.index({ regNumber: 1, schoolId: 1 }, { unique: true });
studentSchema.index({ studentId: 1, schoolId: 1 }, { unique: true });

const subjectEnrollmentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    schoolId: { type: String, required: true },
    subject: { type: String, required: true },
    className: { type: String, required: true },
    arm: { type: String, default: "" },
    session: { type: String, default: "2025/2026" },
    term: { type: String, default: "1st Term" }
  },
  { timestamps: true }
);

subjectEnrollmentSchema.index(
  { studentId: 1, schoolId: 1, subject: 1, session: 1, term: 1 },
  { unique: true }
);

const teacherSchema = new mongoose.Schema(
  {
    teacherId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    schoolId: { type: String, required: true },

    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    password: { type: String, default: "" },

    // Old fields kept for backward compatibility
    subject: { type: String, default: "" },
    className: { type: String, default: "" },
    arm: { type: String, default: "" },

    // New system: one teacher can handle many classes/subjects
    assignments: {
      type: [
        {
          subject: { type: String, required: true },
          className: { type: String, required: true },
          arm: { type: String, default: "" }
        }
      ],
      default: []
    },

    resetToken: String,
    resetTokenExpiry: Date,

    isActivated: { type: Boolean, default: false }
  },
  { timestamps: true }
);

teacherSchema.index(
  { schoolId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string", $ne: "" } } }
);

teacherSchema.index(
  { schoolId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string", $ne: "" } } }
);

const scoreSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    schoolId: { type: String, required: true },
    teacherId: { type: String, default: "" },

    subject: { type: String, required: true },
    session: { type: String, default: "2025/2026" },
    term: { type: String, default: "1st Term" },

    components: {
      type: Array,
      default: []
    },

    total: { type: Number, default: 0 },
    grade: { type: String, default: "F9" },

    isUnlocked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

scoreSchema.index(
  { studentId: 1, subject: 1, session: 1, term: 1 },
  { unique: true }
);

const submittedScoreSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    schoolId: { type: String, required: true },
    teacherId: { type: String, required: true },

    subject: { type: String, required: true },
    className: { type: String, default: "" },
    arm: { type: String, default: "" },

    session: { type: String, default: "2025/2026" },
    term: { type: String, default: "1st Term" },

    components: {
      type: Array,
      default: []
    },

    total: { type: Number, default: 0 },
    grade: { type: String, default: "F9" },

    status: {
      type: String,
      enum: ["draft", "submitted", "assigned"],
      default: "draft"
    }
  },
  { timestamps: true }
);

submittedScoreSchema.index(
  { studentId: 1, teacherId: 1, subject: 1, session: 1, term: 1 },
  { unique: true }
);

const postSchema = new mongoose.Schema(
  {
    postId: { type: String, unique: true, required: true },
    schoolId: { type: String, required: true },

    audience: {
      type: String,
      enum: ["students", "teachers", "both"],
      required: true
    },

    authorType: {
      type: String,
      enum: ["school"],
      default: "school"
    },

    authorId: { type: String, required: true },

    text: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },
    mediaType: {
      type: String,
      enum: ["", "image", "video", "file"],
      default: ""
    },
    fileName: { type: String, default: "" }
  },
  { timestamps: true }
);

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    name: { type: String, required: true }
  },
  { timestamps: true }
);

const resultAccessSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    schoolId: { type: String, required: true },
    session: { type: String, default: "2025/2026" },
    term: { type: String, default: "1st Term" },

    resultReady: { type: Boolean, default: false },
    isUnlocked: { type: Boolean, default: true }
  },
  { timestamps: true }
);

resultAccessSchema.index(
  { studentId: 1, schoolId: 1, session: 1, term: 1 },
  { unique: true }
);

const academicSessionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true },
    session: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, default: "" }
  },
  { timestamps: true }
);

academicSessionSchema.index({ schoolId: 1, session: 1 }, { unique: true });
academicSessionSchema.index({ schoolId: 1, isActive: 1 });

const studentPromotionSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    schoolId: { type: String, required: true },
    session: { type: String, required: true },
    term: { type: String, default: "3rd Term" },
    
    average: { type: Number, default: 0 },
    position: { type: String, default: "" },
    
    promotionStatus: {
      type: String,
      enum: ["promoted", "repeat", "graduated", "withdrawn"],
      default: "promoted"
    },
    
    nextClass: {
      type: String,
      enum: ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3", null],
      default: null
    },
    
    processedAt: { type: Date, default: null },
    processedBy: { type: String, default: "" }
  },
  { timestamps: true }
);

studentPromotionSchema.index({ studentId: 1, schoolId: 1, session: 1 }, { unique: true });
studentPromotionSchema.index({ schoolId: 1, session: 1 });

const promotionSettingSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true },
    session: { type: String, required: true },
    promoteAverage: { type: Number, default: 50 },
    repeatAverage: { type: Number, default: 40 },
    withdrawAverage: { type: Number, default: 30 },
    ss3GraduationAverage: { type: Number, default: 50 },
    notPromotedAverage: { type: Number, default: 50 },
    allowAutoSuggestions: { type: Boolean, default: true },
    createdBy: { type: String, default: "system" },
    updatedBy: { type: String, default: "system" }
  },
  { timestamps: true }
);

promotionSettingSchema.index({ schoolId: 1, session: 1 }, { unique: true });

const promotionHistorySchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    schoolId: { type: String, required: true },
    session: { type: String, required: true },
    term: { type: String, default: "3rd Term" },
    previousStatus: { type: String, default: "pending" },
    previousNextClass: { type: String, default: null },
    newStatus: { type: String, default: "pending" },
    newNextClass: { type: String, default: null },
    changedBy: { type: String, default: "system" },
    changeType: {
      type: String,
      enum: ["manual", "auto", "system"],
      default: "manual"
    },
    reason: { type: String, default: "Promotion decision updated" }
  },
  { timestamps: true }
);

promotionHistorySchema.index({ studentId: 1, schoolId: 1, session: 1 });

const resultSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    schoolId: { type: String, required: true },
    session: { type: String, default: "2025/2026" },
    term: { type: String, default: "3rd Term" },
    
    average: { type: Number, default: 0 },
    position: { type: String, default: "" },
    grade: { type: String, default: "" },
    
    promotionStatus: {
      type: String,
      enum: ["promoted", "repeat", "graduated", "withdrawn", "pending"],
      default: "pending"
    },
    
    nextClass: {
      type: String,
      enum: ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3", null],
      default: null
    },
    
    isFinalized: { type: Boolean, default: false },
    finalizedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

resultSchema.index({ studentId: 1, schoolId: 1, session: 1, term: 1 }, { unique: true });
resultSchema.index({ schoolId: 1, session: 1, term: 1 });

const subscriptionSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true },
    planName: { type: String, required: true }, // e.g., "Small School", "Medium School", "Large School", "Enterprise", "trial"
    status: {
      type: String,
      enum: ["trial", "active", "expired", "cancelled"],
      default: "trial"
    },
    studentLimit: { type: Number, required: true }, // max students allowed
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true }, // expiry date
    amountPaid: { type: Number, default: 0 },
    renewalDate: { type: Date, default: null }, // last renewal date
    autoRenew: { type: Boolean, default: false }
  },
  { timestamps: true }
);

subscriptionSchema.index({ status: 1, endDate: 1 });

const timetableSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true },
    className: { type: String, required: true },
    arm: { type: String, default: "" },
    day: {
      type: String,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      required: true
    },
    subject: { type: String, required: true },
    teacherId: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    session: { type: String, default: "2025/2026" },
    term: { type: String, default: "1st Term" }
  },
  { timestamps: true }
);

timetableSchema.index({ schoolId: 1, teacherId: 1, className: 1, session: 1, term: 1 });

timetableSchema.index({ schoolId: 1, className: 1, arm: 1, session: 1, term: 1 });

/* =========================
   MODELS
========================= */

const School = mongoose.model("School", schoolSchema);
const Student = mongoose.model("Student", studentSchema);
const SubjectEnrollment = mongoose.model("SubjectEnrollment", subjectEnrollmentSchema);
const Teacher = mongoose.model("Teacher", teacherSchema);
const Score = mongoose.model("Score", scoreSchema);
const SubmittedScore = mongoose.model("SubmittedScore", submittedScoreSchema);
const Post = mongoose.model("Post", postSchema);
const Admin = mongoose.model("Admin", adminSchema);
const ResultAccess = mongoose.model("ResultAccess", resultAccessSchema);
const AcademicSession = mongoose.model("AcademicSession", academicSessionSchema);
const StudentPromotion = mongoose.model("StudentPromotion", studentPromotionSchema);
const PromotionSetting = mongoose.model("PromotionSetting", promotionSettingSchema);
const PromotionHistory = mongoose.model("PromotionHistory", promotionHistorySchema);
const Result = mongoose.model("Result", resultSchema);
const Subscription = mongoose.model("Subscription", subscriptionSchema);
const Timetable = mongoose.model("Timetable", timetableSchema);

/* =========================
   REGISTER ADMIN ROUTES
========================= */

registerAdminRoutes(app, { School, Student, Teacher, Result, Subscription, Post });
console.log("[server] Admin routes registered");

/* =========================
   SUBSCRIPTION HELPERS
========================= */

async function getSchoolSubscription(schoolId) {
  return await Subscription.findOne({ schoolId });
}

async function checkSubscriptionStatus(schoolId) {
  try {
    const subscription = await getSchoolSubscription(schoolId);
    
    if (!subscription) {
      return { status: "no-subscription", isActive: false };
    }
    
    const now = new Date();
    
    if (subscription.status === "cancelled") {
      return { status: "cancelled", isActive: false };
    }
    
    if (subscription.endDate < now) {
      // Auto-expire if not done
      subscription.status = "expired";
      await subscription.save();
      return { status: "expired", isActive: false, subscription };
    }
    
    return { status: subscription.status, isActive: true, subscription };
  } catch (error) {
    console.error("Error in checkSubscriptionStatus:", error.message);
    return { status: "error", isActive: false };
  }
}

async function checkStudentLimit(schoolId) {
  try {
    let subscription = await getSchoolSubscription(schoolId);
    
    if (!subscription) {
      subscription = await createTrialSubscription(schoolId);
      if (!subscription) {
        return { canAdd: false, message: "No subscription found and could not create trial" };
      }
    }
    
    const subscriptionCheck = await checkSubscriptionStatus(schoolId);
    if (!subscriptionCheck.isActive) {
      return { canAdd: false, message: "Subscription is not active" };
    }
    
    const studentCount = await Student.countDocuments({ schoolId });
    
    if (studentCount >= subscription.studentLimit) {
      return {
        canAdd: false,
        message: `Your subscription student limit (${subscription.studentLimit}) has been reached. Please upgrade your plan.`,
        currentCount: studentCount,
        limit: subscription.studentLimit
      };
    }
    
    return { 
      canAdd: true, 
      currentCount: studentCount, 
      limit: subscription.studentLimit 
    };
  } catch (error) {
    console.error("Error in checkStudentLimit:", error.message);
    return { canAdd: false, message: "Error checking student limit: " + error.message };
  }
}

async function isSubscriptionActive(schoolId) {
  const check = await checkSubscriptionStatus(schoolId);
  return check.isActive;
}

async function createTrialSubscription(schoolId) {
  try {
    const now = new Date();
    const endDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days trial

    const existing = await Subscription.findOne({ schoolId });
    if (existing) {
      // update to ensure all required fields are present
      existing.planName = existing.planName || "trial";
      existing.status = existing.status || "trial";
      existing.startDate = existing.startDate || now;
      existing.endDate = existing.endDate || endDate;
      existing.studentLimit = existing.studentLimit || 200;
      existing.amountPaid = existing.amountPaid || 0;
      existing.autoRenew = existing.autoRenew !== undefined ? existing.autoRenew : false;
      await existing.save();
      return existing;
    }

    const doc = await Subscription.create({
      schoolId,
      planName: "trial",
      status: "trial",
      studentLimit: 200,
      startDate: now,
      endDate,
      amountPaid: 0,
      autoRenew: false
    });

    return doc;
  } catch (error) {
    console.error("createTrialSubscription error:", error && error.message ? error.message : error);
    // do not throw to avoid breaking registration flow
    return null;
  }
}

/* =========================
   SEED ADMIN
========================= */

async function seedAdmin() {
  const existingAdmin = await Admin.findOne({ email: "admin@stunfi.com" });

  if (!existingAdmin) {
    await Admin.create({
      email: "admin@stunfi.com",
      password: await hashPassword("Admin123"),
      name: "STUN-FI Admin"
    });
    console.log("Default admin created");
  }
}

/* =========================
   AUTH ROUTES
========================= */

app.post("/admin-login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || "";

    if (!email || !password) {
      return res.status(400).json({ message: "Admin email and password are required" });
    }

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(401).json({ message: "Invalid admin credentials" });
    }

    const isMatch = await passwordMatches(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid admin credentials" });
    }

    const token = jwt.sign(
      { id: admin._id, role: "admin", email: admin.email },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Admin login successful",
      token,
      admin: {
        name: admin.name,
        email: admin.email
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || "";

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const school = await School.findOne({ email });

    if (!school) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!school.password) {
      console.error("School login failed: missing password hash", { email, schoolId: school.id, accountStatus: school.accountStatus });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await passwordMatches(password, school.password);

    if (!isMatch) {
      console.warn("School login failed: invalid password", { email, schoolId: school.id });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (school.accountStatus !== "active") {
      console.warn("School login attempt for inactive account", { email, schoolId: school.id, accountStatus: school.accountStatus });
      return res.status(403).json({
        message: `School account is ${school.accountStatus}`
      });
    }

    const token = jwt.sign(
      { schoolId: school.id, role: "school", email: school.email },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      school: {
        schoolId: school.id,
        name: school.name,
        email: school.email,
        phone: school.phone
      }
    });
  } catch (error) {
    console.error("School login error:", error.message || error, { email: req.body.email });
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/assign-subjects-to-student", async (req, res) => {
  try {
    const studentId = (req.body.studentId || "").trim();
    const schoolId = (req.body.schoolId || "").trim();
    const subjects = Array.isArray(req.body.subjects) ? req.body.subjects : [];
    const session = (req.body.session || "2025/2026").trim();
    const term = (req.body.term || "1st Term").trim();
    const className = (req.body.className || "").trim();
    const arm = (req.body.arm || "").trim();

    if (!studentId || !schoolId || !subjects.length) {
      return res.status(400).json({ message: "Student, school and subjects are required" });
    }

    const student = await Student.findOne({ studentId, schoolId });
    const fallbackClassName = student?.className || className || "";
    const fallbackArm = student?.arm || arm || "";

    const docs = subjects
      .map(subject => subject.trim())
      .filter(Boolean)
      .map(subject => ({
        studentId,
        schoolId,
        subject,
        className: fallbackClassName,
        arm: fallbackArm,
        session,
        term
      }));

    if (!docs.length) {
      return res.status(400).json({ message: "At least one valid subject is required" });
    }

    const result = await SubjectEnrollment.insertMany(docs, { ordered: false });

    res.json({
      message: "Subjects assigned successfully",
      insertedCount: result?.length || docs.length,
      subjects: docs,
      studentFound: !!student
    });
  } catch (error) {
    console.error("Error assigning subjects:", error);
    const duplicateKey = error?.code === 11000 || /duplicate key/i.test(error?.message || "");
    res.status(duplicateKey ? 409 : 500).json({
      message: duplicateKey ? "Some subjects were already assigned" : "Error assigning subjects",
      error: error?.message || "Unknown error"
    });
  }
});

function findTeacherForEnrollment(enrollment, teachers) {
  const subject = (enrollment.subject || "").trim().toLowerCase();
  const className = (enrollment.className || "").trim().toLowerCase();
  const arm = (enrollment.arm || "").trim().toLowerCase();

  for (const teacher of teachers) {
    const teacherName = teacher.name || "";
    const email = teacher.email || "";
    const phone = teacher.phone || "";

    if (Array.isArray(teacher.assignments) && teacher.assignments.length) {
      const match = teacher.assignments.find((assignment) => {
          const matchSubject = (assignment.subject || "").trim().toLowerCase() === subject;
          const matchClass = (assignment.className || "").trim().toLowerCase() === className;
          // Enforce strict arm matching: assignment.arm must exactly match enrollment.arm
          const matchArm = (assignment.arm || "").toString().trim().toLowerCase() === arm;
          return matchSubject && matchClass && matchArm;
      });
      if (match) {
        return { name: teacherName, email, phone };
      }
    }

      // Legacy single-assignment fields should also respect arm when present
      const legacySubject = (teacher.subject || "").trim().toLowerCase();
      const legacyClass = (teacher.className || "").trim().toLowerCase();
      const legacyArm = (teacher.arm || "").toString().trim().toLowerCase();
      if (legacySubject === subject && legacyClass === className) {
        if (!legacyArm || legacyArm === arm) {
          return { name: teacherName, email, phone };
        }
        // if legacyArm exists but doesn't match, do not return
      }
  }

  return null;
}

app.get("/student-subjects/:studentId", async (req, res) => {
  try {
    const studentId = (req.params.studentId || "").trim();
    const schoolId = (req.query.schoolId || "").trim();
    const session = req.query.session?.toString().trim();
    const term = req.query.term?.toString().trim();

    const query = {
      studentId,
      schoolId
    };
    if (session && session !== "all") query.session = session;
    if (term && term !== "all") query.term = term;

    const subjects = await SubjectEnrollment.find(query).sort({ subject: 1 });

    const teachers = await Teacher.find({ schoolId }).lean();

    const enrichedSubjects = subjects.map((subject) => ({
      _id: subject._id,
      studentId: subject.studentId,
      schoolId: subject.schoolId,
      subject: subject.subject,
      className: subject.className,
      arm: subject.arm,
      session: subject.session,
      term: subject.term,
      teacher: findTeacherForEnrollment(subject, teachers)
    }));

    res.json(enrichedSubjects);
  } catch (error) {
    console.error("Error loading student subjects:", error);
    res.status(500).json({ message: "Error loading student subjects" });
  }
});

app.post("/teacher-login", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();
    const contact = (req.body.contact || "").trim();
    const password = (req.body.password || "").trim();

    if (!schoolId || !contact || !password) {
      return res.status(400).json({ message: "School ID, email/phone and password are required" });
    }

    const teacher = await Teacher.findOne({
      schoolId,
      $or: [
        { email: normalizeEmail(contact) },
        { phone: contact }
      ]
    });

    if (!teacher) {
      return res.status(401).json({ message: "Invalid teacher login" });
    }

    const isMatch = await passwordMatches(password, teacher.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid teacher login" });
    }

    if (!teacher.isActivated) {
      return res.status(403).json({ message: "Teacher account not yet activated" });
    }

    const token = jwt.sign(
      { teacherId: teacher.teacherId, schoolId: teacher.schoolId, role: "teacher" },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Teacher login successful",
      token,
      teacher: {
        teacherId: teacher.teacherId,
        name: teacher.name,
        schoolId: teacher.schoolId,
        email: teacher.email,
        phone: teacher.phone,
        assignments: teacher.assignments
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/teacher-confirm-account", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();
    const contact = (req.body.contact || "").trim().toLowerCase();
    const password = (req.body.password || "").trim();

    if (!schoolId || !contact || !password) {
      return res.status(400).json({ message: "School ID, email/phone, and password are required" });
    }

    const teacher = await Teacher.findOne({
      schoolId,
      $or: [
        { email: contact },
        { phone: req.body.contact || "" }
      ]
    });

    if (!teacher) {
      return res.status(404).json({ message: "Teacher record not found under this school" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    teacher.password = await hashPassword(password);
    teacher.isActivated = true;
    await teacher.save();

    res.json({
      message: "Teacher account confirmed successfully",
      teacher: {
        teacherId: teacher.teacherId,
        name: teacher.name,
        schoolId: teacher.schoolId,
        subject: teacher.subject,
        className: teacher.className,
        arm: teacher.arm,
        email: teacher.email,
        phone: teacher.phone
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error confirming teacher account" });
  }
});

app.post("/student-login", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();
    const studentId = (req.body.studentId || "").trim();
    const password = (req.body.password || "").trim();

    if (!schoolId || !studentId || !password) {
      return res.status(400).json({ message: "School ID, student ID and password are required" });
    }

    const student = await Student.findOne({ schoolId, studentId });

    if (!student) {
      return res.status(401).json({ message: "Invalid student login" });
    }

    const isMatch = await passwordMatches(password, student.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid student login" });
    }

    if (!student.isActivated) {
      return res.status(403).json({ message: "Student account not yet activated" });
    }

    const token = jwt.sign(
      { studentId: student.studentId, schoolId: student.schoolId, role: "student" },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Student login successful",
      token,
      student: {
        studentId: student.studentId,
        name: student.name,
        schoolId: student.schoolId,
        className: student.className,
        arm: student.arm,
        regNumber: student.regNumber,
        email: student.email,
        phone: student.phone,
        gender: student.gender || "",
        dob: student.dob || "",
        homeTown: student.homeTown || "",
        contactAddress: student.contactAddress || ""
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/student-profile", verifyToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "student") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const studentId = req.user.studentId;
    const schoolId = req.user.schoolId;
    const student = await Student.findOne({ studentId, schoolId });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    student.email = normalizeEmail(req.body.email || "");
    student.phone = (req.body.phone || "").trim();
    student.gender = (req.body.gender || "").trim();
    student.dob = (req.body.dob || "").trim();
    student.homeTown = (req.body.homeTown || "").trim();
    student.contactAddress = (req.body.contactAddress || "").trim();

    await student.save();

    res.json({
      message: "Profile updated successfully",
      student: {
        studentId: student.studentId,
        name: student.name,
        schoolId: student.schoolId,
        className: student.className,
        arm: student.arm,
        regNumber: student.regNumber,
        email: student.email,
        phone: student.phone,
        gender: student.gender || "",
        dob: student.dob || "",
        homeTown: student.homeTown || "",
        contactAddress: student.contactAddress || ""
      }
    });
  } catch (error) {
    console.error("Error updating student profile:", error);
    res.status(500).json({ message: "Error saving profile" });
  }
});

app.post("/student-confirm-admission", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();
    const studentId = (req.body.studentId || "").trim();
    const email = normalizeEmail(req.body.email || "");
    const phone = (req.body.phone || "").trim();
    const password = (req.body.password || "").trim();

    if (!schoolId || !studentId || !password) {
      return res.status(400).json({ message: "School ID, student ID and password are required" });
    }

    if (!email && !phone) {
      return res.status(400).json({ message: "Provide email or phone number" });
    }

    const student = await Student.findOne({ schoolId, studentId });

    if (!student) {
      return res.status(404).json({ message: "Student record not found under this school" });
    }

    if (student.isActivated) {
      return res.status(409).json({ message: "Admission already confirmed. Please login or reset your password." });
    }

    if (email) student.email = email;
    if (phone) student.phone = phone;

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }
    student.password = await hashPassword(password);
    student.isActivated = true;

    await student.save();

    res.json({
      message: "Admission confirmed successfully",
      student: {
        studentId: student.studentId,
        name: student.name,
        schoolId: student.schoolId,
        className: student.className,
        arm: student.arm,
        email: student.email,
        phone: student.phone
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error confirming admission" });
  }
});

app.delete("/delete-student-subject", async (req, res) => {
  try {
    const studentId = (req.body.studentId || "").trim();
    const schoolId = (req.body.schoolId || "").trim();
    const subject = (req.body.subject || "").trim();
    const session = (req.body.session || "2025/2026").trim();
    const term = (req.body.term || "1st Term").trim();

    if (!studentId || !schoolId || !subject) {
      return res.status(400).json({ message: "Student, school and subject are required" });
    }

    await SubjectEnrollment.deleteOne({
      studentId,
      schoolId,
      subject,
      session,
      term
    });

    res.json({ message: "Subject removed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error removing subject" });
  }
});

app.post("/teacher-check-record", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();
    const contact = (req.body.contact || "").trim();

    if (!schoolId || !contact) {
      return res.status(400).json({ message: "School ID and email/phone are required" });
    }

    const teacher = await Teacher.findOne({
      schoolId,
      $or: [
        { email: normalizeEmail(contact) },
        { phone: contact }
      ]
    });

    if (!teacher) {
      return res.status(404).json({ message: "Teacher record not found" });
    }

    res.json({
      found: true,
      activated: teacher.isActivated,
      teacher: {
        teacherId: teacher.teacherId,
        name: teacher.name,
        subject: teacher.subject,
        className: teacher.className,
        arm: teacher.arm
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error checking teacher record" });
  }
});

app.post("/teacher-forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || "");

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const teacher = await Teacher.findOne({ email });

    if (!teacher) {
      return res.status(404).json({ message: "Teacher account not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    teacher.resetToken = token;
    teacher.resetTokenExpiry = Date.now() + 15 * 60 * 1000;
    await teacher.save();

    const baseUrl = getBaseUrl(req);
    const resetLink = `${baseUrl}/reset-password.html?token=${token}&type=teacher`;

    if (!emailUser || !emailPass) {
      console.error("Teacher password reset email blocked because SMTP credentials are missing.", { EMAIL_USER_SET: !!emailUser, EMAIL_PASS_SET: !!emailPass });
      return res.status(500).json({ message: "Email service is not configured on the server" });
    }

    await transporter.sendMail({
      from: `"STUN-FI HUB" <${emailUser}>`,
      to: email,
      subject: "Password Reset - STUN-FI HUB",
      html: `
        <div style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;padding:32px 18px;">
            <div style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:28px;color:#e5e7eb;">
              <h2 style="margin:0 0 10px;color:#ffffff;">Password Reset Request</h2>
              <p style="color:#94a3b8;line-height:1.6;">We received a request to reset your STUN-FI HUB account password.</p>
              <a href="${resetLink}"
                style="display:inline-block;margin:18px 0;padding:14px 22px;background:#66cccc;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:bold;">
                Reset Password
              </a>
              <p style="color:#94a3b8;line-height:1.6;">This link expires in 15 minutes. If you did not request this, you can ignore this email.</p>
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:22px 0;">
              <p style="margin:0;color:#64748b;font-size:13px;">STUN-FI HUB • Webbing hubs...</p>
            </div>
          </div>
        </div>
      `
    });

    res.json({ message: "Reset link sent to email" });
  } catch (error) {
    console.error("Teacher reset email failed:", error && error.message ? error.message : error);
    res.status(500).json({ message: "Error sending teacher reset email" });
  }
});

app.post("/student-check-record", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();
    const studentId = (req.body.studentId || "").trim();

    if (!schoolId || !studentId) {
      return res.status(400).json({ message: "School ID and student ID are required" });
    }

    const student = await Student.findOne({ schoolId, studentId });

    if (!student) {
      return res.status(404).json({ message: "Student record not found" });
    }

    res.json({
      found: true,
      activated: student.isActivated,
      student: {
        studentId: student.studentId,
        name: student.name,
        className: student.className,
        arm: student.arm,
        regNumber: student.regNumber
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error checking student record" });
  }
});

app.post("/student-forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || "");

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const student = await Student.findOne({ email });

    if (!student) {
      return res.status(404).json({ message: "Student account not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    student.resetToken = token;
    student.resetTokenExpiry = Date.now() + 15 * 60 * 1000;
    await student.save();

    const baseUrl = getBaseUrl(req);
    const resetLink = `${baseUrl}/reset-password.html?token=${token}&type=student`;

    if (!emailUser || !emailPass) {
      console.error("Student password reset email blocked because SMTP credentials are missing.", { EMAIL_USER_SET: !!emailUser, EMAIL_PASS_SET: !!emailPass });
      return res.status(500).json({ message: "Email service is not configured on the server" });
    }

    await transporter.sendMail({
      from: `"STUN-FI HUB" <${emailUser}>`,
      to: email,
      subject: "Password Reset - STUN-FI HUB",
      html: `
        <div style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;padding:32px 18px;">
            <div style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:28px;color:#e5e7eb;">
              <h2 style="margin:0 0 10px;color:#ffffff;">Password Reset Request</h2>
              <p style="color:#94a3b8;line-height:1.6;">We received a request to reset your STUN-FI HUB account password.</p>
              <a href="${resetLink}"
                style="display:inline-block;margin:18px 0;padding:14px 22px;background:#66cccc;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:bold;">
                Reset Password
              </a>
              <p style="color:#94a3b8;line-height:1.6;">This link expires in 15 minutes. If you did not request this, you can ignore this email.</p>
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:22px 0;">
              <p style="margin:0;color:#64748b;font-size:13px;">STUN-FI HUB • Webbing hubs...</p>
            </div>
          </div>
        </div>
      `
    });

    res.json({ message: "Reset link sent to email" });
  } catch (error) {
    console.error("Student reset email failed:", error && error.message ? error.message : error);
    res.status(500).json({ message: "Error sending student reset email" });
  }
});

app.post("/school-register", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const phone = (req.body.phone || "").trim();
    const password = (req.body.password || "").trim();

    if (!name || !email || !password) {
      return res.status(400).json({ message: "School name, email and password are required" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const existingSchool = await School.findOne({ email });
    if (existingSchool) {
      return res.status(400).json({ message: "A school with this email already exists" });
    }

    const id = await generateSchoolId();

    const school = await School.create({
      id,
      name,
      email,
      phone,
      password: await hashPassword(password),
      motto: "",
      logo: "",
      accentColor: "#66cccc",
      accountStatus: "active",
      registeredBy: "self"
    });

    // Create trial subscription automatically
    await createTrialSubscription(school.id);

    res.json({
      message: "School registered successfully",
      school: {
        id: school.id,
        name: school.name,
        email: school.email,
        phone: school.phone,
        accountStatus: school.accountStatus,
        registeredBy: school.registeredBy
      }
    });
  } catch (error) {
    console.error("School registration error:", error && error.message ? error.message : error, { body: req.body });
    const resp = { message: "Error registering school" };
    if (process.env.NODE_ENV !== 'production') {
      resp.error = error && error.message ? error.message : String(error);
      resp.stack = error && error.stack ? error.stack : null;
    }
    res.status(500).json(resp);
  }
});

app.post("/school-forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || "");

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const school = await School.findOne({ email });

    if (!school) {
      return res.status(404).json({ message: "School account not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    school.resetToken = token;
    school.resetTokenExpiry = Date.now() + 15 * 60 * 1000;
    await school.save();

    const baseUrl = getBaseUrl(req);
    const resetLink = `${baseUrl}/reset-password.html?token=${token}&type=school`;

    if (!emailUser || !emailPass) {
      console.error("School password reset email blocked because SMTP credentials are missing.", { EMAIL_USER_SET: !!emailUser, EMAIL_PASS_SET: !!emailPass });
      return res.status(500).json({ message: "Email service is not configured on the server" });
    }

    await transporter.sendMail({
      from: `"STUN-FI HUB" <${emailUser}>`,
      to: email,
      subject: "Password Reset - STUN-FI HUB",
      html: `
        <div style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;padding:32px 18px;">
            <div style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:28px;color:#e5e7eb;">
              <h2 style="margin:0 0 10px;color:#ffffff;">Password Reset Request</h2>
              <p style="color:#94a3b8;line-height:1.6;">We received a request to reset your STUN-FI HUB account password.</p>
              <a href="${resetLink}"
                style="display:inline-block;margin:18px 0;padding:14px 22px;background:#66cccc;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:bold;">
                Reset Password
              </a>
              <p style="color:#94a3b8;line-height:1.6;">This link expires in 15 minutes. If you did not request this, you can ignore this email.</p>
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:22px 0;">
              <p style="margin:0;color:#64748b;font-size:13px;">STUN-FI HUB • Webbing hubs...</p>
            </div>
          </div>
        </div>
      `
    });

    res.json({ message: "Reset link sent to email" });
  } catch (error) {
    console.error("School reset email failed:", error && error.message ? error.message : error);
    res.status(500).json({ message: "Error sending school reset email" });
  }
});

app.post("/school-check-record", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || "");

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const school = await School.findOne({ email });

    if (!school) {
      return res.status(404).json({ message: "School account not found" });
    }

    res.json({
      found: true,
      school: {
        id: school.id,
        name: school.name,
        email: school.email,
        phone: school.phone,
        accountStatus: school.accountStatus
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error checking school account" });
  }
});

app.post("/upload-post-media", upload.single("media"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    let mediaType = "file";
    const mime = req.file.mimetype || "";

    if (mime.startsWith("image/")) {
      mediaType = "image";
    } else if (mime.startsWith("video/")) {
      mediaType = "video";
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      message: "File uploaded successfully",
      mediaUrl: `${baseUrl}/uploads/${req.file.filename}`,
      mediaType,
      fileName: req.file.originalname
    });
  } catch (error) {
    res.status(500).json({ message: "Error uploading file" });
  }
});

app.post("/reset-password/student", async (req, res) => {
  const { token, password } = req.body;

  try {
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const student = await Student.findOne({ resetToken: token });

    if (!student) {
      return res.status(400).json({ message: "Invalid token" });
    }

    if (student.resetTokenExpiry < Date.now()) {
      return res.status(400).json({ message: "Token expired" });
    }

    student.password = await hashPassword(password);
    student.resetToken = undefined;
    student.resetTokenExpiry = undefined;

    await student.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error resetting password" });
  }
});

app.post("/reset-password/teacher", async (req, res) => {
  const { token, password } = req.body;

  try {
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const teacher = await Teacher.findOne({ resetToken: token });

    if (!teacher) {
      return res.status(400).json({ message: "Invalid token" });
    }

    if (teacher.resetTokenExpiry < Date.now()) {
      return res.status(400).json({ message: "Token expired" });
    }

    teacher.password = await hashPassword(password);
    teacher.resetToken = undefined;
    teacher.resetTokenExpiry = undefined;

    await teacher.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error resetting password" });
  }
});

app.post("/reset-password/school", async (req, res) => {
  const { token, password } = req.body;

  try {
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const school = await School.findOne({ resetToken: token });

    if (!school) {
      return res.status(400).json({ message: "Invalid token" });
    }

    if (school.resetTokenExpiry < Date.now()) {
      return res.status(400).json({ message: "Token expired" });
    }

    school.password = await hashPassword(password);
    school.resetToken = undefined;
    school.resetTokenExpiry = undefined;

    await school.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error resetting password" });
  }
});

app.use("/uploads", express.static(uploadsDir));

/* =========================
   SCHOOL LOOKUP / BRANDING
========================= */

app.get("/school-lookup", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email || "");
    const schoolId = (req.query.schoolId || "").trim();

    let school = null;

    if (schoolId) {
      school = await School.findOne({ id: schoolId });
    } else if (email) {
      const schools = await School.find();
      const emailLocal = email.split("@")[0];

      school =
        schools.find((s) => normalizeEmail(s.email) === email) ||
        schools.find((s) =>
          emailLocal.startsWith(normalizeEmail(s.email).split("@")[0])
        ) ||
        null;
    }

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    res.json({
      id: school.id,
      name: school.name,
      email: school.email,
      motto: school.motto,
      logo: school.logo,
      accentColor: school.accentColor
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching school" });
  }
});

/* =========================
   ANNOUNCEMENT / POST ROUTES
========================= */

// school creates a post for students or teachers
app.post("/create-post", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").toString().trim();
    const rawAudience = req.body.audience;
    const text = (req.body.text || "").toString().trim();
    const mediaUrl = (req.body.mediaUrl || "").toString().trim();
    const mediaType = (req.body.mediaType || "").toString().trim();
    const fileName = (req.body.fileName || "").toString().trim();

    const allowedAudiences = ["students", "teachers", "both"];
    const audienceValues = [];

    if (Array.isArray(rawAudience)) {
      rawAudience.forEach((item) => {
        const str = (item || "").toString();
        audienceValues.push(...str.split(","));
      });
    } else if (typeof rawAudience === "string") {
      audienceValues.push(...rawAudience.split(","));
    } else if (rawAudience && typeof rawAudience === "object") {
      Object.values(rawAudience).forEach((item) => {
        const str = (item || "").toString();
        audienceValues.push(...str.split(","));
      });
    }

    const filteredAudience = [...new Set(
      audienceValues
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )];

    let audience = "";

    if (filteredAudience.includes("students") && filteredAudience.includes("teachers")) {
      audience = "both";
    } else if (filteredAudience.length === 1 && allowedAudiences.includes(filteredAudience[0])) {
      audience = filteredAudience[0];
    } else {
      return res.status(400).json({ message: "Audience must be students, teachers, or both" });
    }

    if (!text && !mediaUrl) {
      return res.status(400).json({ message: "Post must contain text or media" });
    }

    // Ensure subscription exists and is active. If missing, create a short trial so schools
    // can publish an announcement without being blocked by missing subscription records.
    const existingSubscription = await getSchoolSubscription(schoolId);
    if (!existingSubscription) {
      await createTrialSubscription(schoolId);
    }

    // Check subscription status
    const subscriptionCheck = await checkSubscriptionStatus(schoolId);
    if (!subscriptionCheck.isActive) {
      return res.status(403).json({
        message: "School subscription is not active. Cannot create announcements."
      });
    }

    const school = await School.findOne({ id: schoolId });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    const postId = await generatePostId();

    const post = await Post.create({
      postId,
      schoolId,
      audience,
      authorType: "school",
      authorId: schoolId,
      text,
      mediaUrl,
      mediaType: mediaType || "",
      fileName: fileName || ""
    });

    res.json({
      message: "Post created successfully",
      post
    });
  } catch (error) {
    console.error("Create post error:", error?.stack || error);
    res.status(500).json({ message: "Error creating post" });
  }
});

// fetch school posts by audience
app.get("/posts/:schoolId", async (req, res) => {
  try {
    const schoolId = (req.params.schoolId || "").trim();
    const audience = (req.query.audience || "").trim().toLowerCase();

    if (!schoolId || !audience) {
      return res.status(400).json({ message: "School ID and audience are required" });
    }

    if (!["students", "teachers", "both"].includes(audience)) {
      return res.status(400).json({ message: "Audience must be students, teachers, or both" });
    }

    const queryAudience = audience === "both"
      ? { $in: ["students", "teachers", "both"] }
      : { $in: [audience, "both"] };

    const posts = await Post.find({ schoolId, audience: queryAudience }).sort({ createdAt: -1 });

    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: "Error loading posts" });
  }
});

// get one post details
app.get("/post/:postId", async (req, res) => {
  try {
    const postId = (req.params.postId || "").trim();

    const post = await Post.findOne({ postId });

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: "Error loading post" });
  }
});

// edit school post
app.put("/edit-post", async (req, res) => {
  try {
    const postId = (req.body.postId || "").trim();
    const schoolId = (req.body.schoolId || "").trim();
    const text = (req.body.text || "").trim();
    const mediaUrl = (req.body.mediaUrl || "").trim();
    const mediaType = (req.body.mediaType || "").trim();
    const fileName = (req.body.fileName || "").trim();

    if (!postId || !schoolId) {
      return res.status(400).json({ message: "Post ID and School ID are required" });
    }

    const post = await Post.findOne({ postId, schoolId });

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!text && !mediaUrl) {
      return res.status(400).json({ message: "Post must contain text or media" });
    }

    post.text = text;
    post.mediaUrl = mediaUrl;
    post.mediaType = mediaType || "";
    post.fileName = fileName || "";

    await post.save();

    res.json({
      message: "Post updated successfully",
      post
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating post" });
  }
});

// delete school post
app.delete("/delete-post", async (req, res) => {
  try {
    const postId = (req.body.postId || "").trim();
    const schoolId = (req.body.schoolId || "").trim();

    if (!postId || !schoolId) {
      return res.status(400).json({ message: "Post ID and School ID are required" });
    }

    const post = await Post.findOne({ postId, schoolId });

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    await Post.deleteOne({ postId, schoolId });

    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting post" });
  }
});

/* =========================
   SUPER ADMIN ROUTES
========================= */

app.get("/admin-stats", async (req, res) => {
  try {
    const totalSchools = await School.countDocuments();
    const totalStudents = await Student.countDocuments();
    const totalTeachers = await Teacher.countDocuments();

    res.json({
      totalSchools,
      totalStudents,
      totalTeachers
    });
  } catch (error) {
    res.status(500).json({ message: "Error loading stats" });
  }
});

app.post("/add-school", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = (req.body.password || "").trim();

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const existingSchool = await School.findOne({ email });

    if (existingSchool) {
      return res.status(400).json({ message: "School email already exists" });
    }

    const id = await generateSchoolId();

    const school = await School.create({
      id,
      name,
      email,
      phone: "",
      password: await hashPassword(password),
      motto: "",
      logo: "",
      accentColor: "#66cccc",
      accountStatus: "active",
      registeredBy: "super_admin"
    });

    res.json({
      message: "School added successfully",
      school
    });
  } catch (error) {
    res.status(500).json({ message: "Error adding school" });
  }
});

app.get("/schools", async (req, res) => {
  try {
    const schools = await School.find().sort({ createdAt: -1 });

    const result = await Promise.all(
      schools.map(async (school) => {
        const totalStudents = await Student.countDocuments({ schoolId: school.id });
        const totalTeachers = await Teacher.countDocuments({ schoolId: school.id });

        return {
          id: school.id,
          name: school.name,
          email: school.email,
          motto: school.motto,
          logo: school.logo,
          accentColor: school.accentColor,
          totalStudents,
          totalTeachers
        };
      })
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error loading schools" });
  }
});

app.delete("/delete-school", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();

    const school = await School.findOne({ id: schoolId });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    const students = await Student.find({ schoolId });
    const studentIds = students.map((s) => s.studentId);

    await School.deleteOne({ id: schoolId });
    await Teacher.deleteMany({ schoolId });
    await Student.deleteMany({ schoolId });
    await Score.deleteMany({ schoolId });
    await SubmittedScore.deleteMany({ schoolId });

    if (studentIds.length > 0) {
      await Score.deleteMany({ studentId: { $in: studentIds } });
      await SubmittedScore.deleteMany({ studentId: { $in: studentIds } });
    }

    res.json({ message: "School deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting school" });
  }
});

/* =========================
   SCHOOL PROFILE ROUTES
========================= */

app.get("/school-profile/:schoolId", async (req, res) => {
  try {
    const school = await School.findOne({ id: req.params.schoolId });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    res.json({
      id: school.id,
      name: school.name,
      email: school.email,
      motto: school.motto,
      logo: school.logo,
      accentColor: school.accentColor
    });
  } catch (error) {
    res.status(500).json({ message: "Error loading school profile" });
  }
});

app.put("/update-school-profile", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();
    const name = (req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const motto = (req.body.motto || "").trim();
    const logo = req.body.logo || "";
    const accentColor = (req.body.accentColor || "#66cccc").trim();

    if (!schoolId || !name || !email) {
      return res.status(400).json({ message: "School ID, name and email are required" });
    }

    const school = await School.findOne({ id: schoolId });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    const emailOwner = await School.findOne({ email });

    if (emailOwner && emailOwner.id !== schoolId) {
      return res.status(400).json({ message: "Email already belongs to another school" });
    }

    school.name = name;
    school.email = email;
    school.motto = motto;
    school.logo = logo;
    school.accentColor = accentColor;

    await school.save();

    res.json({
      message: "School profile updated successfully",
      school: {
        id: school.id,
        name: school.name,
        email: school.email,
        motto: school.motto,
        logo: school.logo,
        accentColor: school.accentColor
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating school profile" });
  }
});

/* =========================
   STUDENT ROUTES
========================= */

app.post("/add-student", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const regNumber = (req.body.regNumber || "").trim();
    const schoolId = (req.body.schoolId || "").trim();
    const className = (req.body.className || req.body.class || "").trim();
    const arm = (req.body.arm || "").trim();

    if (!name || !regNumber || !schoolId || !className || !arm) {
      return res.status(400).json({ message: "Name, reg number, class and arm are required" });
    }

    // Check student limit from subscription
    const limitCheck = await checkStudentLimit(schoolId);
    if (!limitCheck.canAdd) {
      return res.status(403).json({ message: limitCheck.message });
    }

    const existingStudent = await Student.findOne({ regNumber, schoolId });

    if (existingStudent) {
      return res.status(400).json({ message: "Reg number already exists in this school" });
    }

    let studentId;
    const regMatch = /^STU(\d+)$/i.exec(regNumber);
    if (regMatch) {
      studentId = "STD" + regMatch[1];
    } else {
      studentId = await generateStudentId();
    }

    const student = await Student.create({
      studentId,
      name,
      regNumber,
      schoolId,
      className,
      arm,
      email: "",
      phone: "",
      password: "",
      isActivated: false
    });

    res.json({
      message: "Student added successfully",
      student
    });
  } catch (error) {
    console.error("Error in add-student endpoint:", error.message, error.stack);
    res.status(500).json({ message: "Error adding student", error: error.message });
  }
});

app.get("/school/:schoolId", verifyToken, async (req, res) => {
  try {
    const students = await Student.find({ schoolId: req.params.schoolId }).sort({ createdAt: -1 });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: "Error loading students" });
  }
});

app.put("/edit-student", async (req, res) => {
  try {
    const oldRegNumber = (req.body.oldRegNumber || "").trim();
    const newName = (req.body.newName || "").trim();
    const newRegNumber = (req.body.newRegNumber || "").trim();
    const schoolId = (req.body.schoolId || "").trim();
    const className = (req.body.className || req.body.class || "").trim();
    const arm = (req.body.arm || "").trim();

    const student = await Student.findOne({
      regNumber: oldRegNumber,
      schoolId
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const duplicate = await Student.findOne({
      regNumber: newRegNumber,
      schoolId
    });

    if (duplicate && duplicate.studentId !== student.studentId) {
      return res.status(400).json({ message: "That reg number already exists" });
    }

    student.name = newName;
    student.regNumber = newRegNumber;
    if (className) student.className = className;
    if (arm) student.arm = arm;

    await student.save();

    res.json({
      message: "Student updated successfully",
      student
    });
  } catch (error) {
    res.status(500).json({ message: "Error editing student" });
  }
});

app.delete("/delete-student", async (req, res) => {
  try {
    const regNumber = (req.body.regNumber || "").trim();
    const schoolId = (req.body.schoolId || "").trim();

    const student = await Student.findOne({ regNumber, schoolId });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    await Student.deleteOne({ regNumber, schoolId });
    await Score.deleteMany({ studentId: student.studentId });
    await SubmittedScore.deleteMany({ studentId: student.studentId });

    res.json({ message: "Student deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting student" });
  }
});

/* =========================
   TEACHER ROUTES
========================= */

app.post("/add-teacher", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const schoolId = (req.body.schoolId || "").trim();

    if (!name || !email || !schoolId) {
      return res.status(400).json({
        message: "Name, email and school are required"
      });
    }

    // Check subscription status
    const subscriptionCheck = await checkSubscriptionStatus(schoolId);
    if (!subscriptionCheck.isActive) {
      return res.status(403).json({
        message: "School subscription is not active. Cannot add new teachers."
      });
    }

    const existingTeacher = await Teacher.findOne({
      schoolId,
      email
    });

    if (existingTeacher) {
      return res.status(400).json({
        message: "Teacher already exists in this school"
      });
    }

    const teacherId = await generateTeacherId();

    const teacher = await Teacher.create({
      teacherId,
      name,
      email,
      phone: "",
      password: "",
      schoolId,

      // ❌ REMOVE subject/class/arm usage
      assignments: [],

      isActivated: false
    });

    res.json({
      message: "Teacher added successfully",
      teacher
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error adding teacher" });
  }
});

app.post("/add-teacher-assignment", async (req, res) => {
  try {
    const teacherId = (req.body.teacherId || "").trim();
    const subject = (req.body.subject || "").trim();
    const className = (req.body.className || req.body.class || "").trim();
    const arm = (req.body.arm || "").trim();

    if (!teacherId || !subject || !className) {
      return res.status(400).json({
        message: "Teacher ID, subject and class are required"
      });
    }

    const teacher = await Teacher.findOne({ teacherId });

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const alreadyExists = teacher.assignments.some(item =>
      item.subject.toLowerCase() === subject.toLowerCase() &&
      item.className.toLowerCase() === className.toLowerCase() &&
      (item.arm || "").toLowerCase() === arm.toLowerCase()
    );

    if (alreadyExists) {
      return res.status(400).json({
        message: "This assignment already exists for this teacher"
      });
    }

    teacher.assignments.push({
      subject,
      className,
      arm
    });

    await teacher.save();

    res.json({
      message: "Teacher assignment added successfully",
      teacher
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error adding teacher assignment" });
  }
});

app.get("/students-by-assignment", async (req, res) => {
  try {
    const { schoolId, className, arm, subject, session = "2025/2026", term = "1st Term" } = req.query;

    if (!schoolId || !className || !subject) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const query = {
      schoolId,
      className,
      subject,
      session,
      term
    };

    if (arm !== undefined && arm !== null && arm !== "") {
      query.arm = arm;
    }

    const enrollments = await SubjectEnrollment.find(query);

    const studentIds = enrollments.map(e => e.studentId);

    const students = await Student.find({
      schoolId,
      studentId: { $in: studentIds }
    });

    res.json(students);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error fetching students" });
  }
});

app.put("/edit-teacher", async (req, res) => {
  try {
    const teacherId = (req.body.teacherId || "").trim();
    const name = (req.body.name || "").trim();
    const email = normalizeEmail(req.body.email || "");

    if (!teacherId || !name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    const teacher = await Teacher.findOne({ teacherId });

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const duplicate = await Teacher.findOne({
      schoolId: teacher.schoolId,
      email
    });

    if (duplicate && duplicate.teacherId !== teacherId) {
      return res.status(400).json({ message: "Teacher email already exists in this school" });
    }

    teacher.name = name;
    teacher.email = email;

    await teacher.save();

    res.json({
      message: "Teacher updated successfully",
      teacher
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error editing teacher" });
  }
});

app.get("/teacher-subjects/:teacherId", async (req, res) => {
  try {

    const teacher =
      await Teacher.findOne({
        teacherId:
          req.params.teacherId
      });

    if (!teacher) {
      return res.status(404).json({
        message:
          "Teacher not found"
      });
    }

    res.json(
      teacher.assignments || []
    );

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Error loading subjects"
    });

  }
});

app.delete(
"/teacher-subject/:teacherId",
async (req,res)=>{

try{

const {
subject,
className,
arm
}=req.body;

await Teacher.updateOne(
{
teacherId:
req.params.teacherId
},
{
$pull:{
assignments:{
subject,
className,
arm
}
}
}
);

res.json({
message:
"Subject removed"
});

}

catch(err){

console.log(err);

res
.status(500)
.json({
message:
"Delete failed"
});

}

});

app.get("/teachers/:schoolId", async (req, res) => {
  try {
    const teachers = await Teacher.find({ schoolId: req.params.schoolId }).sort({ createdAt: -1 });
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ message: "Error loading teachers" });
  }
});

app.delete("/delete-teacher", async (req, res) => {
  try {
    const teacherId = (req.body.teacherId || "").trim();

    const teacher = await Teacher.findOne({ teacherId });

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    await Teacher.deleteOne({ teacherId });

    res.json({ message: "Teacher deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting teacher" });
  }
});

app.post("/school/:schoolId/timetable", async (req, res) => {
  try {
    const schoolId = (req.params.schoolId || "").trim();
    const className = (req.body.className || "").trim();
    const arm = (req.body.arm || "").trim();
    const day = (req.body.day || "").trim();
    const subject = (req.body.subject || "").trim();
    const teacherId = (req.body.teacherId || "").trim();
    const startTime = (req.body.startTime || "").trim();
    const endTime = (req.body.endTime || "").trim();
    const session = (req.body.session || "2025/2026").trim();
    const term = (req.body.term || "1st Term").trim();

    if (!schoolId || !className || !day || !subject || !teacherId || !startTime || !endTime) {
      return res.status(400).json({ message: "All timetable fields are required" });
    }

    const teacher = await Teacher.findOne({ teacherId, schoolId });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found for this school" });
    }

    const existing = await Timetable.findOne({
      schoolId,
      className,
      arm,
      day,
      subject,
      teacherId,
      startTime,
      endTime,
      session,
      term
    });

    if (existing) {
      return res.status(400).json({ message: "This timetable entry already exists" });
    }

    const entry = await Timetable.create({
      schoolId,
      className,
      arm,
      day,
      subject,
      teacherId,
      startTime,
      endTime,
      session,
      term
    });

    res.json({ message: "Timetable entry created successfully", entry });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error creating timetable entry" });
  }
});

app.get("/school/:schoolId/timetable", async (req, res) => {
  try {
    const schoolId = (req.params.schoolId || "").trim();
    const session = (req.query.session || "2025/2026").trim();
    const term = (req.query.term || "1st Term").trim();
    const className = (req.query.className || "").trim();
    const arm = (req.query.arm || "").trim();
    const teacherId = (req.query.teacherId || "").trim();
    const day = (req.query.day || "").trim();
    const subject = (req.query.subject || "").trim();

    const query = {
      schoolId,
      session,
      term
    };

    if (className) query.className = className;
    if (arm) query.arm = arm;
    if (teacherId) query.teacherId = teacherId;
    if (day) query.day = day;
    if (subject) query.subject = subject;

    const timetable = await Timetable.find(query).sort({ day: 1, startTime: 1 });
    res.json(timetable);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error loading timetable entries" });
  }
});

app.delete("/school/:schoolId/timetable/:entryId", async (req, res) => {
  try {
    const schoolId = (req.params.schoolId || "").trim();
    const entryId = (req.params.entryId || "").trim();

    const deleted = await Timetable.findOneAndDelete({ _id: entryId, schoolId });

    if (!deleted) {
      return res.status(404).json({ message: "Timetable entry not found" });
    }

    res.json({ message: "Timetable entry deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error deleting timetable entry" });
  }
});

app.get("/teacher-timetable/:teacherId", async (req, res) => {
  try {
    const teacherId = (req.params.teacherId || "").trim();
    const schoolId = (req.query.schoolId || "").trim();
    const session = (req.query.session || "2025/2026").trim();
    const term = (req.query.term || "1st Term").trim();

    const teacher = await Teacher.findOne({ teacherId, schoolId });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const timetable = await Timetable.find({ teacherId, schoolId, session, term }).sort({ day: 1, startTime: 1 });
    res.json(timetable);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error loading teacher timetable" });
  }
});

app.get("/student-timetable/:studentId", async (req, res) => {
  try {
    const studentId = (req.params.studentId || "").trim();
    const schoolId = (req.query.schoolId || "").trim();
    const session = (req.query.session || "2025/2026").trim();
    const term = (req.query.term || "1st Term").trim();

    const student = await Student.findOne({ studentId, schoolId });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const query = {
      schoolId,
      className: student.className,
      arm: student.arm || "",
      session,
      term
    };

    const timetable = await Timetable.find(query).sort({ day: 1, startTime: 1 });
    res.json(timetable);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error loading student timetable" });
  }
});

app.get("/teacher-students", async (req, res) => {
  try {
    const schoolId = (req.query.schoolId || "").trim();
    const className = (req.query.className || req.query.class || "").trim();
    const arm = (req.query.arm || "").trim();

    const students = await Student.find({
      schoolId,
      className,
      arm
    }).sort({ name: 1 });

    res.json(students);
  } catch (error) {
    res.status(500).json({ message: "Error loading teacher students" });
  }
});

/* =========================
   TEACHER DRAFT / SUBMIT ROUTES
========================= */

app.get("/teacher-score-sheet", async (req, res) => {
  try {
    const teacherId = (req.query.teacherId || "").trim();
    const schoolId = (req.query.schoolId || "").trim();
    const subject = (req.query.subject || "").trim();
    const className = (req.query.className || "").trim();
    const arm = (req.query.arm || "").trim();
    const session = (req.query.session || "").trim();
    const term = (req.query.term || "").trim();

    if (!teacherId || !schoolId || !subject || !className || !arm || !session || !term) {
      return res.status(400).json({ message: "Missing score sheet query fields" });
    }

    const rows = await SubmittedScore.find({
      teacherId,
      schoolId,
      subject,
      className,
      arm,
      session,
      term
    });

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Error loading score sheet" });
  }
});

app.post("/teacher-save-draft", async (req, res) => {
  try {
    const {
      studentId,
      schoolId,
      teacherId,
      subject,
      className,
      arm,
      session,
      term,
      components
    } = req.body;

    if (!studentId || !schoolId || !teacherId || !subject || !session || !term) {
      return res.status(400).json({ message: "Missing required draft fields" });
    }

    const safeComponents = Array.isArray(components) ? components : [];
    const total = computeTotalFromComponents(safeComponents);
    const grade = getGrade(total);

    const draft = await SubmittedScore.findOneAndUpdate(
      { studentId, teacherId, subject, session, term },
      {
        studentId,
        schoolId,
        teacherId,
        subject,
        className: className || "",
        arm: arm || "",
        session,
        term,
        components: safeComponents,
        total,
        grade,
        status: "draft"
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: "Draft saved successfully",
      draft
    });
  } catch (error) {
    res.status(500).json({ message: "Error saving draft" });
  }
});

app.post("/teacher-submit-score", async (req, res) => {
  try {
    const {
      studentId,
      schoolId,
      teacherId,
      subject,
      className,
      arm,
      session,
      term,
      components
    } = req.body;

    if (!studentId || !schoolId || !teacherId || !subject || !session || !term) {
      return res.status(400).json({ message: "Missing required submitted score fields" });
    }

    const safeComponents = Array.isArray(components) ? components : [];
    const total = computeTotalFromComponents(safeComponents);
    const grade = getGrade(total);

    const submitted = await SubmittedScore.findOneAndUpdate(
      { studentId, teacherId, subject, session, term },
      {
        studentId,
        schoolId,
        teacherId,
        subject,
        className: className || "",
        arm: arm || "",
        session,
        term,
        components: safeComponents,
        total,
        grade,
        status: "submitted"
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: "Scores submitted to school successfully",
      submitted
    });
  } catch (error) {
    res.status(500).json({ message: "Error submitting scores" });
  }
});

/* =========================
   SCHOOL REVIEW / ASSIGN ROUTES
========================= */

app.get("/school-student-scores/:studentId", async (req, res) => {
  try {
    const studentId = (req.params.studentId || "").trim();
    const schoolId = (req.query.schoolId || "").trim();
    const session = (req.query.session || "2025/2026").trim();
    const term = (req.query.term || "1st Term").trim();

    if (!studentId || !schoolId) {
      return res.status(400).json({ message: "Student and school are required" });
    }

    const submitted = await SubmittedScore.find({
      studentId,
      schoolId,
      session,
      term
    }).sort({ subject: 1 });

    res.json(submitted);
  } catch (error) {
    res.status(500).json({ message: "Error loading student submitted scores" });
  }
});

app.post("/assign-student-result", async (req, res) => {
  try {
    const studentId = (req.body.studentId || "").trim();
    const schoolId = (req.body.schoolId || "").trim();
    const session = (req.body.session || "2025/2026").trim();
    const term = (req.body.term || "1st Term").trim();

    if (!studentId || !schoolId) {
      return res.status(400).json({ message: "Student and school are required" });
    }

    // Check subscription status
    const subscriptionCheck = await checkSubscriptionStatus(schoolId);
    if (!subscriptionCheck.isActive) {
      return res.status(403).json({
        message: "School subscription is not active. Cannot assign results."
      });
    }

    const submittedScores = await SubmittedScore.find({
      studentId,
      schoolId,
      session,
      term,
      status: "submitted"
    });

    if (!submittedScores.length) {
      return res.status(400).json({ message: "No submitted scores available for this student" });
    }

    for (const item of submittedScores) {
      await Score.findOneAndUpdate(
        {
          studentId: item.studentId,
          subject: item.subject,
          session: item.session,
          term: item.term
        },
        {
          studentId: item.studentId,
          schoolId: item.schoolId,
          teacherId: item.teacherId,
          subject: item.subject,
          session: item.session,
          term: item.term,
          components: item.components,
          total: item.total,
          grade: item.grade
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      item.status = "assigned";
      await item.save();
    }

        await ResultAccess.findOneAndUpdate(
      { studentId, schoolId, session, term },
      {
        studentId,
        schoolId,
        session,
        term,
        resultReady: true,
        isUnlocked: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const promotionStatus = (req.body.promotionStatus || "pending").trim();
    const nextClass = req.body.nextClass || null;
    const processedBy = req.body.processedBy || "admin-ui";

    await generateStudentResultDocument(studentId, schoolId, session, term);

    if (promotionStatus && promotionStatus !== "pending") {
      await applyPromotionDecisionToResult(studentId, schoolId, session, term, promotionStatus, nextClass);
      await generateStudentPromotionRecord(studentId, schoolId, session, term, promotionStatus, nextClass, processedBy);
      await applyPromotionDecisionToStudent(studentId, promotionStatus, nextClass);
    }

    res.json({ message: "Result assigned successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error assigning result" });
  }
});

/* =========================
   STUDENT RESULT ROUTES
========================= */

app.get("/student-result/:studentId", async (req, res) => {
  try {
    const session = (req.query.session || "2025/2026").trim();
    const term = (req.query.term || "1st Term").trim();

    const student = await Student.findOne({ studentId: req.params.studentId });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const scores = await Score.find({
      studentId: student.studentId,
      session,
      term
    }).sort({ subject: 1 });

    const total = scores.reduce((sum, item) => sum + item.total, 0);
    const average = scores.length ? total / scores.length : 0;

    const classmates = await Student.find({
      schoolId: student.schoolId,
      className: student.className,
      arm: student.arm
    });

    const compiled = [];

    for (const mate of classmates) {
      const mateScores = await Score.find({
        studentId: mate.studentId,
        session,
        term
      });

      const mateTotal = mateScores.reduce((sum, item) => sum + item.total, 0);

      compiled.push({
        studentId: mate.studentId,
        total: mateTotal
      });
    }

    compiled.sort((a, b) => b.total - a.total);

    let position = "-";
    const index = compiled.findIndex((item) => item.studentId === student.studentId);
    if (index !== -1) position = index + 1;

    const access = await ResultAccess.findOne({
      studentId: student.studentId,
      schoolId: student.schoolId,
      session,
      term
    });

    const unlocked = access ? access.isUnlocked === true : true;

    res.json({
      student: {
        studentId: student.studentId,
        name: student.name,
        regNumber: student.regNumber,
        className: student.className,
        arm: student.arm,
        schoolId: student.schoolId
      },
      scores,
      total,
      average,
      position,
      ready: scores.length > 0,
      unlocked
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching student result" });
  }
});

app.get("/result/:schoolId/:regNumber", async (req, res) => {
  try {
    const session = (req.query.session || "2025/2026").trim();
    const term = (req.query.term || "1st Term").trim();

    const student = await Student.findOne({
      schoolId: req.params.schoolId,
      regNumber: req.params.regNumber
    });

    if (!student) {
      return res.status(404).json({ message: "Result not found" });
    }

    const scores = await Score.find({
      studentId: student.studentId,
      session,
      term
    }).sort({ subject: 1 });

    if (scores.length === 0) {
      return res.status(404).json({ message: "Result not ready" });
    }

    const total = scores.reduce((sum, item) => sum + item.total, 0);
    const average = scores.length ? total / scores.length : 0;

    res.json({
      name: student.name,
      regNumber: student.regNumber,
      className: student.className,
      arm: student.arm,
      scores,
      total,
      average,
      ready: true
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/student-result-status/:studentId", async (req, res) => {
  try {
    const studentId = (req.params.studentId || "").trim();
    const schoolId = (req.query.schoolId || "").trim();
    const session = (req.query.session || "2025/2026").trim();
    const term = (req.query.term || "1st Term").trim();

    if (!studentId || !schoolId) {
      return res.status(400).json({ message: "Student and school are required" });
    }

    const scores = await Score.find({
      studentId,
      schoolId,
      session,
      term
    });

    if (!scores.length) {
      return res.json({
        assigned: false,
        unlocked: false,
        label: "Not Assigned"
      });
    }

    const unlocked = scores.every(item => item.isUnlocked === true);

    res.json({
      assigned: true,
      unlocked,
      label: unlocked ? "Unlocked" : "Locked"
    });
  } catch (error) {
    res.status(500).json({ message: "Error loading result status" });
  }
});

app.get("/student-payment-status/:studentId", async (req, res) => {
  try {
    const studentId = (req.params.studentId || "").trim();
    const schoolId = (req.query.schoolId || "").trim();
    const session = (req.query.session || "2025/2026").trim();
    const term = (req.query.term || "1st Term").trim();

    if (!studentId || !schoolId) {
      return res.status(400).json({ message: "Student and school are required" });
    }

    const access = await ResultAccess.findOne({
      studentId,
      schoolId,
      session,
      term
    });

    if (!access) {
      return res.json({
        paymentStatus: "unpaid",
        amount: 0,
        resultReady: false,
        isUnlocked: false
      });
    }

    res.json({
      paymentStatus: access.paymentStatus,
      amount: access.amount,
      resultReady: access.resultReady,
      isUnlocked: access.isUnlocked,
      paymentRequired: access.paymentRequired,
      paidAt: access.paidAt
    });
  } catch (error) {
    res.status(500).json({ message: "Error loading payment status" });
  }
});

app.post("/compile-result", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();
    const className = (req.body.className || req.body.class || "").trim();
    const arm = (req.body.arm || "").trim();
    const session = (req.body.session || "2025/2026").trim();
    const term = (req.body.term || "1st Term").trim();

    const students = await Student.find({ schoolId, className, arm }).sort({ name: 1 });

    // Check subscription status
    const subscriptionCheck = await checkSubscriptionStatus(schoolId);
    if (!subscriptionCheck.isActive) {
      return res.status(403).json({
        message: "School subscription is not active. Cannot compile results."
      });
    }

    const compiled = [];

    for (const student of students) {
      const scores = await Score.find({
        studentId: student.studentId,
        session,
        term
      });

      const total = scores.reduce((sum, item) => sum + item.total, 0);
      const average = scores.length ? total / scores.length : 0;

      compiled.push({
        studentId: student.studentId,
        name: student.name,
        regNumber: student.regNumber,
        className: student.className,
        arm: student.arm,
        subjectCount: scores.length,
        total,
        average
      });
    }

    compiled.sort((a, b) => b.total - a.total);

    const withPositions = compiled.map((item, index) => ({
      ...item,
      position: index + 1
    }));

    res.json(withPositions);
  } catch (error) {
    res.status(500).json({ message: "Error compiling result" });
  }
});

app.post("/unlock-student-result", async (req, res) => {
  try {
    const { studentId, schoolId, session, term } = req.body;

    if (!studentId || !schoolId || !session || !term) {
      return res.status(400).json({ message: "Missing fields" });
    }

    await Score.updateMany(
      { studentId, schoolId, session, term },
      { $set: { isUnlocked: true } }
    );

    res.json({ message: "Result unlocked successfully" });

  } catch (error) {
    res.status(500).json({ message: "Error unlocking result" });
  }
});
app.post("/lock-student-result", async (req, res) => {
  try {
    const { studentId, schoolId, session, term } = req.body;

    if (!studentId || !schoolId || !session || !term) {
      return res.status(400).json({ message: "Missing fields" });
    }

    await Score.updateMany(
      { studentId, schoolId, session, term },
      { $set: { isUnlocked: false } }
    );

    res.json({ message: "Result locked successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error locking result" });
  }
});

app.get("/debug-submitted-scores", async (req, res) => {
  try {
    const all = await SubmittedScore.find().sort({ createdAt: -1 });
    res.json(all);
  } catch (error) {
    res.status(500).json({ message: "Error loading debug scores" });
  }
});

// =========================
// AI / LLM ENDPOINTS
// =========================

app.post("/ai/generate-report-comment", async (req, res) => {
  try {
    const { studentId, schoolId, session, term } = req.body;

    if (!studentId || !schoolId || !session || !term) {
      return res.status(400).json({ message: "studentId, schoolId, session, and term are required" });
    }

    if (!geminiApiKey) {
      return res.status(500).json({ message: "AI service is not configured on the server" });
    }

    const student = await Student.findOne({ studentId, schoolId });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    let scores = await Score.find({ studentId, schoolId, session, term });
    
    // Fallback: if no official scores, try submitted/draft scores
    if (!scores.length) {
      const submitted = await SubmittedScore.find({ studentId, schoolId, session, term });
      if (submitted.length > 0) {
        // Transform SubmittedScore to Score shape for prompt building
        scores = submitted.map(s => ({
          studentId: s.studentId,
          schoolId: s.schoolId,
          subject: s.subject,
          total: s.total || 0,
          grade: s.grade || "",
          components: s.components || [],
          session: s.session,
          term: s.term
        }));
      }
    }
    
    if (!scores.length) {
      return res.status(400).json({ message: "No submitted scores found for this student in the selected session and term" });
    }

    const prompt = buildAIPromptForStudentReport({ student, scores, session, term });
    const preferredModels = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    let response = null;
    let lastErr = null;

    for (const modelName of preferredModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        response = await model.generateContent(prompt);
        break; // success
      } catch (err) {
        lastErr = err;
        console.error(`Model ${modelName} error:`, err.message || err);
        // Try next model if current one failed
        continue;
      }
    }

    if (!response) {
      console.error("AI model selection error:", lastErr && (lastErr.message || JSON.stringify(lastErr)));
      return res.status(500).json({ message: "AI service error or requested model not available. Check GEMINI_API_KEY and model availability." });
    }

    // Extract text from Google Generative AI response (official @google/generative-ai library)
    let comment = "";
    try {
      if (typeof response.text === "function") {
        comment = response.text();
      } else if (typeof response.text === "string") {
        comment = response.text;
      }
    } catch (e) {
      console.error("Error extracting text from response:", e);
    }
    
    if (!comment) {
      console.error("Generated comment is empty");
      return res.status(500).json({ message: "AI service returned an empty comment" });
    }

    res.json({ comment });
  } catch (error) {
    console.error("AI report comment error:", error);
    res.status(500).json({ message: "Error generating AI comment" });
  }
});

/* =========================
   ACADEMIC SESSION ROUTES
========================= */

app.post("/create-academic-session", async (req, res) => {
  try {
    const { schoolId, newSession, copySubjects, keepTeachers, usePromotionDecisions, createdBy } = req.body;

    if (!schoolId || !newSession) {
      return res.status(400).json({ message: "School ID and new session are required" });
    }

    // Check if session already exists
    const exists = await AcademicSession.findOne({ schoolId, session: newSession });
    if (exists) {
      return res.status(400).json({ message: "Session already exists for this school" });
    }

    // Deactivate current active session
    await AcademicSession.updateMany(
      { schoolId, isActive: true },
      { $set: { isActive: false } }
    );

    // Create new session
    const newAcademicSession = new AcademicSession({
      schoolId,
      session: newSession,
      isActive: true,
      createdBy: createdBy || "system"
    });

    await newAcademicSession.save();

    // If usePromotionDecisions is true, process promotions from the most recent previous session.
    if (usePromotionDecisions) {
      const previousSessionDoc = await AcademicSession.findOne({ schoolId, session: { $ne: newSession } }).sort({ createdAt: -1 });
      const previousSession = previousSessionDoc ? previousSessionDoc.session : null;

      if (previousSession) {
        const promotions = await StudentPromotion.find({ schoolId, session: previousSession, promotionStatus: { $ne: "pending" } });

        for (const promotion of promotions) {
          if (promotion.promotionStatus === "promoted" && promotion.nextClass) {
            await Student.updateOne(
              { studentId: promotion.studentId },
              { $set: { className: promotion.nextClass } }
            );
          } else if (promotion.promotionStatus === "repeat") {
            // keep in same class
          } else if (promotion.promotionStatus === "graduated") {
            await Student.updateOne(
              { studentId: promotion.studentId },
              { $set: { status: "graduated", isActivated: false, graduatedAt: new Date() } }
            );
          } else if (promotion.promotionStatus === "withdrawn") {
            await Student.updateOne(
              { studentId: promotion.studentId },
              { $set: { status: "withdrawn", isActivated: false, withdrawnAt: new Date() } }
            );
          }

          promotion.processedAt = promotion.processedAt || new Date();
          promotion.processedBy = promotion.processedBy || (createdBy || "system");
          await promotion.save();
        }
      }
    }

    if (keepTeachers === false) {
      await Teacher.updateMany({ schoolId }, { $set: { assignments: [] } });
    }

    // If copySubjects is true, copy subject enrollments to new session
    if (copySubjects) {
      const existingSessions = await AcademicSession.find({ 
        schoolId, 
        session: { $ne: newSession }
      }).sort({ createdAt: -1 }).limit(1);

      if (existingSessions.length > 0) {
        const lastSession = existingSessions[0].session;
        const subjects = await SubjectEnrollment.find({ schoolId, session: lastSession });
        
        const newEnrollments = subjects.map(s => ({
          ...s.toObject(),
          _id: undefined,
          session: newSession,
          term: "1st Term"
        }));

        if (newEnrollments.length > 0) {
          await SubjectEnrollment.insertMany(newEnrollments);
        }
      }
    }

    res.json({
      message: "Academic session created successfully",
      session: newAcademicSession
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error creating academic session" });
  }
});

app.get("/active-session/:schoolId", async (req, res) => {
  try {
    const schoolId = (req.params.schoolId || "").trim();

    const activeSession = await AcademicSession.findOne({ schoolId, isActive: true });

    if (!activeSession) {
      return res.status(404).json({ message: "No active session found" });
    }

    res.json(activeSession);
  } catch (error) {
    res.status(500).json({ message: "Error fetching active session" });
  }
});

app.get("/session-history/:schoolId", async (req, res) => {
  try {
    const schoolId = (req.params.schoolId || "").trim();
    const limit = parseInt(req.query.limit) || 10;

    const sessions = await AcademicSession.find({ schoolId })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching session history" });
  }
});

app.post("/set-promotion-status", async (req, res) => {
  try {
    const { studentId, schoolId, session, term, promotionStatus, nextClass, processedBy } = req.body;

    if (!studentId || !schoolId || !session || !promotionStatus || !term) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const validStatuses = ["promoted", "repeat", "graduated", "withdrawn"];
    if (!validStatuses.includes(promotionStatus)) {
      return res.status(400).json({ message: "Invalid promotion status" });
    }

    const resultExists = await Result.findOne({ studentId, schoolId, session, term });
    if (!resultExists || !resultExists.isFinalized) {
      return res.status(400).json({ message: "Promotion decisions can only be set after the result is finalized" });
    }

    const existingPromotion = await StudentPromotion.findOne({ studentId, schoolId, session });

    await generatePromotionHistoryEntry({
      studentId,
      schoolId,
      session,
      term,
      previousStatus: existingPromotion?.promotionStatus || "pending",
      previousNextClass: existingPromotion?.nextClass || null,
      newStatus: promotionStatus,
      newNextClass: nextClass || null,
      changedBy: processedBy || "system",
      changeType: "manual",
      reason: "Admin set promotion status"
    });

    const promotion = await StudentPromotion.findOneAndUpdate(
      { studentId, schoolId, session },
      {
        promotionStatus,
        nextClass: nextClass || null,
        processedAt: new Date(),
        processedBy: processedBy || "system"
      },
      { upsert: true, new: true }
    );

    await applyPromotionDecisionToResult(studentId, schoolId, session, term, promotionStatus, nextClass);

    res.json({
      message: "Promotion status set successfully",
      promotion
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error setting promotion status" });
  }
});

app.get("/student-promotion/:studentId/:schoolId/:session", async (req, res) => {
  try {
    const { studentId, schoolId, session } = req.params;

    const promotion = await StudentPromotion.findOne({ studentId, schoolId, session });

    if (!promotion) {
      return res.status(404).json({ message: "No promotion record found" });
    }

    res.json(promotion);
  } catch (error) {
    res.status(500).json({ message: "Error fetching promotion status" });
  }
});

app.get("/student-academic-history/:studentId/:schoolId", async (req, res) => {
  try {
    const { studentId, schoolId } = req.params;

    const results = await Result.find({ studentId, schoolId })
      .sort({ session: -1, term: -1 });

    const promotions = await StudentPromotion.find({ studentId, schoolId })
      .sort({ session: -1 });

    const promotionHistory = await PromotionHistory.find({ studentId, schoolId })
      .sort({ changedAt: -1 });

    res.json({
      results,
      promotions,
      promotionHistory
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching academic history" });
  }
});

app.get("/school-students-by-session/:schoolId", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const className = (req.query.className || "").trim();

    const query = { schoolId };
    if (className) {
      query.className = className;
    }

    const students = await Student.find(query).sort({ className: 1, name: 1 });

    res.json(students);
  } catch (error) {
    res.status(500).json({ message: "Error fetching students" });
  }
});

app.get("/session-promotions/:schoolId", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const session = (req.query.session || "").trim();

    if (!session) {
      return res.status(400).json({ message: "Session is required" });
    }

    const promotions = await StudentPromotion.find({ schoolId, session }).sort({ updatedAt: -1 });
    res.json(promotions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching promotions" });
  }
});

app.get("/promotion-settings/:schoolId/:session", async (req, res) => {
  try {
    const { schoolId, session } = req.params;

    if (!schoolId || !session) {
      return res.status(400).json({ message: "School ID and session are required" });
    }

    let settings = await PromotionSetting.findOne({ schoolId, session });
    if (!settings) {
      settings = new PromotionSetting(getDefaultPromotionSettings(session));
      settings.schoolId = schoolId;
      settings.session = session;
    }

    res.json(settings);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error loading promotion settings" });
  }
});

app.put("/promotion-settings", async (req, res) => {
  try {
    const {
      schoolId,
      session,
      promoteAverage,
      repeatAverage,
      withdrawAverage,
      ss3GraduationAverage,
      notPromotedAverage,
      allowAutoSuggestions,
      updatedBy
    } = req.body;

    if (!schoolId || !session) {
      return res.status(400).json({ message: "School ID and session are required" });
    }

    const settings = await PromotionSetting.findOneAndUpdate(
      { schoolId, session },
      {
        schoolId,
        session,
        promoteAverage: Number(promoteAverage || 50),
        repeatAverage: Number(repeatAverage || 40),
        withdrawAverage: Number(withdrawAverage || 30),
        ss3GraduationAverage: Number(ss3GraduationAverage || 50),
        notPromotedAverage: Number(notPromotedAverage || 50),
        allowAutoSuggestions: allowAutoSuggestions === true || allowAutoSuggestions === "true",
        updatedBy: updatedBy || "admin-ui"
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: "Promotion settings saved", settings });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error saving promotion settings" });
  }
});

app.post("/generate-promotion-suggestions", async (req, res) => {
  try {
    const { schoolId, session, term, className } = req.body;

    if (!schoolId || !session || !term) {
      return res.status(400).json({ message: "schoolId, session, and term are required" });
    }

    const response = await generatePromotionSuggestions(schoolId, session, term, className || "");
    res.json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error generating promotion suggestions" });
  }
});

app.get("/promotion-history/:schoolId/:studentId", async (req, res) => {
  try {
    const { schoolId, studentId } = req.params;

    if (!schoolId || !studentId) {
      return res.status(400).json({ message: "School ID and student ID are required" });
    }

    const history = await PromotionHistory.find({ schoolId, studentId }).sort({ changedAt: -1 });
    res.json(history);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching promotion history" });
  }
});

app.get("/session-promotion-history/:schoolId", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const session = (req.query.session || "").trim();
    const query = { schoolId };
    if (session) query.session = session;

    const history = await PromotionHistory.find(query).sort({ changedAt: -1 });
    res.json(history);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching session promotion history" });
  }
});

app.get("/session-results/:schoolId/:session/:term", async (req, res) => {
  try {
    const { schoolId, session, term } = req.params;

    const results = await Result.find({ schoolId, session, term })
      .sort({ position: 1 });

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: "Error fetching session results" });
  }
});

/* =========================
   SUBSCRIPTION ROUTES
========================= */

app.get("/subscription/:schoolId", async (req, res) => {
  try {
    const schoolId = req.params.schoolId.trim();
    const subscription = await Subscription.findOne({ schoolId });

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    // Check if expired and auto-update status
    const now = new Date();
    if (subscription.status !== "cancelled" && subscription.endDate < now && subscription.status !== "expired") {
      subscription.status = "expired";
      await subscription.save();
    }

    // Get student count for limit calculation
    const studentCount = await Student.countDocuments({ schoolId });

    res.json({
      subscription,
      studentCount,
      daysRemaining: Math.max(0, Math.ceil((subscription.endDate - now) / (1000 * 60 * 60 * 24)))
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    res.status(500).json({ message: "Error fetching subscription" });
  }
});

app.post("/upgrade-plan", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();
    const newPlanName = (req.body.planName || "").trim();

    if (!schoolId || !newPlanName) {
      return res.status(400).json({ message: "School ID and plan name are required" });
    }

    // Plan configuration
    const planConfig = {
      "small": { limit: 300, price: 15000 },
      "medium": { limit: 1000, price: 35000 },
      "large": { limit: 3000, price: 75000 },
      "enterprise": { limit: Infinity, price: "custom" }
    };

    if (!planConfig[newPlanName]) {
      return res.status(400).json({ message: "Invalid plan name" });
    }

    const subscription = await Subscription.findOne({ schoolId });
    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    const config = planConfig[newPlanName];
    subscription.planName = newPlanName;
    subscription.status = "active";
    subscription.studentLimit = config.limit;
    subscription.startDate = new Date();
    subscription.endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    subscription.amountPaid = config.price;
    subscription.renewalDate = new Date();
    subscription.updatedAt = new Date();

    await subscription.save();

    res.json({
      message: "Plan upgraded successfully",
      subscription
    });
  } catch (error) {
    console.error("Error upgrading plan:", error);
    res.status(500).json({ message: "Error upgrading plan" });
  }
});

app.post("/renew-subscription", async (req, res) => {
  try {
    const schoolId = (req.body.schoolId || "").trim();

    if (!schoolId) {
      return res.status(400).json({ message: "School ID is required" });
    }

    const subscription = await Subscription.findOne({ schoolId });
    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    const now = new Date();
    const newEndDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from now

    subscription.status = "active";
    subscription.endDate = newEndDate;
    subscription.renewalDate = now;
    subscription.updatedAt = now;

    await subscription.save();

    res.json({
      message: "Subscription renewed successfully",
      subscription
    });
  } catch (error) {
    console.error("Error renewing subscription:", error);
    res.status(500).json({ message: "Error renewing subscription" });
  }
});

app.get("/subscription-status/:schoolId", async (req, res) => {
  try {
    const schoolId = req.params.schoolId.trim();
    const statusCheck = await checkSubscriptionStatus(schoolId);
    const limitCheck = await checkStudentLimit(schoolId);

    res.json({
      isActive: statusCheck.isActive,
      status: statusCheck.status,
      canAdd: limitCheck.canAdd,
      currentCount: limitCheck.currentCount,
      limit: limitCheck.limit,
      subscription: statusCheck.subscription || null
    });
  } catch (error) {
    console.error("Error checking subscription status:", error);
    res.status(500).json({ message: "Error checking subscription status" });
  }
});

/* =========================
   SERVER
========================= */

app.get("/verify-session", verifyToken, (req, res) => {
  res.json({
    message: "Session is valid",
    user: req.user
  });
});

// Process all promotion decisions for a given session (apply class changes and status updates)
app.post("/process-promotions", async (req, res) => {
  try {
    const { schoolId, session, processedBy } = req.body;

    if (!schoolId || !session) {
      return res.status(400).json({ message: "schoolId and session are required" });
    }

    const promotions = await StudentPromotion.find({ schoolId, session });

    const summary = { promoted: 0, repeat: 0, graduated: 0, withdrawn: 0 };

    for (const p of promotions) {
      if (p.promotionStatus === "promoted" && p.nextClass) {
        await Student.updateOne({ studentId: p.studentId }, { $set: { className: p.nextClass } });
        summary.promoted++;
      } else if (p.promotionStatus === "repeat") {
        // no change
        summary.repeat++;
      } else if (p.promotionStatus === "graduated") {
        await Student.updateOne(
          { studentId: p.studentId },
          { $set: { status: "graduated", isActivated: false, graduatedAt: new Date() } }
        );
        summary.graduated++;
      } else if (p.promotionStatus === "withdrawn") {
        await Student.updateOne(
          { studentId: p.studentId },
          { $set: { status: "withdrawn", isActivated: false, withdrawnAt: new Date() } }
        );
        summary.withdrawn++;
      }

      p.processedAt = new Date();
      p.processedBy = processedBy || "system";
      await p.save();
    }

    res.json({ message: "Promotion processing completed", summary });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error processing promotions" });
  }
});
/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
