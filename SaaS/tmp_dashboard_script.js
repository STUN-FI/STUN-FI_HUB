
const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "login.html";
}

const school = JSON.parse(localStorage.getItem("school") || "null");
const currentSchoolId = school?.schoolId || school?.id || "";
let students = [];
let currentViewSubjectStudentId = "";
let currentSubjectStudentId = "";
let teachers = [];
let uploadedLogoData = "";
let editingStudentOldReg = "";
let deletingStudentReg = "";
let deletingTeacherId = "";
let editingTeacherId = "";
let showingAllActivities = false;
let currentScoreStudent = null;
let resultStatusMap = {};
let paymentStatusMap = {};

if (!school || !currentSchoolId) {
  window.location.href = "login.html";
}

   let currentAssignTeacherId = "";

function openAssignModal(teacherId) {
  currentAssignTeacherId = teacherId;
  document.getElementById("assignModal").classList.add("active");
}

function closeAssignModal() {
  document.getElementById("assignModal").classList.remove("active");
  currentAssignTeacherId = "";
}

async function addAssignment() {
  const subject = document.getElementById("assignSubject").value.trim();
  const className = document.getElementById("assignClass").value.trim();
  const arm = document.getElementById("assignArm").value.trim();

  if (!subject || !className) {
    toast("Subject and class required", "error");
    return;
  }

  try {
    const response = await fetch("http://localhost:3000/add-teacher-assignment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        teacherId: currentAssignTeacherId,
        subject,
        className,
        arm
      })
    });

    const data = await response.json();

    if (response.ok) {
      closeAssignModal();
      await loadTeachers();
      toast("Assignment added", "success");
    } else {
      toast(data.message || "Error adding assignment", "error");
    }

  } catch (err) {
    console.log(err);
    toast("Server error", "error");
  }
}

function toast(message, type = "info") {
  const wrap = document.getElementById("toastWrap");
  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.innerText = message;
  wrap.appendChild(div);
  setTimeout(() => div.remove(), 2800);
}

function getInitials(name) {
  return (name || "School")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("");
}

function adjustColor(hex, amount) {
  let col = (hex || "#66cccc").replace("#", "");
  let num = parseInt(col, 16);

  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return "#" + (r << 16 | g << 8 | b).toString(16).padStart(6, "0");
}

