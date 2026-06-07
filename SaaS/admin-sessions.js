(function(){
  const API = window.CONFIG?.API_BASE_URL || window.API_BASE || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://stun-fi-backend.onrender.com');

  function el(id){ return document.getElementById(id); }

  let SCHOOL_ID = null;

  function toast(msg, type='info'){
    const wrap = document.getElementById('toastWrap');
    const d = document.createElement('div');
    d.className = 'toast ' + type;
    d.textContent = msg;
    wrap.appendChild(d);
    setTimeout(()=> d.remove(), 3500);
  }

  async function fetchJSON(url, opts){
    try{
      const token = localStorage.getItem('token');
      const options = opts ? {...opts} : {};
      options.headers = options.headers ? {...options.headers} : {};
      if (token) {
        options.headers.Authorization = 'Bearer ' + token;
      }
      const r = await fetch(url, options);
      return await r.json();
    }catch(e){
      console.error(e);
      toast('Network error','error');
    }
  }

  function setSchoolId(){
    const input = el('schoolIdInput').value.trim();
    if(!input){ toast('Enter a School ID','error'); return; }
    SCHOOL_ID = input;
    localStorage.setItem('schoolId', SCHOOL_ID);
    el('schoolIdInput').value = '';
    toast('School ID set to ' + SCHOOL_ID,'success');
    loadSessions();
    loadClasses();
  }

  function getNextClass(currentClass) {
    const map = { JSS1: 'JSS2', JSS2: 'JSS3', JSS3: 'SS1', SS1: 'SS2', SS2: 'SS3' };
    return map[currentClass] || '';
  }

  async function openAssignResultModal(){
    try{ ensureSchoolId(); } catch(e){ return; }
    const className = el('classFilter').value;
    const session = el('sessionFilter').value;
    const term = el('termFilter').value;
    
    if(!className){ toast('Select a class first','error'); return; }
    if(!session){ toast('Select a session first','error'); return; }

    // Load students in this class
    const students = await fetchJSON(API + '/school-students-by-session/' + SCHOOL_ID + '?className=' + encodeURIComponent(className) + '&session=' + encodeURIComponent(session));
    if(!Array.isArray(students) || !students.length){ toast('No students in this class','error'); return; }

    // Load promotion settings
    const settingsResp = await fetchJSON(API + '/promotion-settings/' + SCHOOL_ID + '/' + encodeURIComponent(session));
    const settings = settingsResp || {};

    const tbody = el('assignResultTable');
    tbody.innerHTML = '';

    for(const student of students){
      // Get finalized result
      const resultResp = await fetch(API + '/student-result/' + encodeURIComponent(student.studentId) + '?session=' + encodeURIComponent(session) + '&term=' + encodeURIComponent(term));
      const result = await resultResp.json();
      
      if(!result || !result.ready){ 
        continue; // skip students without finalized results
      }

      // Compute suggested status
      const avg = result.average || 0;
      let suggested = 'repeat';
      let nextClass = '';

      if(student.className === 'SS3'){
        if(avg >= (settings.ss3GraduationAverage || 50)) suggested = 'graduated';
        else if(avg >= (settings.repeatAverage || 40)) suggested = 'repeat';
        else suggested = 'withdrawn';
      } else {
        if(avg >= (settings.promoteAverage || 50)){
          suggested = 'promoted';
          nextClass = getNextClass(student.className);
        } else if(avg >= (settings.repeatAverage || 40)){
          suggested = 'repeat';
          nextClass = student.className;
        } else {
          suggested = 'withdrawn';
        }
      }

      const tr = document.createElement('tr');
      tr.style = 'border-bottom:1px solid #e5e7eb;';
      tr.innerHTML = `
        <td style="padding:10px;text-align:left;">${student.name}<div style="color:#6b7280;font-size:12px;">${student.regNumber}</div></td>
        <td style="padding:10px;text-align:center;font-weight:bold;">${Number(avg).toFixed(1)}</td>
        <td style="padding:10px;text-align:center;color:#0066cc;">${suggested}</td>
        <td style="padding:10px;text-align:center;">
          <select class="final-status-select" data-student="${student.studentId}" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;">
            <option value="promoted" ${suggested==='promoted'?'selected':''}>Promoted</option>
            <option value="repeat" ${suggested==='repeat'?'selected':''}>Repeat</option>
            <option value="graduated" ${suggested==='graduated'?'selected':''}>Graduated</option>
            <option value="withdrawn" ${suggested==='withdrawn'?'selected':''}>Withdrawn</option>
          </select>
        </td>
        <td style="padding:10px;text-align:center;">
          <select class="next-class-select" data-student="${student.studentId}" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;">
            <option value="">--</option>
            <option value="JSS1" ${nextClass==='JSS1'?'selected':''}>JSS1</option>
            <option value="JSS2" ${nextClass==='JSS2'?'selected':''}>JSS2</option>
            <option value="JSS3" ${nextClass==='JSS3'?'selected':''}>JSS3</option>
            <option value="SS1" ${nextClass==='SS1'?'selected':''}>SS1</option>
            <option value="SS2" ${nextClass==='SS2'?'selected':''}>SS2</option>
            <option value="SS3" ${nextClass==='SS3'?'selected':''}>SS3</option>
          </select>
        </td>
      `;
      tbody.appendChild(tr);
    }

    if(tbody.children.length === 0){
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">No finalized results for this class yet.</div></td></tr>';
    }

    el('assignResultModal').classList.add('active');
  }

  function closeAssignResultModal(){
    el('assignResultModal').classList.remove('active');
  }

  async function saveAssignResult(){
    try{ ensureSchoolId(); } catch(e){ return; }
    const session = el('sessionFilter').value;
    const term = el('termFilter').value;
    const tbody = el('assignResultTable');

    const statusSelects = tbody.querySelectorAll('.final-status-select');
    let saveCount = 0;

    for(const sel of statusSelects){
      const studentId = sel.getAttribute('data-student');
      const status = sel.value;
      const nextClassSel = tbody.querySelector(`.next-class-select[data-student="${studentId}"]`);
      const nextClass = nextClassSel ? nextClassSel.value : '';

      const payload = {
        studentId,
        schoolId: SCHOOL_ID,
        session,
        term,
        promotionStatus: status,
        nextClass: nextClass || null,
        processedBy: 'admin-ui'
      };

      const res = await fetchJSON(API + '/set-promotion-status', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });

      if(res && res.promotion){
        saveCount++;
      } else {
        toast(res.message || 'Failed to save ' + studentId,'error');
      }
    }

    toast(`Saved promotion for ${saveCount} students`,'success');
    closeAssignResultModal();
  }

  async function init(){
    el('setSchoolIdBtn').addEventListener('click', setSchoolId);
    el('openAssignResultModal').addEventListener('click', openAssignResultModal);
    el('saveAssignResultBtn').addEventListener('click', saveAssignResult);
    el('cancelAssignResultBtn').addEventListener('click', closeAssignResultModal);
    el('refreshSessions').addEventListener('click', loadSessions);
    el('openNewSession').addEventListener('click', openNewSessionModal);
    el('cancelCreateSession').addEventListener('click', closeNewSessionModal);
    el('createSessionBtn').addEventListener('click', createSession);
    el('applyPromotions').addEventListener('click', processPromotions);
    el('loadPromotionSettings').addEventListener('click', loadPromotionSettings);
    el('savePromotionSettings').addEventListener('click', savePromotionSettings);
    el('generateSuggestionsBtn').addEventListener('click', generatePromotionSuggestions);
    el('sessionFilter').addEventListener('change', loadClasses);
    el('sessionFilter').addEventListener('change', loadPromotionSettings);

    // Try to load school ID from storage
    SCHOOL_ID = localStorage.getItem('schoolId') || null;
    if(SCHOOL_ID){
      el('schoolIdInput').value = SCHOOL_ID;
      await loadSessions();
    } else {
      toast('Enter School ID to begin','info');
    }
  }

  function ensureSchoolId() {
    if (SCHOOL_ID) return SCHOOL_ID;
    const v = prompt('Enter School ID for admin actions');
    if (v) {
      SCHOOL_ID = v.trim();
      localStorage.setItem('schoolId', SCHOOL_ID);
      return SCHOOL_ID;
    }
    toast('No schoolId provided','error');
    throw new Error('No schoolId');
  }

  async function loadSessions(){
    try{ ensureSchoolId(); } catch(e){ return; }
    el('activeSessionLabel').textContent = 'Loading...';
    const active = await fetchJSON(API + '/active-session/' + SCHOOL_ID);
    if(active && active.session){
      el('activeSessionLabel').textContent = active.session + (active.isActive? ' (active)':'');
      el('currentSession').value = active.session;
    } else {
      el('activeSessionLabel').textContent = 'No active session';
    }

      const history = await fetchJSON(API + '/session-history/' + SCHOOL_ID + '?limit=50');
    const sel = el('sessionFilter');
    const historyWrap = el('sessionHistoryWrap');
    sel.innerHTML = '';
    historyWrap.innerHTML = '';

    if (Array.isArray(history) && history.length) {
      history.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.session;
        opt.textContent = s.session + (s.isActive ? ' • Active' : '');
        sel.appendChild(opt);

        const card = document.createElement('div');
        card.style = 'border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:10px;background:#fff;';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
            <div>
              <strong>${s.session}</strong> ${s.isActive ? '<span style="color:#16a34a;">(active)</span>' : ''}
              <div style="font-size:12px;color:#6b7280;margin-top:4px;">Created ${new Date(s.createdAt).toLocaleDateString()} by ${s.createdBy || 'system'}</div>
            </div>
            <div style="font-size:12px;color:#475569;">${s.isActive ? 'Current session' : 'Historic'}</div>
          </div>
        `;
        historyWrap.appendChild(card);
      });
    } else {
      historyWrap.innerHTML = '<div class="empty-state">No session history available yet.</div>';
    }

    if (Array.isArray(history) && history.length) {
      const activeOpt = Array.from(sel.options).find(o => o.textContent.includes('(active)') || o.textContent.includes('Active'));
      if (activeOpt) sel.value = activeOpt.value;
    }

    await loadPromotionSettings();
  }

  function openNewSessionModal(){
    try{ ensureSchoolId(); } catch(e){ return; }
    const session = el('sessionFilter').value || el('activeSessionLabel').textContent.split(' ')[0];
    el('currentSessionDisplay').textContent = session || 'N/A';
    el('newSessionName').value = '';
    el('newSessionModal').classList.add('active');
  }

  function closeNewSessionModal(){
    el('newSessionModal').classList.remove('active');
  }

  async function createSession(){
    try{ ensureSchoolId(); } catch(e){ return; }
    const currentSession = el('currentSessionDisplay').textContent;
    const newSession = el('newSessionName').value.trim();
    
    if(!newSession){ toast('Enter new session name','error'); return; }
    if(currentSession === 'N/A'){ toast('No active session found','error'); return; }

    const body = {
      schoolId: SCHOOL_ID,
      newSession,
      copySubjects: false,
      keepTeachers: false,
      usePromotionDecisions: true, // always use promotion decisions from previous session
      createdBy: 'admin-ui'
    };

    const result = await fetchJSON(API + '/create-academic-session', {
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify(body)
    });

    if(result && result.session){
      toast('New session created successfully','success');
      closeNewSessionModal();
      await loadSessions();
      await loadClasses();
    } else {
      toast(result.message || 'Error creating session','error');
    }
  }

  async function loadClasses(){
    try{ ensureSchoolId(); } catch(e){ return; }
    const session = el('sessionFilter').value || '';
    const url = API + '/school-students-by-session/' + SCHOOL_ID + '?className=&session=' + encodeURIComponent(session);
    const students = await fetchJSON(url, { method: 'GET' });
    const classes = new Set();
    if(Array.isArray(students)){
      students.forEach(s=>{ if(s.className) classes.add(s.className); });
    }

    const sel = el('classFilter');
    sel.innerHTML = '<option value="">-- Select class --</option>';
    Array.from(classes).sort().forEach(c=>{
      const o = document.createElement('option'); 
      o.value = c; 
      o.textContent = c; 
      sel.appendChild(o);
    });
  }

  function openSessionPanel(){
    const panel = el('session-management');
    if(!panel) return;
    panel.classList.add('active');
  }

  function closeSessionPanel(){
    const panel = el('session-management');
    if(!panel) return;
    panel.classList.remove('active');
  }

  async function loadPromotionSettings(){
    try{ ensureSchoolId(); } catch(e){ return; }
    const session = el('sessionFilter').value || '';
    if(!session){ return; }

    const settings = await fetchJSON(API + '/promotion-settings/' + SCHOOL_ID + '/' + encodeURIComponent(session));
    if(settings){
      el('settingsPromoteAverage').value = settings.promoteAverage || 50;
      el('settingsRepeatAverage').value = settings.repeatAverage || 40;
      el('settingsWithdrawAverage').value = settings.withdrawAverage || 30;
      el('settingsSs3Average').value = settings.ss3GraduationAverage || 50;
      el('settingsAllowAuto').checked = settings.allowAutoSuggestions === true;
    }
  }

  async function savePromotionSettings(){
    try{ ensureSchoolId(); } catch(e){ return; }
    const session = el('sessionFilter').value || '';
    if(!session){ toast('Select a session first','error'); return; }

    const body = {
      schoolId: SCHOOL_ID,
      session,
      promoteAverage: Number(el('settingsPromoteAverage').value || 50),
      repeatAverage: Number(el('settingsRepeatAverage').value || 40),
      withdrawAverage: Number(el('settingsWithdrawAverage').value || 30),
      ss3GraduationAverage: Number(el('settingsSs3Average').value || 50),
      allowAutoSuggestions: el('settingsAllowAuto').checked,
      updatedBy: 'admin-ui'
    };

    const result = await fetchJSON(API + '/promotion-settings', {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });

    if(result && result.settings){
      toast('Promotion settings saved','success');
      await loadPromotionSettings();
    } else {
      toast(result.message || 'Failed to save settings','error');
    }
  }

  async function generatePromotionSuggestions(){
    try{ ensureSchoolId(); } catch(e){ return; }
    const session = el('sessionFilter').value;
    const term = el('termFilter').value;
    const className = el('classFilter').value;

    if(!session){ toast('Select a session first','error'); return; }
    if(!className){ toast('Select a class first','error'); return; }

    const body = { schoolId: SCHOOL_ID, session, term, className };
    const result = await fetchJSON(API + '/generate-promotion-suggestions', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });

    const tbody = el('suggestionTable');
    tbody.innerHTML = '';

    if(!result || !Array.isArray(result.suggestions) || !result.suggestions.length){
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">No finalized results available for this class/session.</div></td></tr>';
      return;
    }

    result.suggestions.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px">${item.name}<div style='color:#6b7280;font-size:12px'>${item.regNumber}</div></td>
        <td style="padding:8px">${item.average !== null ? Number(item.average).toFixed(2) : 'N/A'}</td>
        <td style="padding:8px">${item.promotionStatus || 'pending'}</td>
        <td style="padding:8px">${item.suggestedPromotionStatus}${item.suggestedNextClass ? ' → ' + item.suggestedNextClass : ''}</td>
        <td style="padding:8px"><button class="mini-btn" data-apply="${item.studentId}">Save</button></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-apply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const studentId = btn.getAttribute('data-apply');
        const suggestion = result.suggestions.find(s => s.studentId === studentId);
        if(!suggestion){ return; }

        const payload = {
          studentId,
          schoolId: SCHOOL_ID,
          session,
          term,
          promotionStatus: suggestion.suggestedPromotionStatus,
          nextClass: suggestion.suggestedNextClass
        };

        const res = await fetchJSON(API + '/set-promotion-status', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });

        if(res && res.promotion){
          toast('Saved','success');
        } else {
          toast(res.message || 'Failed','error');
        }
      });
    });
  }

  async function processPromotions(){
    try{ ensureSchoolId(); } catch(e){ return; }
    const session = el('sessionFilter').value;
    if(!session){ toast('No session selected','error'); return; }
    
    const r = await fetchJSON(API + '/process-promotions', { 
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({ schoolId: SCHOOL_ID, session, processedBy: 'admin-ui' }) 
    });
    
    if(r && r.summary){
      toast(`Finalized: promoted ${r.summary.promoted}, repeat ${r.summary.repeat}, graduated ${r.summary.graduated}, withdrawn ${r.summary.withdrawn}`,'success');
      await loadSessions();
    } else {
      toast(r.message || 'Process failed','error');
    }
  }

  // boot
  document.addEventListener('DOMContentLoaded', init);

  // session panel toggle (sidebar button)
  document.addEventListener('DOMContentLoaded', function(){
    const fab = document.getElementById('sessionToggleFab');
    const panel = document.getElementById('session-management');
    if(!fab || !panel) return;
    fab.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      if(panel.classList.contains('active')){
        closeSessionPanel();
      } else {
        openSessionPanel();
      }
    });

    document.addEventListener('click', function(event){
      if(!panel.classList.contains('active')) return;
      const target = event.target;
      if(panel.contains(target) || fab.contains(target)) return;
      closeSessionPanel();
    });
  });
})();
