(function(){
  const API = window.API_BASE;
  const student = JSON.parse(localStorage.getItem('student') || 'null');
  if(!student || !student.studentId || !student.schoolId){ window.location.href = 'student-login.html'; }

  function el(id){ return document.getElementById(id); }
  function toast(msg){ alert(msg); }

  async function fetchJSON(url, opts){
    try{ const r = await fetch(url, opts); return await r.json(); }catch(e){ console.error(e); toast('Network error'); }
  }

  async function init(){
    await loadSessions();
    el('loadHistoryBtn').addEventListener('click', loadHistory);
    loadHistory();
  }

  async function loadSessions(){
    const sessions = await fetchJSON(API + '/session-history/' + student.schoolId + '?limit=50');
    const sel = el('historySession'); sel.innerHTML = '';
    if(Array.isArray(sessions) && sessions.length){
      sessions.forEach(s=>{ const o = document.createElement('option'); o.value = s.session; o.textContent = s.session + (s.isActive? ' • Active':''); sel.appendChild(o); });
      // select first (most recent)
      sel.value = sessions[0].session;
    } else {
      const o = document.createElement('option'); o.value='2025/2026'; o.textContent='2025/2026'; sel.appendChild(o);
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
    if(!Array.isArray(results) || !results.length) return '<div class="empty-state">No results for this session/term.</div>';
    let html = '<div class="card"><h4>Results</h4>';
    results.filter(r=>r.term===term).forEach(r=>{
      html += `<div style="padding:10px;border-bottom:1px solid #f0f0f0;"><strong>${r.session} • ${r.term}</strong>
        <div style="color:#6b7280">Average: ${Number(r.average||0).toFixed(2)} • Position: ${r.position||'—'} • Promotion: ${r.promotionStatus||'pending'}</div>
      </div>`;
    });
    html += '</div>';
    return html;
  }

  function renderPromotionHistory(history) {
    if(!Array.isArray(history) || !history.length) {
      return '<div class="empty-state">No promotion change history available.</div>';
    }

    let html = '<div class="card"><h4>Promotion History</h4>';
    history.forEach(entry => {
      html += `<div style="padding:10px;border-bottom:1px solid #f0f0f0;">
        <strong>${entry.changedBy || 'System'}</strong>
        <div style="color:#6b7280;font-size:13px;margin-top:4px;">${new Date(entry.changedAt).toLocaleDateString()} • ${entry.changeType}</div>
        <div style="margin-top:6px;">${entry.previousStatus || 'pending'} ${entry.previousNextClass ? '→ ' + entry.previousNextClass : ''} to ${entry.newStatus || 'pending'} ${entry.newNextClass ? '→ ' + entry.newNextClass : ''}</div>
      </div>`;
    });
    html += '</div>';
    return html;
  }

  async function loadHistory(){
    const session = el('historySession').value;
    const term = el('historyTerm').value;

    el('historyContent').innerHTML = '<div class="empty-state">Loading history...</div>';

    const data = await fetchJSON(API + `/student-academic-history/${encodeURIComponent(student.studentId)}/${encodeURIComponent(student.schoolId)}`);
    if(!data){ el('historyContent').innerHTML = '<div class="empty-state">Error loading history.</div>'; return; }

    const promotions = Array.isArray(data.promotions) ? data.promotions : [];
    const results = Array.isArray(data.results) ? data.results : [];
    const history = Array.isArray(data.promotionHistory) ? data.promotionHistory : [];

    const promoForSession = promotions.find(p=>p.session===session) || null;
    const resultsForSession = results.filter(r=>r.session===session);

    let out = '';
    out += '<h4>Promotion Decision</h4>' + renderPromotion(promoForSession);
    out += '<h4 style="margin-top:12px">Session Results</h4>' + renderResults(resultsForSession, session, term);
    out += '<h4 style="margin-top:12px">Promotion Change History</h4>' + renderPromotionHistory(history);

    el('historyContent').innerHTML = out;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