function createFallbackLogo(name, color) {
  const initials = getInitials(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="100%" height="100%" fill="${color || "#66cccc"}"/>
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="62" fill="white" font-weight="bold">${initials}</text>
    </svg>
  `;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function showTab(tabName, btn) {
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.remove("active");
  });

  document.querySelectorAll(".tab-btn").forEach(button => {
    button.classList.remove("active");
  });

  document.getElementById(tabName + "Tab").classList.add("active");
  btn.classList.add("active");
}

function toggleSection(buttonId, contentId) {
  const button = document.getElementById(buttonId);
  const content = document.getElementById(contentId);

  if (button.classList.contains("collapsed")) {
    button.classList.remove("collapsed");
    content.style.display = "block";
  } else {
    button.classList.add("collapsed");
    content.style.display = "none";
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const layout = document.querySelector(".layout");
  const overlay = document.getElementById("mobileOverlay");

  const isMobile = window.innerWidth <= 1050;

  if (isMobile) {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  } else {
    sidebar.classList.toggle("closed");
    layout.classList.toggle("closed");
  }
  localStorage.setItem("sidebarClosed", sidebar.classList.contains("closed"));
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const layout = document.querySelector(".layout");
  const overlay = document.getElementById("mobileOverlay");

  sidebar.classList.remove("open");
  overlay.classList.remove("show");

  sidebar.classList.add("closed");
  layout.classList.add("closed");
}

window.addEventListener("load", () => {
  const isClosed = localStorage.getItem("sidebarClosed") === "true";

  if (isClosed && window.innerWidth > 1050) {
    document.getElementById("sidebar").classList.add("closed");
    document.querySelector(".layout").classList.add("closed");
  }
});

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("school");
  window.location.href = "login.html";
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem("dashboardTheme", document.body.classList.contains("dark") ? "dark" : "light");
  updateThemeButton();
  toast(document.body.classList.contains("dark") ? "Dark mode enabled" : "Light mode enabled", "success");
}

function updateThemeButton() {
  const btn = document.getElementById("themeToggle");
  btn.innerText = document.body.classList.contains("dark") ? "☀️ Light Mode" : "🌙 Dark Mode";
}

function applyAccentColor() {
  const color = document.getElementById("accentColorInput").value || "#66cccc";
  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--accent-hover", adjustColor(color, -18));
  toast("Accent color applied", "success");
}

function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    uploadedLogoData = e.target.result;
    document.getElementById("profilePreviewLogo").src = uploadedLogoData;
    document.getElementById("sidebarSchoolLogo").src = uploadedLogoData;
    toast("School logo selected", "info");
  };
  reader.readAsDataURL(file);
}

function addActivity(title, message) {
  const key = `school_activity_${currentSchoolId}`;
  const list = JSON.parse(localStorage.getItem(key) || "[]");

  list.unshift({
    title,
    message,
    time: new Date().toLocaleString()
  });

  localStorage.setItem(key, JSON.stringify(list.slice(0, 12)));
  showingAllActivities = false;
  renderActivities();
}

function renderActivities() {
  const key = `school_activity_${currentSchoolId}`;
  const activities = JSON.parse(localStorage.getItem(key) || "[]");
  const wrap = document.getElementById("activityList");
  wrap.innerHTML = "";

  if (!activities.length) {
    wrap.innerHTML = `<div class="empty-state">No recent activities yet.</div>`;
    return;
  }

  const toShow = showingAllActivities ? activities : activities.slice(0, 1);

  toShow.forEach((item) => {
    const div = document.createElement("div");
    div.className = "activity-item";
    div.innerHTML = `
      <div class="activity-title">${item.title}</div>
      <div class="activity-meta">${item.message}<br>${item.time}</div>
    `;
    wrap.appendChild(div);
  });

  if (activities.length > 1 && !showingAllActivities) {
    const btn = document.createElement("button");
    btn.className = "secondary-btn show-more-btn";
    btn.innerText = "Show More ▼";
    btn.onclick = () => {
      showingAllActivities = true;
      renderActivities();
    };
    wrap.appendChild(btn);
  }
}

function applySchoolProfile(profile) {
  const color = profile.accentColor || "#66cccc";
  const logo = profile.logo || profile.schoolLogo || createFallbackLogo(profile.name || profile.schoolName || "School", color);
  const name = profile.name || profile.schoolName || "Your School";
  const email = profile.email || profile.schoolEmail || "Not set";
  const motto = profile.motto || profile.schoolMotto || "No motto yet.";
  const schoolId = profile.id || profile.schoolId || currentSchoolId;

  document.getElementById("welcomeHeading").innerText = "Welcome, " + name;
  document.getElementById("welcomeSubtext").innerText = motto || "Manage students, teachers, and school profile.";
  document.getElementById("schoolInfo").innerText = "School ID: " + schoolId;

  document.getElementById("sidebarSchoolLogo").src = logo;
  document.getElementById("sidebarSchoolName").innerText = name;
  document.getElementById("sidebarSchoolId").innerText = "ID: " + schoolId;
  document.getElementById("sidebarSchoolMotto").innerText = motto;

  document.getElementById("profilePreviewLogo").src = logo;
  document.getElementById("profilePreviewName").innerText = name;
  document.getElementById("profilePreviewEmail").innerText = email;
  document.getElementById("profilePreviewMotto").innerText = motto;
  document.getElementById("settingsSchoolId").innerText = schoolId;

  document.getElementById("schoolNameInput").value = name;
  document.getElementById("schoolEmailInput").value = email === "Not set" ? "" : email;
  document.getElementById("schoolMottoInput").value = motto === "No motto yet." ? "" : motto;
  document.getElementById("accentColorInput").value = color;

  applyAccentColor();
}

async function loadSchoolProfile() {
  try {
    const response = await fetch(
      "http://localhost:3000/school-profile/" + encodeURIComponent(currentSchoolId),
      {
        headers: {
          "Authorization": "Bearer " + localStorage.getItem("token")
        }
      }
    );

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("school");
      window.location.href = "login.html";
      return;
    }

    const data = await response.json();

    if (!response.ok) return;

    uploadedLogoData = data.logo || "";
    applySchoolProfile(data);
  } catch (error) {
    console.log(error);
  }
}

async function saveSchoolProfile() {
  const name = document.getElementById("schoolNameInput").value.trim();
  const email = document.getElementById("schoolEmailInput").value.trim();
  const motto = document.getElementById("schoolMottoInput").value.trim();
  const accentColor = document.getElementById("accentColorInput").value;

  if (!name || !email) {
    toast("School name and email are required", "error");
    return;
  }

  try {
    const response = await fetch("http://localhost:3000/update-school-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolId: currentSchoolId,
        name,
        email,
        motto,
        logo: uploadedLogoData || "",
        accentColor
      })
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem("school", JSON.stringify({
        schoolId: data.school.id,
        id: data.school.id,
        name: data.school.name,
        motto: data.school.motto,
        logo: data.school.logo,
        accentColor: data.school.accentColor
      }));

      applySchoolProfile(data.school);
      addActivity("Profile Updated", "School profile details were updated.");
      toast("Profile saved successfully", "success");
    } else {
      toast(data.message || "Could not save profile", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error saving profile", "error");
  }
}

async function addStudent() {
  const name = document.getElementById("studentName").value.trim();
  const regNumber = document.getElementById("regNumber").value.trim();
  const className = document.getElementById("className").value.trim();
  const arm = document.getElementById("arm").value.trim();

  if (!name || !regNumber || !className || !arm) {
    toast("Please fill all student fields", "error");
    return;
  }

  try {
    const response = await fetch("http://localhost:3000/add-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        regNumber,
        className,
        arm,
        schoolId: currentSchoolId
      })
    });

    const data = await response.json();

    if (response.ok) {
      document.getElementById("studentName").value = "";
      document.getElementById("regNumber").value = "";
      document.getElementById("className").value = "";
      document.getElementById("arm").value = "";
      await loadStudents();
      addActivity("Student Added", `${name} (${regNumber}) was added.`);
      toast("Student added successfully", "success");
    } else {
      toast(data.message || "Could not add student", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error adding student", "error");
  }
}

async function loadStudents() {
  const studentList = document.getElementById("studentList");

  if (studentList) {
    studentList.innerHTML = `<div class="empty-state">Loading students...</div>`;
  }

  try {
    const response = await fetch(
      "http://localhost:3000/school/" + encodeURIComponent(currentSchoolId),
      {
        headers: {
          "Authorization": "Bearer " + localStorage.getItem("token")
        }
      }
    );

    console.log("Response status:", response.status);

    const data = await response.json();
    console.log(data);

    if (!response.ok) {
      toast(data.message || "Could not load students", "error");
      studentList.innerHTML = `<div class="empty-state">Could not load students.</div>`;
      return;
    }

    students = Array.isArray(data) ? data : data.students || [];

    renderStudents();
    updateStats();

    try {
      await loadResultStatuses();
      await loadPaymentStatuses();
      renderStudents();
      updateStats();
    } catch (statusError) {
      console.log("Status loading failed:", statusError);
    }

  } catch (error) {
    console.log(error);
    toast("Error loading students", "error");

    if (studentList) {
      studentList.innerHTML = `<div class="empty-state">Error loading students.</div>`;
    }
  }
}

function escapeForAttr(value) {
  return String(value || "").replace(/'/g, "\\'");
}

function getClassStatusCounts(groupStudents) {
  let assigned = 0;
  let locked = 0;
  let pending = 0;

  groupStudents.forEach((student) => {
    const status = (resultStatusMap[student.studentId] || "").toLowerCase();
    if (status.includes("assigned")) {
      assigned += 1;
    } else if (status.includes("locked")) {
      locked += 1;
    } else {
      pending += 1;
    }
  });

  return { assigned, pending, locked };
}

function renderStudents() {
  const studentList = document.getElementById("studentList");
  const search = document.getElementById("studentSearch").value.trim().toLowerCase();

  const filtered = students.filter((student) => (
    student.name.toLowerCase().includes(search) ||
    student.regNumber.toLowerCase().includes(search) ||
    (student.className || "").toLowerCase().includes(search) ||
    (student.arm || "").toLowerCase().includes(search)
  ));

  studentList.innerHTML = "";

  if (!filtered.length) {
    studentList.innerHTML = `<div class="empty-state">No students found.</div>`;
    return;
  }

  const grouped = filtered.reduce((map, student) => {
    const className = student.className || "";
    const arm = student.arm || "";
    const key = className + "\u0000" + arm;

    if (!map[key]) {
      map[key] = {
        className,
        displayName: className || "Unassigned",
        arm,
        students: []
      };
    }

    map[key].students.push(student);
    return map;
  }, {});

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    const [aClass, aArm] = a.split("\u0000");
    const [bClass, bArm] = b.split("\u0000");

    if (aClass !== bClass) return aClass.localeCompare(bClass);
    return aArm.localeCompare(bArm);
  });

  groupKeys.forEach((key) => {
    const group = grouped[key];
    const { assigned, pending, locked } = getClassStatusCounts(group.students);
    const groupLabel = `${group.displayName}${group.arm ? ` ${group.arm}` : ""}`;

    const li = document.createElement("li");
    li.className = "class-group";

    const header = document.createElement("div");
    header.className = "class-group-header";

    const headerInfo = document.createElement("div");
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = groupLabel;

    const summary = document.createElement("div");
    summary.className = "class-group-summary";
    summary.innerHTML = `
      <span class="class-pill">${group.students.length} students</span>
      <span class="status-pill assigned">Assigned ${assigned}</span>
      <span class="status-pill pending">Pending ${pending}</span>
      <span class="status-pill locked">Locked ${locked}</span>
    `;

    headerInfo.appendChild(title);
    headerInfo.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "class-group-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "class-group-toggle";
    toggleBtn.type = "button";
    toggleBtn.textContent = "▼ Collapse";
    toggleBtn.addEventListener("click", () => toggleClassGroup(toggleBtn));

    const assignBtn = document.createElement("button");
    assignBtn.className = "mini-btn assign-btn";
    assignBtn.type = "button";
    assignBtn.textContent = "Assign Class Results";
    assignBtn.addEventListener("click", () => quickAssignClassResults(group.className, group.arm));

    actions.appendChild(toggleBtn);
    actions.appendChild(assignBtn);

    header.appendChild(headerInfo);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = "class-group-body";

    group.students.forEach((student) => {
      const row = document.createElement("div");
      row.className = "item-row";

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = getInitials(student.name);

      const details = document.createElement("div");

      const studentTitle = document.createElement("div");
      studentTitle.className = "item-title";
      studentTitle.textContent = student.name;

      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.innerHTML = `
        Reg Number: ${student.regNumber}<br>
        Class: ${student.className || "-"} ${student.arm || ""}<br>
        Email: ${student.email || "Not activated yet"}
      `;

      const statusContainer = document.createElement("div");
      statusContainer.innerHTML = getResultStatusBadge(student.studentId) + getPaymentBadge(student.studentId);

      const actionWrap = document.createElement("div");
      actionWrap.className = "item-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "mini-btn";
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openStudentEdit(student.regNumber, student.name, student.className, student.arm));

      const scoreBtn = document.createElement("button");
      scoreBtn.className = "mini-btn";
      scoreBtn.type = "button";
      scoreBtn.textContent = "View Scores";
      scoreBtn.addEventListener("click", () => openScoreModal(student.studentId, student.name));

      const assignStudentBtn = document.createElement("button");
      assignStudentBtn.className = "mini-btn assign-btn";
      assignStudentBtn.type = "button";
      assignStudentBtn.textContent = "Assign Result";
      assignStudentBtn.addEventListener("click", () => quickAssignResult(student.studentId, student.name));

      const unlockBtn = document.createElement("button");
      unlockBtn.className = "mini-btn";
      unlockBtn.type = "button";
      unlockBtn.style.background = "#3b82f6";
      unlockBtn.style.color = "white";
      unlockBtn.textContent = "Unlock Result";
      unlockBtn.addEventListener("click", () => quickUnlockResult(student.studentId, student.name));

      const lockBtn = document.createElement("button");
      lockBtn.className = "mini-btn";
      lockBtn.type = "button";
      lockBtn.style.background = "#f59e0b";
      lockBtn.style.color = "white";
      lockBtn.textContent = "Lock Again";
      lockBtn.addEventListener("click", () => quickLockResult(student.studentId, student.name));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "mini-btn mini-danger";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => openStudentDelete(student.regNumber, student.name));

      const paidBtn = document.createElement("button");
      paidBtn.className = "mini-btn";
      paidBtn.type = "button";
      paidBtn.style.background = "#16a34a";
      paidBtn.style.color = "white";
      paidBtn.textContent = "Mark Paid";
      paidBtn.addEventListener("click", () => markStudentPaid(student.studentId, student.name));

      const unpaidBtn = document.createElement("button");
      unpaidBtn.className = "mini-btn";
      unpaidBtn.type = "button";
      unpaidBtn.style.background = "#dc2626";
      unpaidBtn.style.color = "white";
      unpaidBtn.textContent = "Mark Unpaid";
      unpaidBtn.addEventListener("click", () => markStudentUnpaid(student.studentId, student.name));

      const assignSubjectBtn = document.createElement("button");
      assignSubjectBtn.className = "mini-btn";
      assignSubjectBtn.type = "button";
      assignSubjectBtn.style.background = "#8b5cf6";
      assignSubjectBtn.style.color = "white";
      assignSubjectBtn.textContent = "Assign Subjects";
      assignSubjectBtn.addEventListener("click", () => openSubjectModal(student.studentId, student.name));

      const viewSubjectsBtn = document.createElement("button");
      viewSubjectsBtn.className = "mini-btn";
      viewSubjectsBtn.type = "button";
      viewSubjectsBtn.style.background = "#0ea5e9";
      viewSubjectsBtn.style.color = "white";
      viewSubjectsBtn.textContent = "View Subjects";
      viewSubjectsBtn.addEventListener("click", () => openViewSubjectModal(student.studentId, student.name));

      actionWrap.appendChild(editBtn);
      actionWrap.appendChild(scoreBtn);
      actionWrap.appendChild(assignStudentBtn);
      actionWrap.appendChild(unlockBtn);
      actionWrap.appendChild(lockBtn);
      actionWrap.appendChild(deleteBtn);
      actionWrap.appendChild(paidBtn);
      actionWrap.appendChild(unpaidBtn);
      actionWrap.appendChild(assignSubjectBtn);
      actionWrap.appendChild(viewSubjectsBtn);

      details.appendChild(studentTitle);
      details.appendChild(meta);
      details.appendChild(statusContainer);
      details.appendChild(actionWrap);

      row.appendChild(avatar);
      row.appendChild(details);
      body.appendChild(row);
    });

    li.appendChild(header);
    li.appendChild(body);
    studentList.appendChild(li);
  });
}

function toggleClassGroup(button) {
  const group = button.closest('.class-group');
  if (!group) return;

  group.classList.toggle('collapsed');
  const isCollapsed = group.classList.contains('collapsed');
  button.textContent = isCollapsed ? '▶ Expand' : '▼ Collapse';
}

async function quickAssignClassResults(className, arm) {
  const session = document.getElementById("mainSessionSelect")?.value || "2025/2026";
  const term = document.getElementById("mainTermSelect")?.value || "1st Term";
  const groupStudents = students.filter((student) =>
    (student.className || "") === className &&
    (student.arm || "") === arm
  );

  if (!groupStudents.length) {
    toast("No students found for this class.", "error");
    return;
  }

  const groupLabel = `${className || "Unassigned"}${arm ? ` ${arm}` : ""}`;
  const proceed = confirm(`Assign final result for ${groupStudents.length} students in ${groupLabel} (${session}, ${term})?`);
  if (!proceed) return;

  let successCount = 0;
  let failureCount = 0;

  for (const student of groupStudents) {
    try {
      const response = await fetch("http://localhost:3000/assign-student-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.studentId,
          schoolId: currentSchoolId,
          session,
          term
        })
      });

      if (response.ok) {
        successCount += 1;
      } else {
        failureCount += 1;
      }
    } catch (error) {
      failureCount += 1;
    }
  }

  await loadResultStatuses();
  renderStudents();

  if (failureCount) {
    toast(`Assigned ${successCount}/${groupStudents.length} students. ${failureCount} failed.`, "error");
  } else {
    toast(`Assigned results for ${successCount} students.`, "success");
  }
}

function openStudentEdit(reg, name, className, arm) {
  editingStudentOldReg = reg;
  document.getElementById("editStudentName").value = name;
  document.getElementById("editStudentReg").value = reg;
  document.getElementById("editStudentClass").value = className;
  document.getElementById("editStudentArm").value = arm;
  document.getElementById("studentEditModal").classList.add("active");
}

function closeStudentEdit() {
  document.getElementById("studentEditModal").classList.remove("active");
  editingStudentOldReg = "";
}

function openSubjectModal(studentId, studentName) {
  currentSubjectStudentId = studentId;
  document.getElementById("subjectModalTitle").innerText = "Assign Subjects - " + studentName;
  document.getElementById("subjectListInput").value = "";
  document.getElementById("subjectModal").classList.add("active");
}

function closeSubjectModal() {
  document.getElementById("subjectModal").classList.remove("active");
  currentSubjectStudentId = "";
}

async function openViewSubjectModal(studentId, studentName) {
  currentViewSubjectStudentId = studentId;
  document.getElementById("viewSubjectModalTitle").innerText = "Subjects Offered - " + studentName;
  document.getElementById("viewSubjectModal").classList.add("active");

  await loadStudentSubjects();
}

function closeViewSubjectModal() {
  document.getElementById("viewSubjectModal").classList.remove("active");
  currentViewSubjectStudentId = "";
}

async function loadStudentSubjects() {
  const list = document.getElementById("viewSubjectList");

  list.innerHTML = `<div class="empty-state">Loading subjects...</div>`;

  try {
    const response = await fetch(
      "http://localhost:3000/student-subjects/" +
      encodeURIComponent(currentViewSubjectStudentId) +
      "?schoolId=" +
      encodeURIComponent(currentSchoolId) +
      "&session=" +
      encodeURIComponent(document.getElementById("mainSessionSelect").value) +
      "&term=" +
      encodeURIComponent(document.getElementById("mainTermSelect").value)
    );

    const subjects = await response.json();

    if (!response.ok) {
      list.innerHTML = `<div class="empty-state">Could not load subjects.</div>`;
      return;
    }

    if (!subjects.length) {
      list.innerHTML = `<div class="empty-state">No subjects assigned yet.</div>`;
      return;
    }

    list.innerHTML = "";

    subjects.forEach(item => {
      const div = document.createElement("div");
      div.className = "score-card";
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
          <strong>${item.subject}</strong>
          <button class="mini-btn mini-danger" onclick="deleteStudentSubject('${item.subject.replace(/'/g, "\\'")}')">Delete</button>
        </div>
      `;
      list.appendChild(div);
    });

  } catch (error) {
    console.log(error);
    list.innerHTML = `<div class="empty-state">Error loading subjects.</div>`;
  }
}

