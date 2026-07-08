(function(){
  const API_BASE = (window.api && typeof window.api === 'function')
    ? window.api('')
    : (window.API_BASE || window.location.origin);
  const buildUrl = (path) => {
    if (!path.startsWith('/')) path = '/' + path;
    return API_BASE.replace(/\/$/, '') + path;
  };
  const student = JSON.parse(localStorage.getItem('student') || 'null');
  if(!student || !student.studentId || !student.schoolId){ window.location.href = 'student-login.html'; }

  function el(id){ return document.getElementById(id); }
  function toast(msg){ alert(msg); }

  async function fetchJSON(url, opts){
    try{ const r = await fetch(url, opts); return await r.json(); }catch(e){ console.error(e); toast('Network error'); }
  }

  function logout() {
    localStorage.removeItem('student');
    localStorage.removeItem('school');
    window.location.href = 'student-login.html';
  }

  function populateStudentInfo() {
    const name = student?.name || student?.studentName || student?.fullName || 'Student';
    const schoolName = student?.schoolName || student?.school || student?.schoolId || 'School';
    const className = student?.className || student?.studentClass || student?.class || 'N/A';
    const studentNameEl = el('historyStudentName');
    const schoolNameEl = el('historySchoolName');
    const classNameEl = el('historyClassName');
    const sessionCountEl = el('historySessionCount');
    const pageTitle = document.querySelector('.history-header h1');
    if (pageTitle) pageTitle.textContent = `${name}'s Academic History`;
    if (studentNameEl) studentNameEl.textContent = name;
    if (schoolNameEl) schoolNameEl.textContent = schoolName;
    if (classNameEl) classNameEl.textContent = className;
    if (sessionCountEl) sessionCountEl.textContent = '0';
  }

  async function init(){
    populateStudentInfo();
    await loadSessions();
    const logoutBtn = el('historyLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    el('loadHistoryBtn').addEventListener('click', loadHistory);
    loadHistory();
  }

  async function loadSessions(){
    const sessions = await fetchJSON(buildUrl('/session-history/' + student.schoolId + '?limit=50'));
    const sel = el('historySession'); sel.innerHTML = '';
    const sessionCountEl = el('historySessionCount');

    if(Array.isArray(sessions) && sessions.length){
      sessions.forEach(s=>{
        const o = document.createElement('option');
        o.value = s.session;
        o.textContent = s.session + (s.isActive ? ' • Active' : '');
        sel.appendChild(o);
      });
      sel.value = sessions[0].session;
      if (sessionCountEl) sessionCountEl.textContent = String(sessions.length);
    } else {
      const o = document.createElement('option');
      o.value = '2025/2026';
      o.textContent = '2025/2026';
      sel.appendChild(o);
      if (sessionCountEl) sessionCountEl.textContent = '0';
    }
  }

  function renderPromotion(p){
    if(!p) return '<div class="empty-state">No promotion record</div>';
    const map = { promoted: '✅ Promoted', repeat: '⚠️ Repeat', graduated: '🎓 Graduated', withdrawn: '❌ Withdrawn' };
    return `<div style="padding:12px;border:1px solid #eee;border-radius:10px;margin-bottom:8px;">
      <strong>${map[p.promotionStatus] || p.promotionStatus}</strong>
      <div style="color:#6b7280;margin-top:6px">Session: ${p.session} • Term: ${p.term || '3rd Term'}</div>
      <div style="margin-top:6px">Next class: ${p.nextClass || '—'}</div>
    </div>`;
  }

  function renderResults(results, session, term){
    if(!Array.isArray(results) || !results.length) {
      return '<div class="empty-state">No results found for this session.</div>';
    }

    const filtered = results.filter(r => r.term === term);
    if(!filtered.length) {
      return `<div class="empty-state">No results found for ${term} of ${session}. Please select a different session or term.</div>`;
    }

    let html = '<div class="history-records">';
    filtered.forEach(r => {
      html += `<div class="history-record">
        <strong>${r.session} • ${r.term}</strong>
        <div class="record-line">Average: ${Number(r.average || 0).toFixed(2)}</div>
        <div class="record-line">Position: ${r.position || '—'}</div>
        <div class="record-line">Promotion status: ${r.promotionStatus || 'pending'}</div>
      </div>`;
    });
    html += '</div>';
    return html;
  }

  function renderPromotionHistory(history) {
    if(!Array.isArray(history) || !history.length) {
      return '<div class="empty-state">No promotion change history available.</div>';
    }

    let html = '<div class="history-records">';
    history.forEach(entry => {
      html += `<div class="history-record">
        <strong>${entry.changedBy || 'System'} • ${new Date(entry.changedAt).toLocaleDateString()}</strong>
        <div class="record-line">Type: ${entry.changeType || 'update'}</div>
        <div class="record-line">${entry.previousStatus || 'pending'} ${entry.previousNextClass ? '→ ' + entry.previousNextClass : ''} to ${entry.newStatus || 'pending'} ${entry.newNextClass ? '→ ' + entry.newNextClass : ''}</div>
      </div>`;
    });
    html += '</div>';
    return html;
  }

  async function loadHistory(){
    const session = el('historySession').value;
    const term = el('historyTerm').value;

    el('historyContent').innerHTML = '<div class="empty-state">Loading history...</div>';

    const data = await fetchJSON(buildUrl(`/student-academic-history/${encodeURIComponent(student.studentId)}/${encodeURIComponent(student.schoolId)}`));
    if(!data){ el('historyContent').innerHTML = '<div class="empty-state">Error loading history.</div>'; return; }

    const promotions = Array.isArray(data.promotions) ? data.promotions : [];
    const results = Array.isArray(data.results) ? data.results : [];
    const history = Array.isArray(data.promotionHistory) ? data.promotionHistory : [];

    const promoForSession = promotions.find(p=>p.session===session) || null;
    const resultsForSession = results.filter(r=>r.session===session);

    const promotionText = promoForSession ? (promoForSession.promotionStatus || 'Pending').toUpperCase() : 'Pending';
    const selectedSessionLabel = el('historySelectedSession');
    const selectedTermLabel = el('historySelectedTerm');
    const promotionStatusLabel = el('historyPromotionStatus');
    if (selectedSessionLabel) selectedSessionLabel.textContent = session || 'N/A';
    if (selectedTermLabel) selectedTermLabel.textContent = term || 'N/A';
    if (promotionStatusLabel) promotionStatusLabel.textContent = promotionText;

    let out = '';
    out += '<h4>Promotion Decision</h4>' + renderPromotion(promoForSession);
    out += '<h4 style="margin-top:12px">Session Results</h4>' + renderResults(resultsForSession, session, term);
    out += '<h4 style="margin-top:12px">Promotion Change History</h4>' + renderPromotionHistory(history);

    el('historyContent').innerHTML = out;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
