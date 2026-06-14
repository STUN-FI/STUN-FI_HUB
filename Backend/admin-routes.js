/**
 * Super Admin Dashboard Routes
 * Platform Monitoring, School Management, Subscription Management, Support Tools, Analytics
 */

const mongoose = require("mongoose");

// =======================
// SCHEMAS FOR ADMIN FEATURES
// =======================

const activityLogSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    schoolName: String,
    action: { type: String, required: true }, // e.g., "Teacher added scores", "School published results"
    performedBy: String, // admin email or system
    performedByRole: String, // admin, teacher, system
    details: mongoose.Schema.Types.Mixed, // flexible for different action types
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

activityLogSchema.index({ schoolId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

const storageUsageSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true },
    usedGB: { type: Number, default: 0 },
    limitGB: { type: Number, default: 5 },
    lastCalculated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    schoolName: String,
    adminEmail: String,
    type: { type: String, enum: ["notification", "password_reset", "impersonation", "suspension", "activation"] },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
    action: String, // description of action taken
    read: { type: Boolean, default: false },
    impersonationToken: String,
    impersonationExpiry: Date,
    createdAt: { type: Date, default: Date.now, index: true },
    completedAt: Date
  },
  { timestamps: true }
);

const platformAnalyticsSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now, index: true },
    totalSchools: Number,
    activeSchools: Number,
    trialSchools: Number,
    expiredSchools: Number,
    totalStudents: Number,
    totalTeachers: Number,
    totalResults: Number,
    avgStudentsPerSchool: Number,
    avgTeachersPerSchool: Number
  },
  { timestamps: true }
);

// Models
const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
const StorageUsage = mongoose.model("StorageUsage", storageUsageSchema);
const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
const PlatformAnalytics = mongoose.model("PlatformAnalytics", platformAnalyticsSchema);