async function deleteStudentSubject(subject) {
  if (!confirm("Remove " + subject + " from this student?")) return;

  try {
    const response = await fetch("http://localhost:3000/delete-student-subject", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        studentId: currentViewSubjectStudentId,
        schoolId: currentSchoolId,
        subject,
        session: document.getElementById("mainSessionSelect").value,
        term: document.getElementById("mainTermSelect").value
      })
    });

    const data = await response.json();

    if (response.ok) {
      toast("Subject removed", "success");
      await loadStudentSubjects();
    } else {
      toast(data.message || "Could not remove subject", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error removing subject", "error");
  }
}

async function saveStudentSubjects() {
  const subjectsText = document.getElementById("subjectListInput").value.trim();

  const subjects = subjectsText
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  if (!subjects.length) {
    toast("Enter at least one subject", "error");
    return;
  }

  try {
    const response = await fetch("http://localhost:3000/assign-subjects-to-student", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        studentId: currentSubjectStudentId,
        schoolId: currentSchoolId,
        subjects,
        session: document.getElementById("mainSessionSelect").value,
        term: document.getElementById("mainTermSelect").value
      })
    });

    const data = await response.json();

    if (response.ok) {
      closeSubjectModal();
      toast("Subjects assigned successfully", "success");
    } else {
      toast(data.message || "Could not assign subjects", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error assigning subjects", "error");
  }
}

async function saveStudentEdit() {
  const newName = document.getElementById("editStudentName").value.trim();
  const newRegNumber = document.getElementById("editStudentReg").value.trim();
  const className = document.getElementById("editStudentClass").value.trim();
  const arm = document.getElementById("editStudentArm").value.trim();

  if (!newName || !newRegNumber || !className || !arm) {
    toast("Please fill all edit fields", "error");
    return;
  }

  try {
    const response = await fetch("http://localhost:3000/edit-student", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldRegNumber: editingStudentOldReg,
        newName,
        newRegNumber,
        className,
        arm,
        schoolId: currentSchoolId
      })
    });

    const data = await response.json();

    if (response.ok) {
      closeStudentEdit();
      await loadStudents();
      addActivity("Student Updated", `${newName} (${newRegNumber}) was updated.`);
      toast("Student updated successfully", "success");
    } else {
      toast(data.message || "Could not update student", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error updating student", "error");
  }
}

async function loadPaymentStatuses() {
  const session = document.getElementById("mainSessionSelect")?.value || "2025/2026";
  const term = document.getElementById("mainTermSelect")?.value || "1st Term";

  paymentStatusMap = {};

  await Promise.all(
    students.map(async (student) => {
      try {
        const response = await fetch(
          "http://localhost:3000/student-payment-status/" +
          encodeURIComponent(student.studentId) +
          "?schoolId=" + encodeURIComponent(currentSchoolId) +
          "&session=" + encodeURIComponent(session) +
          "&term=" + encodeURIComponent(term)
        );

        const data = await response.json();

        if (response.ok) {
          paymentStatusMap[student.studentId] = data;
        } else {
          paymentStatusMap[student.studentId] = {
            paymentStatus: "unpaid",
            amount: 0,
            resultReady: false,
            isUnlocked: false
          };
        }
      } catch (error) {
        console.log(error);
        paymentStatusMap[student.studentId] = {
          paymentStatus: "unpaid",
          amount: 0,
          resultReady: false,
          isUnlocked: false
        };
      }
    })
  );
}

function getPaymentBadge(studentId) {
  const info = paymentStatusMap[studentId];

  if (!info) {
    return `<span class="payment-status-badge payment-pending">Checking Payment...</span>`;
  }

  if (info.paymentStatus === "paid") {
    return `<span class="payment-status-badge payment-paid">Paid</span>`;
  }

  if (info.paymentStatus === "pending") {
    return `<span class="payment-status-badge payment-pending">Pending</span>`;
  }

  return `<span class="payment-status-badge payment-unpaid">Unpaid</span>`;
}

function openStudentDelete(reg, name) {
  deletingStudentReg = reg;
  document.getElementById("studentDeleteText").innerText = `Delete ${name} (${reg})?`;
  document.getElementById("studentDeleteModal").classList.add("active");
}

function closeStudentDelete() {
  document.getElementById("studentDeleteModal").classList.remove("active");
  deletingStudentReg = "";
}

async function confirmStudentDelete() {
  try {
    const response = await fetch("http://localhost:3000/delete-student", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regNumber: deletingStudentReg,
        schoolId: currentSchoolId
      })
    });

    const data = await response.json();

    if (response.ok) {
      closeStudentDelete();
      await loadStudents();
      addActivity("Student Deleted", `${deletingStudentReg} was removed.`);
      toast("Student deleted successfully", "success");
    } else {
      toast(data.message || "Could not delete student", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error deleting student", "error");
  }
}

async function addTeacher() {
  const name = document.getElementById("teacherName").value.trim();
  const email = document.getElementById("teacherEmail").value.trim();

  if (!name || !email) {
    toast("Please fill all teacher fields", "error");
    return;
  }

  try {
    const response = await fetch(
      "http://localhost:3000/add-teacher",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          email,
          schoolId: currentSchoolId
        })
      }
    );

    const data = await response.json();

    if (response.ok) {

      document.getElementById("teacherName").value = "";
      document.getElementById("teacherEmail").value = "";

      await loadTeachers();

      toast(
        "Teacher added successfully",
        "success"
      );

    } else {
      toast(data.message, "error");
    }

  } catch (err) {
    console.log(err);
  }
}

async function loadTeachers() {
  try {
    const response = await fetch("http://localhost:3000/teachers/" + encodeURIComponent(currentSchoolId));
    const data = await response.json();
    if (!response.ok) return;

    teachers = data;
    renderTeachers();
    updateStats();
  } catch (error) {
    console.log(error);
  }
}