module.exports = function registerAdminRoutes(app, { School, Student, Teacher, Result, Subscription, Post }) {
  console.log("[adminRoutes] Starting to register admin routes");
  console.log("[adminRoutes] App type:", typeof app, "Has get method:", typeof app.get);

  // =======================
  // PLATFORM OVERVIEW STATS
  // =======================

  console.log("[adminRoutes] Registering /admin/platform-overview route");
  app.get("/admin/platform-overview", async (req, res) => {
    console.log("GET /admin/platform-overview called");
    try {
      const totalSchools = await School.countDocuments();
      const activeSchools = await School.countDocuments({ accountStatus: "active" });
      
      const subscriptions = await Subscription.find({});
      const trialSchools = subscriptions.filter(s => s.status === "trial").length;
      const expiredSchools = subscriptions.filter(s => s.status === "expired").length;

      const totalStudents = await Student.countDocuments();
      const totalTeachers = await Teacher.countDocuments();
      const totalResults = await Result.countDocuments();

      const avgStudentsPerSchool = totalSchools > 0 ? Math.round(totalStudents / totalSchools) : 0;
      const avgTeachersPerSchool = totalSchools > 0 ? Math.round(totalTeachers / totalSchools) : 0;

      res.json({
        success: true,
        data: {
          totalSchools,
          activeSchools,
          trialSchools,
          expiredSchools,
          totalStudents,
          totalTeachers,
          totalResults,
          avgStudentsPerSchool,
          avgTeachersPerSchool
        }
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching platform overview", error: error.message });
    }
  });

  // =======================
  // SCHOOLS MANAGEMENT
  // =======================

  console.log("[adminRoutes] Registering /admin/schools route");
  app.get("/admin/schools", async (req, res) => {
    console.log("[adminRoutes] GET /admin/schools called");
    try {
      const search = req.query.search || "";
      const statusFilter = req.query.status || "";
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const filter = search
        ? {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { email: { $regex: search, $options: "i" } },
              { id: { $regex: search, $options: "i" } }
            ]
          }
        : {};

      if (statusFilter) {
        filter.accountStatus = statusFilter;
      }

      const schools = await School.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const total = await School.countDocuments(filter);

      // Enrich with subscription and student data
      const enrichedSchools = await Promise.all(
        schools.map(async (school) => {
          const subscription = await Subscription.findOne({ schoolId: school.id });
          const studentCount = await Student.countDocuments({ schoolId: school.id });
          const teacherCount = await Teacher.countDocuments({ schoolId: school.id });

          return {
            ...school,
            accountStatus: school.accountStatus || "pending",
            subscription: subscription || null,
            studentCount,
            teacherCount,
            planName: subscription?.planName || "trial",
            status: subscription?.status || "trial",
            expiryDate: subscription?.endDate || null,
            studentLimit: subscription?.studentLimit || 0
          };
        })
      );

      res.json({
        success: true,
        data: enrichedSchools,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching schools", error: error.message });
    }
  });

  // Create a new school (minimal implementation)
  app.post("/admin/schools", async (req, res) => {
    try {
      const { name, email, password, motto } = req.body || {};
      if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      const exists = await School.findOne({ email });
      if (exists) return res.status(409).json({ success: false, message: "Email already registered" });

      // Generate a simple school id
      const id = `SCH${Date.now().toString().slice(-6)}`;

      const newSchool = await School.create({ id, name, email, password, motto, accountStatus: 'active', createdAt: new Date() });

      // Optionally create a basic subscription record if Subscription model exists
      try {
        if (Subscription) {
          await Subscription.create({ schoolId: id, planName: 'trial', status: 'trial', startDate: new Date(), endDate: null });
        }
      } catch (e) {
        console.log('Warning: could not create subscription for new school', e.message);
      }

      res.json({ success: true, data: newSchool });
    } catch (error) {
      console.log('Error creating school', error);
      res.status(500).json({ success: false, message: 'Error creating school', error: error.message });
    }
  });

  app.get("/admin/school/:schoolId", async (req, res) => {
    try {
      const { schoolId } = req.params;

      const school = await School.findOne({ id: schoolId }).lean();
      if (!school) return res.status(404).json({ message: "School not found" });

      const subscription = await Subscription.findOne({ schoolId });
      const studentCount = await Student.countDocuments({ schoolId });
      const teacherCount = await Teacher.countDocuments({ schoolId });
      const resultCount = await Result.countDocuments({ schoolId });
      const postCount = await Post.countDocuments({ schoolId });

      const students = await Student.find({ schoolId }).limit(5).lean();
      const teachers = await Teacher.find({ schoolId }).limit(5).lean();
      const sessions = await mongoose.connection.collection("academicsessions")
        .find({ schoolId })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        success: true,
        school: {
          ...school,
          studentCount,
          teacherCount,
          resultCount,
          postCount,
          subscription,
          recentStudents: students,
          recentTeachers: teachers,
          sessions
        }
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching school details", error: error.message });
    }
  });

  app.get("/admin/school/:schoolId/notifications", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const notifications = await SupportTicket.find({ schoolId, type: "notification" })
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        data: notifications.map((ticket) => ({
          _id: ticket._id,
          action: ticket.action || "Admin notification",
          status: ticket.status,
          adminEmail: ticket.adminEmail,
          read: ticket.read || false,
          createdAt: ticket.createdAt
        }))
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching admin notifications", error: error.message });
    }
  });

  app.post("/admin/school/:schoolId/mark-notifications-read", async (req, res) => {
    try {
      const { schoolId } = req.params;
      await SupportTicket.updateMany(
        { schoolId, type: "notification" },
        { read: true }
      );
      res.json({ success: true, message: "Notifications marked as read" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error marking notifications as read", error: error.message });
    }
  });

  app.post("/admin/school/:schoolId/suspend", async (req, res) => {
    try {
      const { schoolId } = req.params;

      await School.updateOne({ id: schoolId }, { accountStatus: "suspended" });
      await Subscription.updateOne({ schoolId }, { status: "cancelled" });

      await ActivityLog.create({
        schoolId,
        action: "School suspended",
        performedBy: "admin",
        performedByRole: "super_admin"
      });

      res.json({ success: true, message: "School suspended" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error suspending school", error: error.message });
    }
  });

  app.post("/admin/school/:schoolId/activate", async (req, res) => {
    try {
      const { schoolId } = req.params;

      await School.updateOne({ id: schoolId }, { accountStatus: "active" });
      await Subscription.updateOne({ schoolId }, { status: "active" });

      await ActivityLog.create({
        schoolId,
        action: "School activated",
        performedBy: "admin",
        performedByRole: "super_admin"
      });

      res.json({ success: true, message: "School activated" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error activating school", error: error.message });
    }
  });

  app.delete("/admin/school/:schoolId", async (req, res) => {
    try {
      const { schoolId } = req.params;

      // Delete the school
      const deleteResult = await School.deleteOne({ id: schoolId });
      if (deleteResult.deletedCount === 0) {
        return res.status(404).json({ success: false, message: "School not found" });
      }

      // Delete related subscriptions
      await Subscription.deleteMany({ schoolId });

      // Log the action
      await ActivityLog.create({
        schoolId,
        action: "School deleted",
        performedBy: "admin",
        performedByRole: "super_admin"
      });

      res.json({ success: true, message: "School deleted successfully" });
    } catch (error) {
      console.log("Error deleting school:", error);
      res.status(500).json({ success: false, message: "Error deleting school", error: error.message });
    }
  });

  app.post("/admin/school/:schoolId/upgrade-plan", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const { planName, studentLimit, price } = req.body;

      const subscription = await Subscription.findOne({ schoolId });
      if (!subscription) return res.status(404).json({ message: "Subscription not found" });

      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);

      await Subscription.updateOne(
        { schoolId },
        {
          planName,
          studentLimit,
          status: "active",
          startDate: new Date(),
          endDate,
          price
        }
      );

      await ActivityLog.create({
        schoolId,
        action: `Plan upgraded to ${planName}`,
        performedBy: "admin",
        performedByRole: "super_admin",
        details: { planName, studentLimit, price }
      });

      res.json({ success: true, message: "Plan upgraded" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error upgrading plan", error: error.message });
    }
  });

  // =======================
  // SCHOOL STUDENTS VIEW
  // =======================

  app.get("/admin/school/:schoolId/students", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const search = req.query.search || "";
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;

      const filter = { schoolId };
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { regNumber: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } }
        ];
      }

      const students = await Student.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const total = await Student.countDocuments(filter);

      res.json({
        success: true,
        data: students,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching students", error: error.message });
    }
  });

  // =======================
  // SCHOOL TEACHERS VIEW
  // =======================

  app.get("/admin/school/:schoolId/teachers", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const search = req.query.search || "";
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;

      const filter = { schoolId };
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } }
        ];
      }

      const teachers = await Teacher.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const total = await Teacher.countDocuments(filter);

      res.json({
        success: true,
        data: teachers,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching teachers", error: error.message });
    }
  });

  app.get("/admin/school/:schoolId/students/export", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const students = await Student.find({ schoolId }).lean();
      const headers = ["Student ID", "Name", "Email", "Class", "Reg Number", "Phone"];
      const rows = students.map((student) => [
        student.studentId || "",
        student.name || "",
        student.email || "",
        student.class || "",
        student.regNumber || "",
        student.phone || ""
      ]);

      const csv = [headers.join(","), ...rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${schoolId}-students.csv"`);
      res.send(csv);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error exporting students", error: error.message });
    }
  });

  app.get("/admin/school/:schoolId/teachers/export", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const teachers = await Teacher.find({ schoolId }).lean();
      const headers = ["Teacher ID", "Name", "Email", "Phone", "Subject"];
      const rows = teachers.map((teacher) => [
        teacher.teacherId || "",
        teacher.name || "",
        teacher.email || "",
        teacher.phone || "",
        teacher.subject || ""
      ]);

      const csv = [headers.join(","), ...rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${schoolId}-teachers.csv"`);
      res.send(csv);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error exporting teachers", error: error.message });
    }
  });

  app.get("/admin/school/:schoolId/subscription-history", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const history = await ActivityLog.find({ schoolId, action: /Plan|renew|subscription/i })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      res.json({ success: true, data: history });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching subscription history", error: error.message });
    }
  });

  // =======================
  // ACTIVITY LOG
  // =======================

  app.get("/admin/activity-log", async (req, res) => {
    try {
      const schoolId = req.query.schoolId;
      const filter = schoolId ? { schoolId } : {};
      const limit = parseInt(req.query.limit) || 100;

      const logs = await ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      res.json({ success: true, data: logs });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching activity log", error: error.message });
    }
  });

  // =======================
  // STORAGE USAGE
  // =======================

  app.get("/admin/school/:schoolId/storage", async (req, res) => {
    try {
      const { schoolId } = req.params;

      let storage = await StorageUsage.findOne({ schoolId });
      if (!storage) {
        storage = await StorageUsage.create({ schoolId });
      }

      res.json({
        success: true,
        data: {
          used: storage.usedGB,
          limit: storage.limitGB,
          percentage: Math.round((storage.usedGB / storage.limitGB) * 100)
        }
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching storage", error: error.message });
    }
  });

  // =======================
  // ANALYTICS
  // =======================

  app.get("/admin/analytics/growth", async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const result = [];

      // Generate growth data for each day in the past N days
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setDate(endOfDay.getDate() + 1);

        // Count schools created up to this date
        const totalSchools = await School.countDocuments({
          createdAt: { $lt: endOfDay }
        });

        result.push({
          date: date.toISOString().split('T')[0],
          totalSchools: totalSchools
        });
      }

      res.json({ success: true, data: result });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching analytics", error: error.message });
    }
  });

  app.get("/admin/analytics/subscription-distribution", async (req, res) => {
    try {
      const distribution = await Subscription.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]);

      res.json({ success: true, data: distribution });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching subscription distribution", error: error.message });
    }
  });

  // =======================
  // SUPPORT FEATURES
  // =======================

  app.post("/admin/school/:schoolId/send-notification", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const { message, subject } = req.body;

      await SupportTicket.create({
        schoolId,
        type: "notification",
        status: "completed",
        action: message
      });

      // TODO: Integrate with email service to send notification

      res.json({ success: true, message: "Notification sent" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error sending notification", error: error.message });
    }
  });

  app.get("/admin/school/:schoolId/notifications", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const notifications = await SupportTicket.find({ schoolId, type: "notification" })
        .sort({ createdAt: -1 })
        .lean();

      res.json({ success: true, data: notifications });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching notifications", error: error.message });
    }
  });

  app.post("/admin/school/:schoolId/reset-password", async (req, res) => {
    try {
      const { schoolId } = req.params;

      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-12);

      await SupportTicket.create({
        schoolId,
        type: "password_reset",
        status: "completed",
        action: `Password reset initiated`
      });

      // TODO: Update school password and send email

      res.json({
        success: true,
        message: "Password reset initiated",
        tempPassword
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error resetting password", error: error.message });
    }
  });

  app.post("/admin/school/:schoolId/impersonate", async (req, res) => {
    try {
      const { schoolId } = req.params;
      const school = await School.findOne({ id: schoolId });

      if (!school) return res.status(404).json({ message: "School not found" });

      // Generate impersonation token
      const impersonationToken = require("crypto").randomBytes(32).toString("hex");
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 2); // 2-hour window

      await SupportTicket.create({
        schoolId,
        type: "impersonation",
        status: "completed",
        impersonationToken,
        impersonationExpiry: expiry,
        action: `Impersonation initiated`
      });

      res.json({
        success: true,
        message: "Impersonation token generated",
        token: impersonationToken,
        schoolId,
        schoolName: school.name,
        expiresIn: 2 * 60 * 60 * 1000 // 2 hours in ms
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error initiating impersonation", error: error.message });
    }
  });

  // =======================
  // LOG ACTIVITY HELPER
  // =======================

  global.logActivity = async (schoolId, action, performedBy, performedByRole, details = {}) => {
    try {
      const school = await School.findOne({ id: schoolId });
      await ActivityLog.create({
        schoolId,
        schoolName: school?.name,
        action,
        performedBy,
        performedByRole,
        details
      });
    } catch (error) {
      console.log("Error logging activity:", error);
    }
  };
};