function renderTeachers() {
  const teacherList = document.getElementById("teacherList");
  const search = document.getElementById("teacherSearch").value.trim().toLowerCase();

  const filtered = teachers.filter((teacher) => (
    teacher.name.toLowerCase().includes(search) ||
    teacher.email.toLowerCase().includes(search)
  ));

  teacherList.innerHTML = "";

  if (!filtered.length) {
    teacherList.innerHTML = `<div class="empty-state">No teachers found.</div>`;
    return;
  }

  filtered.forEach((teacher) => {

    let assignmentsHTML = "";

    if (teacher.assignments && teacher.assignments.length) {
      assignmentsHTML = teacher.assignments.map(a => `
        <div class="component-chip">
          ${a.subject} — ${a.className} ${a.arm || ""}
        </div>
      `).join("");
    } else {
      assignmentsHTML = `<div class="component-chip">No assignments</div>`;
    }

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="item-row">
        <div class="avatar">${getInitials(teacher.name)}</div>
        <div>
          <div class="item-title">${teacher.name}</div>

          <div class="item-meta">
            Email: ${teacher.email}
          </div>

          <div style="margin-top:8px;">
            ${assignmentsHTML}
          </div>

          <div class="item-actions">

            <button class="mini-btn assign-btn"
              onclick="openAssignModal('${teacher.teacherId}')">
              Add Assignment
            </button>

            <button class="mini-btn"
              onclick="openTeacherEdit(
                '${teacher.teacherId}',
                '${teacher.name.replace(/'/g, "\\'")}',
                '${(teacher.email || "").replace(/'/g, "\\'")}',
                '',
                '',
                ''
              )">
              Edit
            </button>

            <button
              onclick="
              viewTeacherSubjects(
              '${teacher.teacherId}'
              )
              ">
              View Subjects
            </button>

            <button class="mini-btn mini-danger"
              onclick="openTeacherDelete('${teacher.teacherId}', '${teacher.name.replace(/'/g, "\\'")}')">
              Delete
            </button>

          </div>
        </div>
      </div>
    `;

    teacherList.appendChild(li);
  });
}

function openTeacherEdit(
  teacherId,
  name,
  email
) {

  editingTeacherId = teacherId;

  document.getElementById(
    "editTeacherName"
  ).value = name;

  document.getElementById(
    "editTeacherEmail"
  ).value = email;

  document
    .getElementById(
      "teacherEditModal"
    )
    .classList
    .add("active");
}

function closeTeacherEdit() {
  document.getElementById("teacherEditModal").classList.remove("active");
  editingTeacherId = "";
}

async function saveTeacherEdit() {

  const name =
    document
      .getElementById(
        "editTeacherName"
      )
      .value
      .trim();

  const email =
    document
      .getElementById(
        "editTeacherEmail"
      )
      .value
      .trim();

  if (!name || !email) {
    toast(
      "Fill all fields",
      "error"
    );
    return;
  }

  try {

    const response =
      await fetch(
        "http://localhost:3000/edit-teacher",
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              teacherId:
                editingTeacherId,

              name,
              email
            })
        }
      );

    const data =
      await response.json();

    if (response.ok) {

      closeTeacherEdit();

      await loadTeachers();

      toast(
        "Teacher updated",
        "success"
      );

    } else {

      toast(
        data.message,
        "error"
      );

    }

  } catch (err) {
    console.log(err);
  }

}

function openTeacherDelete(id, name) {
  deletingTeacherId = id;
  document.getElementById("teacherDeleteText").innerText = `Delete teacher ${name}?`;
  document.getElementById("teacherDeleteModal").classList.add("active");
}

function closeTeacherDelete() {
  document.getElementById("teacherDeleteModal").classList.remove("active");
  deletingTeacherId = "";
}

async function confirmTeacherDelete() {
  try {
    const response = await fetch("http://localhost:3000/delete-teacher", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: deletingTeacherId })
    });

    const data = await response.json();

    if (response.ok) {
      closeTeacherDelete();
      await loadTeachers();
      addActivity("Teacher Deleted", `${deletingTeacherId} was removed.`);
      toast("Teacher deleted successfully", "success");
    } else {
      toast(data.message || "Could not delete teacher", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error deleting teacher", "error");
  }
}

function updateStats() {
  document.getElementById("totalStudents").innerText = students.length;
  document.getElementById("totalTeachers").innerText = teachers.length;

  const uniqueClasses = new Set(students.map(s => (s.className || "").trim()).filter(Boolean));
  const uniqueArms = new Set(students.map(s => (s.arm || "").trim()).filter(Boolean));

  document.getElementById("totalClasses").innerText = uniqueClasses.size;
  document.getElementById("totalArms").innerText = uniqueArms.size;
}

function closeScoreModal() {
  document.getElementById("scoreModal").classList.remove("active");
  currentScoreStudent = null;
  document.getElementById("scoreModalBody").innerHTML = "";
  document.getElementById("scoreModalSummary").innerHTML =
    `Select a student to view submitted scores.`;
}

async function openScoreModal(studentId, studentName) {
  currentScoreStudent = { studentId, studentName };

  const mainSession = document.getElementById("mainSessionSelect")?.value || "2025/2026";
  const mainTerm = document.getElementById("mainTermSelect")?.value || "1st Term";

  document.getElementById("scoreSessionSelect").value = mainSession;
  document.getElementById("scoreTermSelect").value = mainTerm;

  document.getElementById("scoreModalTitle").innerText = `${studentName} - Submitted Scores`;
  document.getElementById("scoreModal").classList.add("active");

  await refreshScoreModal();
}

async function refreshScoreModal() {
  if (!currentScoreStudent) return;

  const session = document.getElementById("scoreSessionSelect").value;
  const term = document.getElementById("scoreTermSelect").value;
  const body = document.getElementById("scoreModalBody");
  const summary = document.getElementById("scoreModalSummary");

  body.innerHTML = `<div class="empty-state">Loading submitted scores...</div>`;
  summary.innerHTML = `Loading summary...`;

  try {
    const response = await fetch(
      "http://localhost:3000/school-student-scores/" +
      encodeURIComponent(currentScoreStudent.studentId) +
      "?schoolId=" + encodeURIComponent(currentSchoolId) +
      "&session=" + encodeURIComponent(session) +
      "&term=" + encodeURIComponent(term)
    );

    const data = await response.json();

    if (!response.ok) {
      summary.innerHTML = `Error loading summary.`;
      body.innerHTML = `<div class="empty-state">${data.message || "Could not load scores."}</div>`;
      return;
    }

    const submittedCount = Array.isArray(data) ? data.length : 0;
    const totalScore = Array.isArray(data)
      ? data.reduce((sum, item) => sum + Number(item.total || 0), 0)
      : 0;

    summary.innerHTML = `
      <div class="score-summary-grid">
        <div class="score-summary-item">
          <h5>Student</h5>
          <p>${currentScoreStudent.studentName}</p>
        </div>
        <div class="score-summary-item">
          <h5>Session / Term</h5>
          <p>${session} • ${term}</p>
        </div>
        <div class="score-summary-item">
          <h5>Submitted Subjects</h5>
          <p>${submittedCount}</p>
        </div>
        <div class="score-summary-item">
          <h5>Total Subject Sum</h5>
          <p>${totalScore}</p>
        </div>
      </div>
    `;

    if (!data.length) {
      body.innerHTML = `<div class="empty-state">No teacher-submitted scores found for this student in this term.</div>`;
      return;
    }

    body.innerHTML = "";

    data.forEach((item) => {
      const div = document.createElement("div");
      div.className = "score-card";

      const components = Array.isArray(item.components) ? item.components : [];
      const componentHtml = components.length
        ? components.map(c => `<span class="component-chip">${c.name}: ${c.score}</span>`).join("")
        : `<span class="component-chip">No components</span>`;

      div.innerHTML = `
        <h4>${item.subject}</h4>
        <p><strong>Status:</strong> ${item.status}</p>
        <p><strong>Total:</strong> ${item.total} &nbsp; | &nbsp; <strong>Grade:</strong> ${item.grade}</p>
        <p>${componentHtml}</p>
      `;

      body.appendChild(div);
    });
  } catch (error) {
    console.log(error);
    summary.innerHTML = `Error loading summary.`;
    body.innerHTML = `<div class="empty-state">Error loading submitted scores.</div>`;
  }
}

async function assignCurrentStudentResult() {
  if (!currentScoreStudent) return;

  const session = document.getElementById("scoreSessionSelect").value;
  const term = document.getElementById("scoreTermSelect").value;
  const assignBtn = document.getElementById("assignResultBtn");

  if (assignBtn.disabled) return;

  const proceed = confirm(
    `Assign final result for ${currentScoreStudent.studentName} (${session}, ${term})?`
  );

  if (!proceed) return;

  assignBtn.disabled = true;
  assignBtn.style.opacity = "0.65";

  try {
    const response = await fetch("http://localhost:3000/assign-student-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: currentScoreStudent.studentId,
        schoolId: currentSchoolId,
        session,
        term
      })
    });

    const data = await response.json();

    if (response.ok) {
      addActivity("Result Assigned", `Final result assigned for ${currentScoreStudent.studentName}.`);
      toast("Result assigned successfully", "success");
      await refreshScoreModal();
      await loadResultStatuses();
      renderStudents();
    } else {
      toast(data.message || "Could not assign result", "error");
      assignBtn.disabled = false;
      assignBtn.style.opacity = "1";
    }
  } catch (error) {
    console.log(error);
    toast("Error assigning result", "error");
    assignBtn.disabled = false;
    assignBtn.style.opacity = "1";
  }
}

async function quickAssignResult(studentId, studentName) {
  const session = document.getElementById("mainSessionSelect")?.value || "2025/2026";
  const term = document.getElementById("mainTermSelect")?.value || "1st Term";

  const proceed = confirm(
    `Assign final result for ${studentName} (${session}, ${term})?`
  );

  if (!proceed) return;

  try {
    const response = await fetch("http://localhost:3000/assign-student-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        schoolId: currentSchoolId,
        session,
        term
      })
    });

    const data = await response.json();

    if (response.ok) {
      addActivity("Result Assigned", `Final result assigned for ${studentName}.`);
      toast(`Result assigned for ${studentName}`, "success");
      await loadResultStatuses();
      renderStudents();
    } else {
      toast(data.message || "Could not assign result", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error assigning result", "error");
  }
}

function toggleFileNameField() {
  const mediaType = document.getElementById("postMediaType").value;
  const fileNameInput = document.getElementById("fileName");

  fileNameInput.style.display = mediaType === "file" ? "block" : "none";
}

async function uploadPostFile() {
  const fileInput = document.getElementById("postFile");
  const mediaTypeSelect = document.getElementById("postMediaType");
  const output = document.getElementById("postOutput");

  output.innerText = "";
  output.style.color = "";

  if (!fileInput.files.length) return;

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("media", file);
  
  try {
    output.style.color = "inherit";
    output.innerText = "Uploading file...";

    const response = await fetch("http://localhost:3000/upload-post-media", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (response.ok) {
      document.getElementById("mediaUrl").value = data.mediaUrl || "";
      document.getElementById("fileName").value = data.fileName || "";
      mediaTypeSelect.value = data.mediaType || "";

      toggleFileNameField();

      output.style.color = "green";
      output.innerText = "File uploaded successfully.";
    } else {
      output.style.color = "red";
      output.innerText = data.message || "Upload failed.";
    }
  } catch (error) {
    console.log(error);
    output.style.color = "red";
    output.innerText = "Error uploading file.";
  }
}

async function createPost() {
  const output = document.getElementById("postOutput");
  output.innerText = "";
  output.style.color = "";

  const audience = document.getElementById("postAudience").value;
  const text = document.getElementById("postText").value.trim();
  const mediaType = document.getElementById("postMediaType").value;
  const mediaUrl = document.getElementById("mediaUrl").value.trim();
  const fileName = document.getElementById("fileName").value.trim();
  
  if (!text && !mediaUrl) {
    output.style.color = "red";
    output.innerText = "Write something or upload media.";
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/create-post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        schoolId: currentSchoolId,
        audience,
        text,
        mediaUrl,
        mediaType,
        fileName
      })
    });
    
    const data = await res.json();

    if (res.ok) {
      output.style.color = "green";
      output.innerText = "Post created successfully.";

      document.getElementById("postText").value = "";
      document.getElementById("postMediaType").value = "";
      document.getElementById("postFile").value = "";
      document.getElementById("mediaUrl").value = "";
      document.getElementById("fileName").value = "";
      toggleFileNameField();

      loadPosts(audience);
    } else {
      output.style.color = "red";
      output.innerText = data.message || "Could not create post.";
    }
  } catch (err) {
    console.log(err);
    output.style.color = "red";
    output.innerText = "Server error.";
  }
}

async function loadPosts(audience) {
  const container = document.getElementById("postList");
  container.innerHTML = "Loading...";

  try {
    const res = await fetch(
      `http://localhost:3000/posts/${currentSchoolId}?audience=${audience}`
    );

    const posts = await res.json();

    if (!res.ok) {
      container.innerHTML = posts.message || "Error loading posts";
      return;
    }

    if (!posts.length) {
      container.innerHTML = "No posts yet.";
      return;
    }
    
    container.innerHTML = "";

    posts.forEach(post => {
      const div = document.createElement("div");
      div.className = "post-card";

      let mediaHtml = "";
      
      if (post.mediaUrl) {
        if (post.mediaType === "image") {
          mediaHtml = `
          <div style="margin-top:10px;">
            <img src="${post.mediaUrl}" alt="Post image" style="max-width:100%; border-radius:12px; border:1px solid var(--line);" />
            </div>
            `;
          } else if (post.mediaType === "video") {
          mediaHtml = `
            <div style="margin-top:10px;">
              <video controls style="max-width:100%; border-radius:12px; border:1px solid var(--line);">
                <source src="${post.mediaUrl}">
                </video>
            </div>
          `;
        } else if (post.mediaType === "file") {
          mediaHtml = `
            <div style="margin-top:10px;">
              <a href="${post.mediaUrl}" target="_blank">Download ${post.fileName || "file"}</a>
              </div>
          `;
        } else {
          mediaHtml = `
            <div style="margin-top:10px;">
              <a href="${post.mediaUrl}" target="_blank">View attachment</a>
            </div>
          `;
        }
      }

      div.innerHTML = `
        <strong>${post.audience.toUpperCase()}</strong>
        <p style="margin:8px 0;">${post.text || ""}</p>
        ${mediaHtml}
        <br>
        <small>${new Date(post.createdAt).toLocaleString()}</small>
        <br><br>
        <button class="danger-btn" onclick="deletePost('${post.postId}', '${audience}')">Delete</button>
      `;
      
      container.appendChild(div);
    });
  } catch (err) {
    console.log(err);
    container.innerHTML = "Error loading posts";
  }
}

async function deletePost(postId, audience) {
  if (!confirm("Delete this post?")) return;

  try {
    const res = await fetch("http://localhost:3000/delete-post", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        postId,
        schoolId: currentSchoolId
      })
    });

    const data = await res.json();

    if (res.ok) {
      loadPosts(audience);
    } else {
      alert(data.message || "Error deleting post");
    }
  } catch (err) {
    console.log(err);
    alert("Error deleting post");
  }
}

function toggleFileNameField() {
  const mediaType = document.getElementById("postMediaType").value;
  const fileNameInput = document.getElementById("fileName");
  fileNameInput.style.display = mediaType === "file" ? "block" : "none";
}

async function uploadPostFile() {
  const fileInput = document.getElementById("postFile");
  const mediaTypeSelect = document.getElementById("postMediaType");
  const output = document.getElementById("postOutput");
  
  output.innerText = "";
  output.style.color = "";

  if (!fileInput.files.length) return;
  
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("media", file);

  try {
    output.style.color = "inherit";
    output.innerText = "Uploading file...";
    
    const response = await fetch("http://localhost:3000/upload-post-media", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (response.ok) {
      document.getElementById("mediaUrl").value = data.mediaUrl || "";
      document.getElementById("fileName").value = data.fileName || "";
      mediaTypeSelect.value = data.mediaType || "";
      
      toggleFileNameField();
      
      output.style.color = "green";
      output.innerText = "File uploaded successfully.";
    } else {
      output.style.color = "red";
      output.innerText = data.message || "Upload failed.";
    }
  } catch (error) {
    console.log(error);
    output.style.color = "red";
    output.innerText = "Error uploading file.";
  }
}

async function createPost() {
  const output = document.getElementById("postOutput");
  output.innerText = "";
  output.style.color = "";

  const audience = document.getElementById("postAudience").value;
  const text = document.getElementById("postText").value.trim();
  const mediaType = document.getElementById("postMediaType").value;
  const mediaUrl = document.getElementById("mediaUrl").value.trim();
  const fileName = document.getElementById("fileName").value.trim();
  
  if (!text && !mediaUrl) {
    output.style.color = "red";
    output.innerText = "Write something or upload media.";
    return;
  }
  
  try {
    const res = await fetch("http://localhost:3000/create-post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        schoolId: currentSchoolId,
        audience,
        text,
        mediaUrl,
        mediaType,
        fileName
      })
    });

    const data = await res.json();
    
    if (res.ok) {
      output.style.color = "green";
      output.innerText = "Post created successfully.";
      
      document.getElementById("postText").value = "";
      document.getElementById("postMediaType").value = "";
      document.getElementById("postFile").value = "";
      document.getElementById("mediaUrl").value = "";
      document.getElementById("fileName").value = "";
      toggleFileNameField();

      loadPosts(audience);
    } else {
      output.style.color = "red";
      output.innerText = data.message || "Could not create post.";
    }
  } catch (err) {
    console.log(err);
    output.style.color = "red";
    output.innerText = "Server error.";
  }
}

async function loadPosts(audience) {
  const container = document.getElementById("postList");
  if (!container) return;
  
  container.innerHTML = "Loading...";

  try {
    const res = await fetch(
      `http://localhost:3000/posts/${currentSchoolId}?audience=${audience}`
    );

    const posts = await res.json();
    
    if (!res.ok) {
      container.innerHTML = posts.message || "Error loading posts";
      return;
    }
    
    if (!posts.length) {
      container.innerHTML = "No posts yet.";
      return;
    }
    
    container.innerHTML = "";
    
    posts.forEach(post => {
      const div = document.createElement("div");
      div.className = "post-card";

      let mediaHtml = "";
      
      if (post.mediaUrl) {
        if (post.mediaType === "image") {
          mediaHtml = `
          <div class="post-media-preview">
            <img src="${post.mediaUrl}" alt="Post image" />
            </div>
          `;
        } else if (post.mediaType === "video") {
          mediaHtml = `
            <div class="post-media-preview">
              <video controls>
                <source src="${post.mediaUrl}">
              </video>
            </div>
          `;
        } else if (post.mediaType === "file") {
          mediaHtml = `
            <div class="post-media-preview">
              <a href="${post.mediaUrl}" target="_blank">Download ${post.fileName || "file"}</a>
            </div>
            `;
        } else {
          mediaHtml = `
            <div class="post-media-preview">
              <a href="${post.mediaUrl}" target="_blank">View attachment</a>
            </div>
          `;
        }
      }

      div.innerHTML = `
        <strong>${post.audience.toUpperCase()}</strong>
        <p style="margin:8px 0;">${post.text || ""}</p>
        ${mediaHtml}
        <br>
        <small>${new Date(post.createdAt).toLocaleString()}</small>
        <br><br>
        <button class="danger-btn" onclick="deletePost('${post.postId}', '${post.audience}')">Delete</button>
      `;

      container.appendChild(div);
    });
  } catch (err) {
    console.log(err);
    container.innerHTML = "Error loading posts";
  }
}

function showTab(tabId, btn) {
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.remove("active");
  });

  document.querySelectorAll(".tab-btn").forEach(button => {
    button.classList.remove("active");
  });

  document.getElementById(tabId + "Tab").classList.add("active");
  btn.classList.add("active");
}

async function deletePost(postId, audience) {
  if (!confirm("Delete this post?")) return;
  
  try {
    const res = await fetch("http://localhost:3000/delete-post", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        postId,
        schoolId: currentSchoolId
      })
    });

    const data = await res.json();

    if (res.ok) {
      loadPosts(audience);
    } else {
      alert(data.message || "Error deleting post");
    }
  } catch (err) {
    console.log(err);
    alert("Error deleting post");
  }
}

async function unlockCurrentStudentResult() {
  if (!currentScoreStudent) return;

  const session = document.getElementById("scoreSessionSelect").value;
  const term = document.getElementById("scoreTermSelect").value;
  const unlockBtn = document.getElementById("unlockResultBtn");

  const proceed = confirm(
    `Unlock result access for ${currentScoreStudent.studentName} (${session}, ${term})?`
  );

  if (!proceed) return;

  unlockBtn.disabled = true;
  unlockBtn.style.opacity = "0.65";

  try {
    const response = await fetch("http://localhost:3000/unlock-student-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: currentScoreStudent.studentId,
        schoolId: currentSchoolId,
        session,
        term
      })
    });

    const data = await response.json();

    if (response.ok) {
      addActivity("Result Unlocked", `Result access unlocked for ${currentScoreStudent.studentName}.`);
      toast("Result unlocked successfully", "success");
      await refreshScoreModal();
      await loadResultStatuses();
      renderStudents();
    } else {
      toast(data.message || "Could not unlock result", "error");
      unlockBtn.disabled = false;
      unlockBtn.style.opacity = "1";
    }
  } catch (error) {
    console.log(error);
    toast("Error unlocking result", "error");
    unlockBtn.disabled = false;
    unlockBtn.style.opacity = "1";
  }
}

async function quickUnlockResult(studentId, studentName) {
  const session = document.getElementById("mainSessionSelect")?.value || "2025/2026";
  const term = document.getElementById("mainTermSelect")?.value || "1st Term";

  const proceed = confirm(
    `Unlock result access for ${studentName} (${session}, ${term})?`
  );

  if (!proceed) return;

  try {
    const response = await fetch("http://localhost:3000/unlock-student-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        schoolId: currentSchoolId,
        session,
        term
      })
    });

    const data = await response.json();

    if (response.ok) {
      addActivity("Result Unlocked", `Result access unlocked for ${studentName}.`);
      toast(`Result unlocked for ${studentName}`, "success");
      await loadResultStatuses();
      renderStudents();
    } else {
      toast(data.message || "Could not unlock result", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error unlocking result", "error");
  }
}

async function loadResultStatuses() {
  const session = document.getElementById("mainSessionSelect")?.value || "2025/2026";
  const term = document.getElementById("mainTermSelect")?.value || "1st Term";

  resultStatusMap = {};

  await Promise.all(
    students.map(async (student) => {
      try {
        const response = await fetch(
          "http://localhost:3000/student-result-status/" +
          encodeURIComponent(student.studentId) +
          "?schoolId=" + encodeURIComponent(currentSchoolId) +
          "&session=" + encodeURIComponent(session) +
          "&term=" + encodeURIComponent(term)
        );

        const data = await response.json();

        if (response.ok) {
          resultStatusMap[student.studentId] = data;
        } else {
          resultStatusMap[student.studentId] = {
            assigned: false,
            unlocked: false,
            label: "Unknown"
          };
        }
      } catch (error) {
        console.log(error);
        resultStatusMap[student.studentId] = {
          assigned: false,
          unlocked: false,
          label: "Unknown"
        };
      }
    })
  );
}

function getResultStatusBadge(studentId) {
  const status = resultStatusMap[studentId];

  if (!status || status.label === "Unknown") {
    return `<span class="result-status-badge result-status-not-assigned">Checking...</span>`;
  }

  if (!status.assigned) {
    return `<span class="result-status-badge result-status-not-assigned">Not Assigned</span>`;
  }

  if (status.unlocked) {
    return `<span class="result-status-badge result-status-unlocked">Unlocked</span>`;
  }

  return `<span class="result-status-badge result-status-locked">Locked</span>`;
}

async function reloadStudentStatuses() {
  await loadResultStatuses();
  await loadPaymentStatuses();
  renderStudents();
}

async function lockCurrentStudentResult() {
  if (!currentScoreStudent) return;

  const session = document.getElementById("scoreSessionSelect").value;
  const term = document.getElementById("scoreTermSelect").value;
  const lockBtn = document.getElementById("lockResultBtn");

  const proceed = confirm(
    `Lock result access again for ${currentScoreStudent.studentName} (${session}, ${term})?`
  );

  if (!proceed) return;

  lockBtn.disabled = true;
  lockBtn.style.opacity = "0.65";

  try {
    const response = await fetch("http://localhost:3000/lock-student-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: currentScoreStudent.studentId,
        schoolId: currentSchoolId,
        session,
        term
      })
    });

    const data = await response.json();

    if (response.ok) {
      addActivity("Result Locked", `Result access locked again for ${currentScoreStudent.studentName}.`);
      toast("Result locked successfully", "success");
      await refreshScoreModal();
      await loadResultStatuses();
      renderStudents();
    } else {
      toast(data.message || "Could not lock result", "error");
      lockBtn.disabled = false;
      lockBtn.style.opacity = "1";
    }
  } catch (error) {
    console.log(error);
    toast("Error locking result", "error");
    lockBtn.disabled = false;
    lockBtn.style.opacity = "1";
  }
}

async function quickLockResult(studentId, studentName) {
  const session = document.getElementById("mainSessionSelect")?.value || "2025/2026";
  const term = document.getElementById("mainTermSelect")?.value || "1st Term";

  const proceed = confirm(
    `Lock result access again for ${studentName} (${session}, ${term})?`
  );

  if (!proceed) return;

  try {
    const response = await fetch("http://localhost:3000/lock-student-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        schoolId: currentSchoolId,
        session,
        term
      })
    });

    const data = await response.json();

    if (response.ok) {
      addActivity("Result Locked", `Result access locked again for ${studentName}.`);
      toast(`Result locked for ${studentName}`, "success");
      await loadResultStatuses();
      renderStudents();
    } else {
      toast(data.message || "Could not lock result", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error locking result", "error");
  }
}

async function markStudentPaid(studentId, studentName) {
  const session = document.getElementById("mainSessionSelect")?.value || "2025/2026";
  const term = document.getElementById("mainTermSelect")?.value || "1st Term";

  const proceed = confirm(
    `Mark ${studentName} as paid for ${session} (${term})? This will unlock the result.`
  );

  if (!proceed) return;

  try {
    const response = await fetch("http://localhost:3000/mark-result-paid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        studentId,
        schoolId: currentSchoolId,
        session,
        term
      })
    });

    const data = await response.json();

    if (response.ok) {
      addActivity("Payment Marked", `${studentName} was marked as paid.`);
      toast(`${studentName} marked as paid`, "success");
      await loadResultStatuses();
      await loadPaymentStatuses();
      renderStudents();
    } else {
      toast(data.message || "Could not mark as paid", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error marking as paid", "error");
  }
}

async function markStudentUnpaid(studentId, studentName) {
  const session = document.getElementById("mainSessionSelect")?.value || "2025/2026";
  const term = document.getElementById("mainTermSelect")?.value || "1st Term";

  const proceed = confirm(
    `Mark ${studentName} as unpaid for ${session} (${term})? This will lock the result again.`
  );

  if (!proceed) return;

  try {
    const response = await fetch("http://localhost:3000/mark-result-unpaid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        studentId,
        schoolId: currentSchoolId,
        session,
        term
      })
    });

    const data = await response.json();

    if (response.ok) {
      addActivity("Payment Reset", `${studentName} was marked as unpaid.`);
      toast(`${studentName} marked as unpaid`, "success");
      await loadResultStatuses();
      await loadPaymentStatuses();
      renderStudents();
    } else {
      toast(data.message || "Could not mark as unpaid", "error");
    }
  } catch (error) {
    console.log(error);
    toast("Error marking as unpaid", "error");
  }
}

  window.addEventListener("load", () => {
      const preloader = document.getElementById("preloader");
      if (!preloader) return;

      setTimeout(() => {
        preloader.classList.add("hide");
        setTimeout(() => preloader.remove(), 500);
      }, 700);
    });

async function init() {
  document.getElementById("schoolInfo").innerText = "School ID: " + currentSchoolId;
  document.getElementById("settingsSchoolId").innerText = currentSchoolId;

  const savedTheme = localStorage.getItem("dashboardTheme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
  }
  updateThemeButton();

  await loadSchoolProfile();
  await loadStudents();
  await loadTeachers();
  renderActivities();
  loadPosts("students");
}

let viewingTeacher=null;


async function
viewTeacherSubjects(
teacherId
){

viewingTeacher=
teacherId;

document
.getElementById(
"teacherSubjectList"
)
.innerHTML=
"Loading...";

document
.getElementById(
"teacherSubjectModal"
)
.classList
.add(
"active"
);

try{

const response=
await fetch(
`http://localhost:3000/teacher-subjects/${teacherId}`
);

const data=
await response.json();

renderTeacherSubjects(
data
);

}

catch(err){

console.log(
err
);

}

}



function
renderTeacherSubjects(
list
){

const wrap=
document
.getElementById(
"teacherSubjectList"
);

if(
!list.length
){

wrap.innerHTML=
`
No subjects assigned
`;

return;

}

wrap.innerHTML=
list
.map(
x=>`

<div
class="subject-row"
>

<div>

<b>
${x.subject}
</b>

<br>

${x.className}

${x.arm}

</div>

<button
onclick="
deleteTeacherSubject(
'${x.subject}',
'${x.className}',
'${x.arm}'
)
">

Delete

</button>

</div>

`
)
.join("");

}



async function
deleteTeacherSubject(
subject,
className,
arm
){

if(
!confirm(
"Delete subject?"
)
)
return;

await fetch(

`http://localhost:3000/teacher-subject/${viewingTeacher}`,

{

method:
"DELETE",

headers:{
"Content-Type":
"application/json"
},

body:
JSON.stringify({

subject,
className,
arm

})

}

);

viewTeacherSubjects(
viewingTeacher
);

}



function
closeTeacherSubjects(){

document
.getElementById(
"teacherSubjectModal"
)
.classList
.remove(
"active"
);

}

function renderTeacherSubjects(list){

const wrap=
document.getElementById(
"teacherSubjectList"
);

if(!list.length){

wrap.innerHTML=
`
<div class="empty-state">
No subjects assigned
</div>
`;

return;

}

wrap.innerHTML=
list.map(x=>`

<div class="teacher-subject-item">

<div>

<b>${x.subject}</b>

<div class="teacher-subject-meta">

<span>
${x.className}
</span>

<span>
${x.arm||"-"}
</span>

</div>

</div>

<button
class="remove-subject-btn"

onclick="
deleteTeacherSubject(
'${x.subject}',
'${x.className}',
'${x.arm}'
)
">

Delete

</button>

</div>

`).join("");

}

init();

