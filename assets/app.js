/* ระบบสวดมนต์สรภัญญะ - GitHub Pages + GAS receiver */
const DATA_PATH = 'data/';
const state = {
  settings: null,
  students: [],
  chants: [],
  homeSummary: null,
  selectedStudent: null,
  activeChants: [],
  currentChapterIndex: 0,
  chapters: [],
  totalScore: 0,
  audio: {
    stream: null,
    context: null,
    analyser: null,
    data: null,
    raf: null,
    micOn: false,
    startedAt: 0,
    totalFrames: 0,
    activeFrames: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    lastRms: 0,
    stabilitySum: 0,
    timeData: null,
    noiseFloor: 0,
    noiseSamples: [],
    calibratingUntil: 0,
    activeStreak: 0
  },
  scrollTimer: null,
  manualScrollTimer: null,
  ignoreScrollUntil: 0,
  autoScroll: true,
  liveSummary: null,
  holdTimer: null,
  holdStarted: 0,
  nextHoldTimer: null,
  nextHoldStarted: 0,
  nextHoldDone: false,
  receiptCode: '',
  isSubmitting: false
};

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString('th-TH');

window.addEventListener('DOMContentLoaded', init);

async function init(){
  bindGlobalEvents();
  try{
    const [settings, homeSummary] = await Promise.all([
      fetchJson('settings.json'),
      fetchJson('home_summary.json').catch(() => null)
    ]);
    state.settings = settings;
    state.homeSummary = homeSummary || {};
    renderHome();
    showView('home');
  }catch(err){
    $('homeStatus').textContent = 'โหลดไฟล์ตั้งค่าไม่สำเร็จ: ' + err.message;
  }
}

async function fetchJson(name){
  const res = await fetch(DATA_PATH + name + '?v=' + Date.now(), {cache:'no-store'});
  if(!res.ok) throw new Error(name + ' HTTP ' + res.status);
  return res.json();
}

function bindGlobalEvents(){
  $('btnStartGate').addEventListener('click', startGate);
  $('btnDashboard').addEventListener('click', () => showView('dashboard'));
  $('btnOpenBrowser').addEventListener('click', openSupportedBrowser);
  $('btnCopyLink').addEventListener('click', copyCurrentLink);
  $('btnRefreshHomeLive').addEventListener('click', loadLiveSummaryToHome);
  $('btnConfirmStudent').addEventListener('click', confirmStudentAndStart);
  $('btnBackHomeFromChant').addEventListener('click', () => {
    if(confirm('ออกจากหน้าสวดหรือไม่? คะแนนที่ยังไม่จบอาจไม่ถูกบันทึก')) goHomeSafe();
  });
  $('btnMic').addEventListener('click', toggleMic);
  $('btnNextChapter').addEventListener('mousedown', startHoldNextChapter);
  $('btnNextChapter').addEventListener('touchstart', startHoldNextChapter, {passive:false});
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(evt => $('btnNextChapter').addEventListener(evt, cancelHoldNextChapter));
  $('btnReturnHome').addEventListener('click', goHomeSafe);
  $('btnHoldSubmit').addEventListener('mousedown', startHoldSubmit);
  $('btnHoldSubmit').addEventListener('touchstart', startHoldSubmit, {passive:false});
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(evt => $('btnHoldSubmit').addEventListener(evt, cancelHoldSubmit));
  $('btnAdminLogin').addEventListener('click', adminLogin);
  $('btnLoadLiveSummary').addEventListener('click', loadDashboardSummary);
  $('btnExportCsv').addEventListener('click', exportSummaryCsv);
  document.querySelectorAll('[data-nav="home"]').forEach(btn => btn.addEventListener('click', goHomeSafe));
  $('levelSelect').addEventListener('change', onLevelChange);
  $('roomSelect').addEventListener('change', onRoomChange);
  $('studentSelect').addEventListener('change', renderStudentConfirm);
  $('studentIdInput').addEventListener('input', onStudentIdInput);
  const stage = $('chantStage');
  stage.addEventListener('scroll', onManualScroll, {passive:true});
}

function renderHome(){
  const s = state.settings;
  $('schoolName').textContent = s.schoolName || 'โรงเรียน';
  $('systemName').textContent = s.systemName || 'ระบบสวดมนต์สรภัญญะ';
  $('homeStatus').textContent = `ภาคเรียน ${s.termKey} | สัปดาห์ ${s.weekKey} | หน้าเว็บโหลดจาก GitHub Pages`;
  const h = state.homeSummary || {};
  $('termTotalScore').textContent = fmt(h.termTotalScore || 0);
  $('totalSubmitted').textContent = fmt(h.totalSubmitted || 0);
  $('bestLevel').textContent = h.bestLevel || '-';
  $('bestLevelScore').textContent = `${Number(h.bestLevelScore || 0).toFixed(2)} คะแนน`;
  $('bestRoom').textContent = h.bestRoom || '-';
  $('bestRoomScore').textContent = `${Number(h.bestRoomScore || 0).toFixed(2)} คะแนน`;
  $('summaryUpdatedAt').textContent = h.updatedAt || 'Snapshot';
  renderTop10($('top10List'), h.top10 || []);
}

function showView(name){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const id = 'view' + name.charAt(0).toUpperCase() + name.slice(1);
  $(id).classList.add('active');
  window.scrollTo(0,0);
}

function detectBrowserGate(){
  const ua = navigator.userAgent || '';
  const isLine = ua.includes('Line/');
  const isFacebook = ua.includes('FBAN') || ua.includes('FBAV') || ua.includes('FB_IAB') || ua.includes('FB4A') || ua.includes('FBAN/FBIOS');
  const isMessenger = ua.includes('Messenger') || ua.includes('FB_IAB/MESSENGER');
  const isInstagram = ua.includes('Instagram');
  const isTikTok = ua.includes('TikTok') || ua.includes('Bytedance') || ua.includes('Musical_ly');
  const isTwitter = ua.includes('Twitter') || ua.includes('XTwitter');
  const isWechat = ua.includes('MicroMessenger');
  const isInAppBrowser = isLine || isFacebook || isMessenger || isInstagram || isTikTok || isTwitter || isWechat;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isChromeAndroid = isAndroid && /Chrome|CriOS/i.test(ua) && !isInAppBrowser;
  const isAndroidBrowserOk = isAndroid && /Chrome|EdgA|Firefox|SamsungBrowser|OPR/i.test(ua) && !isInAppBrowser;
  const isIOSBrowserOk = isIOS && /Safari|CriOS|FxiOS|EdgiOS/i.test(ua) && !isInAppBrowser;
  const isDesktopOk = !isAndroid && !isIOS && /Chrome|Edg|Safari|Firefox/i.test(ua) && !isInAppBrowser;
  const appName = isLine ? 'LINE' : isMessenger ? 'Messenger' : isInstagram ? 'Instagram' : isTikTok ? 'TikTok' : isFacebook ? 'Facebook' : isTwitter ? 'X/Twitter' : isWechat ? 'WeChat' : 'แอปนี้';
  return {ua,isInAppBrowser,isAndroid,isIOS,isChromeAndroid,isSupported:isAndroidBrowserOk || isIOSBrowserOk || isDesktopOk,appName};
}

function renderBrowserGate(gate){
  $('browserGate').classList.remove('hidden');
  $('browserGateText').textContent = `ตอนนี้เปิดจาก ${gate.appName || 'แอป'} ซึ่งมักบล็อกไมโครโฟนหรือไม่ยอมเด้งไป Browser หลัก`;
  const steps = gate.isAndroid
    ? ['กด “เปิดด้วย Browser เครื่อง” เพื่อพยายามเปิด Chrome', 'ถ้าไม่เด้ง ให้กด “คัดลอกลิงก์”', 'เปิด Chrome เอง แล้ววางลิงก์']
    : gate.isIOS
      ? ['กด “คัดลอกลิงก์”', 'เปิด Safari หรือ Chrome จากหน้าจอเครื่อง', 'วางลิงก์ แล้วกดเข้าเว็บอีกครั้ง']
      : ['กด “คัดลอกลิงก์”', 'เปิด Browser หลักของเครื่อง', 'วางลิงก์ แล้วเข้าเว็บอีกครั้ง'];
  $('browserSteps').innerHTML = steps.map(x => `<li>${escapeHtml(x)}</li>`).join('');
}

async function startGate(){
  const gate = detectBrowserGate();
  if(!gate.isSupported){
    renderBrowserGate(gate);
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    alert('Browser นี้ไม่รองรับการใช้ไมโครโฟน กรุณาใช้ Chrome หรือ Safari');
    return;
  }
  $('browserGate').classList.add('hidden');
  await loadStudentAndChantData();
  setupStudentSelectors();
  showView('select');
}

async function loadStudentAndChantData(){
  if(state.students.length && state.chants.length) return;
  $('homeStatus').textContent = 'กำลังโหลดรายชื่อและบทสวด...';
  const [students, chants] = await Promise.all([fetchJson('students.json'), fetchJson('chants.json')]);
  state.students = normalizeStudents(students).filter(x => x.active !== false);
  state.chants = chants.filter(x => x.active !== false).sort((a,b)=>(a.order||0)-(b.order||0));
  $('homeStatus').textContent = `พร้อมใช้งาน: รายชื่อ ${fmt(state.students.length)} คน | บทสวด ${fmt(state.chants.length)} บท`;
}

function normalizeStudents(input){
  if(!Array.isArray(input)) return [];
  const out = [];
  input.forEach(item => {
    if(item && item.studentKey && item.level && item.room && item.no && item.fullName){
      out.push({
        studentKey:String(item.studentKey).trim(),
        level:String(item.level).trim(),
        room:String(item.room).trim(),
        no:String(item.no).trim(),
        fullName:String(item.fullName).replace(/\s+/g,' ').trim(),
        studentId:item.studentId ? String(item.studentId).trim() : '',
        active:item.active !== false && String(item.active).toLowerCase() !== 'false'
      });
      return;
    }
    // ช่วยกู้ไฟล์ที่แปลงผิดแบบ key/value เป็นแถวคั่นด้วย tab
    Object.keys(item || {}).forEach(k => {
      const v = item[k];
      [k, v].forEach(row => {
        if(typeof row !== 'string' || row.indexOf('\t') < 0) return;
        const cols = row.split('\t').map(x => x.trim());
        if(cols.length >= 5 && /^M\d-/i.test(cols[0])){
          out.push({
            studentKey:cols[0], level:cols[1], room:cols[2], no:cols[3],
            fullName:(cols[4] || '').replace(/\s+/g,' ').trim(),
            studentId:cols[5] && /^\d{5}$/.test(cols[5]) ? cols[5] : '',
            active:String(cols[cols.length-1]).toLowerCase() !== 'false'
          });
        }
      });
    });
  });
  const seen = new Set();
  return out.filter(s => {
    if(!s.studentKey || seen.has(s.studentKey)) return false;
    seen.add(s.studentKey);
    return true;
  });
}

function setupStudentSelectors(){
  const levels = unique(state.students.map(s => s.level)).sort(thSort);
  fillSelect($('levelSelect'), levels, 'เลือกระดับชั้น');
  fillSelect($('roomSelect'), [], 'เลือกห้อง');
  fillSelect($('studentSelect'), [], 'เลือกชื่อ-นามสกุล');
  $('studentIdInput').value = '';
  $('studentConfirmBox').classList.add('hidden');
}
function onLevelChange(){
  const level = $('levelSelect').value;
  const rooms = unique(state.students.filter(s=>s.level===level).map(s=>String(s.room))).sort(numSort);
  fillSelect($('roomSelect'), rooms, 'เลือกห้อง');
  fillSelect($('studentSelect'), [], 'เลือกชื่อ-นามสกุล');
  $('studentIdInput').value = '';
  $('studentConfirmBox').classList.add('hidden');
}
function onRoomChange(){
  const level = $('levelSelect').value;
  const room = $('roomSelect').value;
  const list = state.students
    .filter(s=>s.level===level && String(s.room)===String(room))
    .sort((a,b)=>numSort(a.no,b.no));
  $('studentSelect').innerHTML = '<option value="">เลือกชื่อ-นามสกุล</option>' + list.map(s => {
    const label = `เลขที่ ${s.no} - ${s.fullName}`;
    return `<option value="${escapeAttr(s.studentKey)}">${escapeHtml(label)}</option>`;
  }).join('');
  $('studentIdInput').value = '';
  renderStudentConfirm();
}
function onStudentIdInput(){
  const el = $('studentIdInput');
  el.value = el.value.replace(/\D/g,'').slice(0,5);
  renderStudentConfirm();
}
function renderStudentConfirm(){
  const stu = getSelectedStudent();
  const box = $('studentConfirmBox');
  if(!stu){box.classList.add('hidden');return;}
  const inputId = $('studentIdInput').value.trim();
  const idOk = /^\d{5}$/.test(inputId);
  const verifyText = inputId
    ? (idOk ? 'เลขประจำตัวครบ 5 หลัก' : 'เลขประจำตัวยังไม่ครบ 5 หลัก')
    : 'กรอกเลขประจำตัว 5 หลักเพื่อยืนยันก่อนเริ่ม';
  box.innerHTML = `<strong>${escapeHtml(stu.fullName)}</strong><div>ชั้น ${escapeHtml(stu.level)}/${escapeHtml(stu.room)} เลขที่ ${escapeHtml(stu.no)}</div><div class="muted small">${escapeHtml(verifyText)}</div>`;
  box.classList.remove('hidden');
}
function getSelectedStudent(){
  const key = $('studentSelect').value;
  return state.students.find(s => String(s.studentKey) === String(key)) || null;
}
function fillSelect(el, values, first){
  el.innerHTML = `<option value="">${first}</option>` + values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
}
function unique(arr){return [...new Set(arr.filter(Boolean))];}
function numSort(a,b){return String(a).localeCompare(String(b),'th',{numeric:true});}
function thSort(a,b){return String(a).localeCompare(String(b),'th',{numeric:true});}


async function confirmStudentAndStart(){
  const stu = getSelectedStudent();
  if(!stu){alert('กรุณาเลือกชื่อ-นามสกุล');return;}
  const inputId = $('studentIdInput').value.trim();
  if(!/^\d{5}$/.test(inputId)){alert('กรุณากรอกเลขประจำตัวนักเรียน 5 หลัก');return;}
  if(stu.studentId && String(stu.studentId).trim() !== inputId){alert('เลขประจำตัวไม่ตรงกับรายชื่อที่เลือก กรุณาตรวจสอบอีกครั้ง');return;}
  state.selectedStudent = {...stu, enteredStudentId: inputId};
  const key = submitKey(stu.studentKey, state.settings.weekKey);
  if(localStorage.getItem('submitted:' + key) === 'yes'){
    showAlreadySubmitted(); return;
  }
  if(state.settings.strictCheckBeforeChant && hasGasUrl()){
    $('btnConfirmStudent').disabled = true;
    $('btnConfirmStudent').textContent = 'กำลังเช็กประวัติ...';
    try{
      const res = await gasJsonp('check', {studentKey:stu.studentKey, weekKey:state.settings.weekKey});
      if(res && res.submitted){
        localStorage.setItem('submitted:' + key, 'yes');
        showAlreadySubmitted(); return;
      }
    }catch(err){
      console.warn('check failed',err);
      if(!confirm('เช็กประวัติจาก GAS ไม่สำเร็จ ต้องการเริ่มสวดต่อหรือไม่? หากเคยส่งแล้ว ระบบจะไม่บันทึกซ้ำ')) return;
    }finally{
      $('btnConfirmStudent').disabled = false;
      $('btnConfirmStudent').textContent = 'เริ่มสวดมนต์';
    }
  }
  try{
    await requestMicOnce();
    beginChantSession();
  }catch(err){
    alert('ไม่สามารถเปิดไมโครโฟนได้: ' + (err.name || err.message) + '\nกรุณาอนุญาตไมค์ หรือเปิดผ่าน Chrome/Safari');
  }
}
function showAlreadySubmitted(){
  alert('นักเรียนคนนี้ส่งคะแนนประจำสัปดาห์นี้แล้ว สามารถสวดได้อีกครั้งในสัปดาห์ถัดไป');
  goHomeSafe();
}
async function requestMicOnce(){
  const stream = await navigator.mediaDevices.getUserMedia({audio:true});
  stream.getTracks().forEach(t => t.stop());
}

function beginChantSession(){
  const level = state.selectedStudent.level;
  state.activeChants = state.chants.filter(c => c.levelGroup === 'all' || c.levelGroup === level || (Array.isArray(c.levelGroup) && c.levelGroup.includes(level)));
  if(!state.activeChants.length){alert('ยังไม่มีบทสวดที่เปิดใช้งาน');return;}
  state.currentChapterIndex = 0;
  state.chapters = [];
  state.totalScore = 0;
  showView('chant');
  loadCurrentChapter();
  startMic();
}
function loadCurrentChapter(){
  stopChapterTimers(false);
  const chant = state.activeChants[state.currentChapterIndex];
  const stu = state.selectedStudent;
  $('chantStudentLine').textContent = `${stu.fullName} | ชั้น ${stu.level}/${stu.room} เลขที่ ${stu.no} | รหัส ${stu.enteredStudentId || '-'}`;
  $('chantTitle').textContent = chant.title;
  $('chantMeta').textContent = `สัปดาห์ ${state.settings.weekKey} | บทที่ ${state.currentChapterIndex + 1}/${state.activeChants.length}`;
  $('chantText').innerHTML = (chant.lines || []).map(line => `<div class="chant-line">${escapeHtml(line)}</div>`).join('');
  $('chantStage').scrollTop = 0;
  state.ignoreScrollUntil = Date.now() + 700;
  $('liveTotalScore').textContent = Math.round(state.totalScore);
  $('btnNextChapter').textContent = state.currentChapterIndex === state.activeChants.length - 1 ? 'กดค้าง 2 วิ: จบบทสวด' : 'กดค้าง 2 วิ: บทถัดไป';
  resetAudioStats();
  startChapterTimers();
}
function startChapterTimers(){
  state.audio.startedAt = Date.now();
  state.autoScroll = true;
  clearInterval(state.scrollTimer);
  state.scrollTimer = setInterval(() => {
    const stage = $('chantStage');
    if(state.autoScroll && stage.scrollHeight > stage.clientHeight + 10){
      state.ignoreScrollUntil = Date.now() + 120;
      stage.scrollTop += Number(state.settings.autoScrollSpeed || 1.35);
    }
    updateTimer();
  }, 50);
}
function stopChapterTimers(stopMicToo=true){
  clearInterval(state.scrollTimer);
  clearTimeout(state.manualScrollTimer);
  if(stopMicToo) stopMic();
}
function onManualScroll(){
  if(!$('viewChant').classList.contains('active')) return;
  if(Date.now() < state.ignoreScrollUntil) return;
  state.autoScroll = false;
  $('micStateText').textContent = 'เลื่อนเองชั่วคราว ระบบจะเลื่อนต่อให้อัตโนมัติ';
  clearTimeout(state.manualScrollTimer);
  state.manualScrollTimer = setTimeout(()=>{state.autoScroll = true;}, Number(state.settings.manualScrollPauseMs || 4500));
}
function updateTimer(){
  const sec = Math.floor((Date.now() - state.audio.startedAt)/1000);
  $('timerText').textContent = `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
async function startMic(){
  try{
    state.audio.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:false}});
    state.audio.context = new (window.AudioContext || window.webkitAudioContext)();
    const source = state.audio.context.createMediaStreamSource(state.audio.stream);
    state.audio.analyser = state.audio.context.createAnalyser();
    state.audio.analyser.fftSize = 2048;
    state.audio.data = new Uint8Array(state.audio.analyser.frequencyBinCount);
    state.audio.timeData = new Uint8Array(state.audio.analyser.fftSize);
    source.connect(state.audio.analyser);
    state.audio.micOn = true;
    state.audio.noiseFloor = 0;
    state.audio.noiseSamples = [];
    state.audio.activeStreak = 0;
    state.audio.calibratingUntil = Date.now() + Number(state.settings.micCalibrationMs || 1600);
    $('btnMic').textContent = 'ไมค์: เปิด';
    $('micStateText').textContent = 'กำลังวัดเสียงพื้นหลัง...';
    audioLoop();
  }catch(err){
    $('micStateText').textContent = 'เปิดไมค์ไม่สำเร็จ';
    alert('เปิดไมโครโฟนไม่สำเร็จ: ' + err.message);
  }
}
function stopMic(){
  if(state.audio.raf) cancelAnimationFrame(state.audio.raf);
  state.audio.raf = null;
  if(state.audio.stream){state.audio.stream.getTracks().forEach(t => t.stop());}
  if(state.audio.context){state.audio.context.close().catch(()=>{});}
  state.audio.stream = null; state.audio.context = null; state.audio.analyser = null; state.audio.data = null; state.audio.micOn=false;
}
async function toggleMic(){
  if(!state.audio.context) return;
  if(state.audio.micOn){
    state.audio.micOn = false;
    await state.audio.context.suspend().catch(()=>{});
    $('btnMic').textContent = 'ไมค์: ปิด';
    $('micStateText').textContent = 'ไมค์ปิดชั่วคราว';
  }else{
    state.audio.micOn = true;
    await state.audio.context.resume().catch(()=>{});
    $('btnMic').textContent = 'ไมค์: เปิด';
    $('micStateText').textContent = 'ไมค์เปิด กำลังวิเคราะห์เสียง';
  }
}
function resetAudioStats(){
  state.audio.totalFrames=0; state.audio.activeFrames=0; state.audio.score=0; state.audio.combo=0; state.audio.bestCombo=0; state.audio.lastRms=0; state.audio.stabilitySum=0; state.audio.noiseSamples=[]; state.audio.noiseFloor=0; state.audio.activeStreak=0;
  $('comboText').textContent = 'คอมโบ x0';
  $('micStateText').textContent = 'กำลังเตรียมไมค์';
}
function audioLoop(){
  if(!state.audio.analyser){return;}
  if(state.audio.micOn){
    state.audio.analyser.getByteTimeDomainData(state.audio.timeData);
    const rms = calculateTimeRms(state.audio.timeData);

    if(Date.now() < state.audio.calibratingUntil){
      state.audio.noiseSamples.push(rms);
      const tmp = average(state.audio.noiseSamples);
      $('micStateText').textContent = `กำลังวัดเสียงพื้นหลัง ${tmp.toFixed(1)}`;
      state.audio.raf = requestAnimationFrame(audioLoop);
      return;
    }

    if(!state.audio.noiseFloor){
      state.audio.noiseFloor = Math.max(0, average(state.audio.noiseSamples));
    }

    const threshold = Math.max(
      Number(state.settings.minRmsThreshold || 10),
      state.audio.noiseFloor + Number(state.settings.noiseMargin || 8)
    );
    const rawActive = rms >= threshold;
    state.audio.activeStreak = rawActive ? state.audio.activeStreak + 1 : 0;
    const active = state.audio.activeStreak >= Number(state.settings.activeHoldFrames || 4);

    state.audio.totalFrames++;
    if(active){
      state.audio.activeFrames++;
      state.audio.combo++;
      state.audio.bestCombo = Math.max(state.audio.bestCombo, state.audio.combo);
      const diff = Math.abs(rms - state.audio.lastRms);
      state.audio.stabilitySum += Math.max(0, 100 - diff * 5);
      if(state.audio.combo > 0 && state.audio.combo % Number(state.settings.comboRgbEvery || 6) === 0){triggerRgb();}
      $('micStateText').textContent = rms > threshold * 2.4 ? 'เสียงดีมาก' : 'เสียงชัดเจน';
    }else{
      state.audio.combo = 0;
      $('micStateText').textContent = rawActive ? 'กำลังจับเสียง...' : 'เสียงยังไม่ชัด';
    }
    state.audio.lastRms = rms;
    const chapterScore = calculateCurrentChapterScore();
    state.audio.score = chapterScore;
    const liveTotal = state.totalScore + chapterScore;
    $('liveTotalScore').textContent = Math.round(liveTotal);
    $('comboText').textContent = `คอมโบ x${state.audio.combo}`;
  }
  state.audio.raf = requestAnimationFrame(audioLoop);
}
function calculateTimeRms(data){
  let sum = 0;
  for(let i=0;i<data.length;i++){
    const v = data[i] - 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}
function average(arr){
  if(!arr || !arr.length) return 0;
  return arr.reduce((a,b)=>a+b,0)/arr.length;
}
function calculateRms(data){
  let sum = 0;
  for(let i=0;i<data.length;i++){sum += data[i]*data[i];}
  return Math.sqrt(sum / data.length);
}
function calculateCurrentChapterScore(){
  const a = state.audio;
  const total = Math.max(1, a.totalFrames);
  const activePercent = a.activeFrames / total;
  const stability = a.activeFrames ? (a.stabilitySum / a.activeFrames) / 100 : 0;
  const comboFactor = Math.min(1, a.bestCombo / 240);
  const durationSec = Math.max(1, (Date.now() - a.startedAt) / 1000);
  const expectedSec = state.activeChants[state.currentChapterIndex]?.expectedSec || 60;
  const durationFactor = Math.min(1, durationSec / expectedSec);
  const score = (activePercent * 45) + (stability * 25) + (comboFactor * 15) + (durationFactor * 15);
  return Math.max(0, Math.min(100, score));
}
function triggerRgb(){
  const frame = $('rgbFrame');
  frame.classList.remove('rgb-on');
  void frame.offsetWidth;
  frame.classList.add('rgb-on');
  setTimeout(()=>frame.classList.remove('rgb-on'), 1200);
}

function startHoldNextChapter(evt){
  if(evt) evt.preventDefault();
  if(state.nextHoldTimer) return;
  state.nextHoldDone = false;
  const holdSec = Number(state.settings.nextChapterHoldSec || 2);
  const original = state.currentChapterIndex === state.activeChants.length - 1 ? 'กดค้าง 2 วิ: จบบทสวด' : 'กดค้าง 2 วิ: บทถัดไป';
  state.nextHoldStarted = Date.now();
  state.nextHoldTimer = setInterval(()=>{
    const elapsed = (Date.now() - state.nextHoldStarted) / 1000;
    const remain = Math.ceil(Math.max(0, holdSec - elapsed));
    $('btnNextChapter').textContent = remain > 0 ? `ปล่อยไม่ได้... ${remain}` : 'กำลังบันทึกบท';
    if(elapsed >= holdSec){
      clearInterval(state.nextHoldTimer);
      state.nextHoldTimer = null;
      state.nextHoldDone = true;
      nextChapter();
    }
  },80);
}
function cancelHoldNextChapter(){
  if(!state.nextHoldTimer) return;
  clearInterval(state.nextHoldTimer);
  state.nextHoldTimer = null;
  $('btnNextChapter').textContent = state.currentChapterIndex === state.activeChants.length - 1 ? 'กดค้าง 2 วิ: จบบทสวด' : 'กดค้าง 2 วิ: บทถัดไป';
}
function nextChapter(){
  const chant = state.activeChants[state.currentChapterIndex];
  const score = Math.round(calculateCurrentChapterScore());
  const duration = Math.floor((Date.now() - state.audio.startedAt)/1000);
  state.chapters.push({chantId: chant.chantId, title: chant.title, score, durationSec: duration, bestCombo: state.audio.bestCombo});
  state.totalScore = state.chapters.reduce((s,c)=>s+c.score,0);
  if(state.currentChapterIndex < state.activeChants.length - 1){
    state.currentChapterIndex++;
    loadCurrentChapter();
  }else{
    finishChant();
  }
}
function finishChant(){
  stopChapterTimers(true);
  const total = Math.round(state.totalScore);
  const requiredTotal = Number(state.settings.passScore || 70) * Math.max(1,state.chapters.length);
  showView('result');
  const stu = state.selectedStudent;
  $('resultStudentLine').textContent = `${stu.fullName} | ชั้น ${stu.level}/${stu.room} เลขที่ ${stu.no} | รหัส ${stu.enteredStudentId || '-'} | สัปดาห์ ${state.settings.weekKey}`;
  $('resultTotalScore').textContent = total;
  $('resultStatus').textContent = total >= requiredTotal ? (state.settings.resultTextPass || 'ผ่าน') : (state.settings.resultTextFail || 'ยังไม่ผ่าน');
  $('chapterResultList').innerHTML = state.chapters.map((c,i)=>`<div class="chapter-row"><span>${i+1}. ${escapeHtml(c.title)}</span><strong>${c.score} คะแนน</strong></div>`).join('') + `<div class="chapter-row total-row"><span>รวมทุกบท</span><strong>${total} คะแนน</strong></div>`;
  const plan = getWeeklySubmitPlan(stu);
  $('submitHint').textContent = `กดค้างเพื่อยืนยันการส่งคะแนน ระบบจะจัดคิวให้อัตโนมัติ กรุณาอย่าปิดหน้านี้จนกว่าจะได้รหัสอีโมจิ`;
  $('queueText').textContent = '';
  $('receiptBox').classList.add('hidden');
  $('receiptCode').textContent = '';
  $('btnHoldSubmit').disabled = false;
  $('btnHoldSubmit').textContent = `กดค้าง ${plan.holdSec} วินาที เพื่อยืนยัน`;
}

function getPayload(){
  const stu = state.selectedStudent;
  const totalScore = Math.round(state.totalScore);
  const requiredTotal = Number(state.settings.passScore || 70) * Math.max(1,state.chapters.length);
  return {
    action:'submitScore',
    source:'github-pages',
    sessionId: state.settings.sessionId,
    termKey: state.settings.termKey,
    weekKey: state.settings.weekKey,
    studentKey: stu.studentKey,
    studentId: stu.enteredStudentId || stu.studentId || '',
    level: stu.level,
    room: stu.room,
    no: stu.no,
    fullName: stu.fullName,
    totalScore,
    result: totalScore >= requiredTotal ? 'ผ่าน' : 'ยังไม่ผ่าน',
    chapters: state.chapters,
    micStatus: 'ok',
    submitPlan: getWeeklySubmitPlan(stu),
    submittedAtClient: new Date().toISOString(),
    userAgent: navigator.userAgent
  };
}
function startHoldSubmit(evt){
  if(evt) evt.preventDefault();
  if(state.isSubmitting) return;
  if(!hasGasUrl()){alert('ยังไม่ได้ใส่ gasApiUrl ใน data/settings.json');return;}
  const plan = getWeeklySubmitPlan(state.selectedStudent);
  const key = submitKey(state.selectedStudent.studentKey, state.settings.weekKey);
  if(localStorage.getItem('submitted:' + key) === 'yes') {showAlreadySubmitted();return;}
  $('holdProgressWrap').classList.remove('hidden');
  state.holdStarted = Date.now();
  clearInterval(state.holdTimer);
  state.holdTimer = setInterval(()=>{
    const elapsed = (Date.now() - state.holdStarted) / 1000;
    const pct = Math.min(100, (elapsed / plan.holdSec) * 100);
    $('holdProgress').style.width = pct + '%';
    $('queueText').textContent = `กดค้างต่อเนื่องอีก ${Math.ceil(Math.max(0, plan.holdSec - elapsed))} วินาที เพื่อยืนยัน`;
    if(elapsed >= plan.holdSec){
      clearInterval(state.holdTimer);
      state.holdTimer = null;
      $('holdProgress').style.width = '100%';
      beginQueuedSubmit(plan);
    }
  },80);
}
function cancelHoldSubmit(){
  if(!state.holdTimer) return;
  clearInterval(state.holdTimer); state.holdTimer = null;
  $('holdProgress').style.width = '0%';
  $('queueText').textContent = 'ยกเลิกการยืนยันส่งคะแนน';
}
async function beginQueuedSubmit(plan){
  state.isSubmitting = true;
  $('btnHoldSubmit').disabled = true;
  $('btnHoldSubmit').textContent = 'กำลังเตรียมส่งคะแนน...';
  await countdown(plan.sendAfterSec);
  const payload = getPayload();
  const key = submitKey(payload.studentKey, payload.weekKey);
  localStorage.setItem('pending:' + key, JSON.stringify(payload));
  await submitWithNoCors(payload);
  $('queueText').textContent = 'ส่งข้อมูลแล้ว กำลังออกอีโมจิประจำตัว...';
  const confirmed = await confirmSubmission(payload.studentKey, payload.weekKey);
  if(confirmed && confirmed.submitted){
    localStorage.setItem('submitted:' + key, 'yes');
    localStorage.removeItem('pending:' + key);
    const code = confirmed.receiptCode || '✅';
    showReceiptCode(code);
    $('queueText').textContent = 'ส่งคะแนนสำเร็จแล้ว กรุณาจดหรือแคปหน้าจอรหัสอีโมจิ';
    $('btnHoldSubmit').textContent = 'ส่งแล้ว';
  }else{
    $('queueText').textContent = 'ยังยืนยันผลไม่ได้ แต่ข้อมูลถูกส่งไปแล้ว หากยังไม่ขึ้นใน Dashboard ให้กดส่งซ้ำได้ ระบบจะกันข้อมูลซ้ำให้อัตโนมัติ';
    $('btnHoldSubmit').disabled = false;
    $('btnHoldSubmit').textContent = 'ลองส่งอีกครั้ง';
    state.isSubmitting = false;
  }
}
function countdown(seconds){
  return new Promise(resolve=>{
    let remain = Math.ceil(seconds);
    const tick=()=>{
      $('queueText').textContent = `กำลังรอคิวส่งคะแนน เหลือ ${remain} วินาที กรุณาอย่าปิดหน้านี้`;
      if(remain <= 0){resolve();return;}
      remain--; setTimeout(tick,1000);
    };
    tick();
  });
}
async function submitWithNoCors(payload){
  const url = state.settings.gasApiUrl;
  await fetch(url, {method:'POST', mode:'no-cors', body: JSON.stringify(payload)});
}
async function confirmSubmission(studentKey, weekKey){
  for(let i=0;i<6;i++){
    await sleep(3000 + i*1500);
    try{
      const res = await gasJsonp('check', {studentKey, weekKey});
      if(res && res.submitted) return res;
    }catch(err){console.warn('confirm failed',err)}
  }
  return null;
}
function showReceiptCode(code){
  state.receiptCode = code;
  $('receiptCode').textContent = code;
  $('receiptBox').classList.remove('hidden');
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function getWeeklySubmitPlan(stu){
  const s = state.settings;
  const totalStudents = Number(s.totalStudents || 1700);
  const batchSize = Number(s.batchSize || 170);
  const batchCount = Math.max(1, Math.ceil(totalStudents / batchSize));
  const key = `${s.termKey}-${s.weekKey}-${stu.level}-${stu.room}-${stu.no}-${stu.fullName}`;
  const hash = simpleHash(key);
  const batch = hash % batchCount;
  const jitter = hash % Number(s.innerJitterSec || 30);
  const holdOptions = s.holdOptions || [6,8,10,12,15,18,20];
  const holdSec = holdOptions[hash % holdOptions.length];
  const sendAfterSec = batch * Number(s.batchGapSec || 30) + jitter;
  return {batch: batch+1, holdSec, sendAfterSec};
}
function simpleHash(text){let hash=0; for(let i=0;i<text.length;i++){hash=((hash<<5)-hash)+text.charCodeAt(i); hash|=0;} return Math.abs(hash);}
function submitKey(studentKey, weekKey){return `${weekKey}::${studentKey}`;}

function hasGasUrl(){return state.settings && state.settings.gasApiUrl && !state.settings.gasApiUrl.includes('PASTE_');}
function gasJsonp(action, params={}){
  return new Promise((resolve,reject)=>{
    if(!hasGasUrl()) return reject(new Error('ยังไม่ได้ตั้งค่า gasApiUrl'));
    const cb = 'jsonp_' + Date.now() + '_' + Math.floor(Math.random()*99999);
    const qs = new URLSearchParams({...params, action, callback: cb, t: Date.now()});
    const script = document.createElement('script');
    const timeout = setTimeout(()=>{cleanup(); reject(new Error('GAS JSONP timeout'));}, 25000);
    function cleanup(){clearTimeout(timeout); delete window[cb]; script.remove();}
    window[cb] = (data)=>{cleanup(); resolve(data);};
    script.onerror = ()=>{cleanup(); reject(new Error('โหลด GAS ไม่สำเร็จ'));};
    script.src = state.settings.gasApiUrl + '?' + qs.toString();
    document.body.appendChild(script);
  });
}
async function loadLiveSummaryToHome(){
  $('btnRefreshHomeLive').disabled = true;
  $('btnRefreshHomeLive').textContent = 'กำลังโหลด...';
  try{
    const data = await gasJsonp('summary', {termKey: state.settings.termKey});
    state.homeSummary = data.summary || data;
    renderHome();
  }catch(err){alert('โหลดข้อมูลสดไม่สำเร็จ: ' + err.message);}
  finally{$('btnRefreshHomeLive').disabled=false;$('btnRefreshHomeLive').textContent='ดึงข้อมูลล่าสุด';}
}
function adminLogin(){
  if($('adminPinInput').value !== String(state.settings.adminPin || '1234')){alert('รหัสไม่ถูกต้อง');return;}
  $('adminLoginBox').classList.add('hidden');
  $('dashboardPanel').classList.remove('hidden');
}
async function loadDashboardSummary(){
  $('btnLoadLiveSummary').disabled = true;
  $('btnLoadLiveSummary').textContent = 'กำลังโหลด...';
  try{
    const data = await gasJsonp('summary', {termKey: state.settings.termKey});
    state.liveSummary = data.summary || data;
    renderDashboard(state.liveSummary);
  }catch(err){alert('โหลด Dashboard ไม่สำเร็จ: ' + err.message);}
  finally{$('btnLoadLiveSummary').disabled=false;$('btnLoadLiveSummary').textContent='โหลดข้อมูลสดจาก GAS';}
}
function renderDashboard(s){
  $('dashboardSummary').innerHTML = `
    <article class="stat-card"><span>คะแนนรวม</span><strong>${fmt(s.termTotalScore)}</strong></article>
    <article class="stat-card"><span>ส่งแล้ว</span><strong>${fmt(s.totalSubmitted)}</strong><small>${escapeHtml(s.updatedAt||'')}</small></article>
    <article class="stat-card"><span>ระดับตึงสุด</span><strong>${escapeHtml(s.bestLevel||'-')}</strong><small>${Number(s.bestLevelScore||0).toFixed(2)}</small></article>
    <article class="stat-card"><span>ห้องเด่นสุด</span><strong>${escapeHtml(s.bestRoom||'-')}</strong><small>${Number(s.bestRoomScore||0).toFixed(2)}</small></article>`;
  renderTop10($('dashboardTop10'), s.top10 || []);
  $('dashboardTables').innerHTML = renderGroupTable('ระดับชั้น', s.levels || []) + renderGroupTable('ห้องเรียน', s.rooms || []);
}
function renderTop10(el, list){
  if(!list || !list.length){el.className='rank-list empty'; el.textContent='ยังไม่มีข้อมูลอันดับ หรือยังไม่ได้อัปเดตสรุป'; return;}
  el.className='rank-list';
  el.innerHTML = list.slice(0,10).map((r,i)=>`<div class="rank-row"><b>${i+1}</b><div><strong>${escapeHtml(r.fullName||'-')}</strong><br><small>${escapeHtml((r.level||'') + '/' + (r.room||''))} เลขที่ ${escapeHtml(r.no||'-')} | ส่ง ${fmt(r.submittedCount||0)} ครั้ง | เฉลี่ย ${Number(r.avgScore||0).toFixed(2)}</small></div><span class="score">${fmt(r.termScore||0)}</span></div>`).join('');
}
function renderGroupTable(title, rows){
  if(!rows.length) return `<h3>${title}</h3><p class="muted">ยังไม่มีข้อมูล</p>`;
  return `<h3>${title}</h3><table class="data-table"><thead><tr><th>กลุ่ม</th><th>จำนวน</th><th>ส่ง</th><th>เฉลี่ย</th><th>ผ่าน</th><th>Fair Score</th><th>คะแนนรวม</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${fmt(r.totalStudents||0)}</td><td>${fmt(r.submitted||0)}</td><td>${Number(r.avgScore||0).toFixed(2)}</td><td>${Number(r.passRate||0).toFixed(1)}%</td><td><strong>${Number(r.fairScore||0).toFixed(2)}</strong></td><td>${fmt(r.totalScore||0)}</td></tr>`).join('')}</tbody></table>`;
}
function exportSummaryCsv(){
  if(!state.liveSummary){alert('กรุณาโหลดข้อมูลสดก่อน');return;}
  const rows = [['type','name','totalStudents','submitted','avgScore','passRate','fairScore','totalScore']];
  (state.liveSummary.levels || []).forEach(r=>rows.push(['level',r.name,r.totalStudents,r.submitted,r.avgScore,r.passRate,r.fairScore,r.totalScore]));
  (state.liveSummary.rooms || []).forEach(r=>rows.push(['room',r.name,r.totalStudents,r.submitted,r.avgScore,r.passRate,r.fairScore,r.totalScore]));
  const csv = rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'chant_summary.csv'; a.click(); URL.revokeObjectURL(a.href);
}
function cleanCurrentUrl(){
  return window.location.origin + window.location.pathname + window.location.search;
}
function openSupportedBrowser(){
  const url = cleanCurrentUrl();
  const ua = navigator.userAgent || '';
  copyCurrentLink(false);
  if(/Android/i.test(ua)){
    const withoutProtocol = url.replace(/^https?:\/\//, '');
    const intent = `intent://${withoutProtocol}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    window.location.href = intent;
    setTimeout(()=>{
      $('queueText') && ($('queueText').textContent = 'ถ้าไม่เด้งไป Chrome ให้เปิด Chrome แล้ววางลิงก์ที่คัดลอกไว้');
    }, 900);
    return;
  }
  if(/iPhone|iPad|iPod/i.test(ua)){
    // พยายามเปิด Chrome iOS ถ้าผู้ใช้ติดตั้งไว้; ถ้าแอปต้นทางบล็อก จะยังมีลิงก์ในคลิปบอร์ด
    const chromeUrl = url.replace(/^https:\/\//, 'googlechromes://').replace(/^http:\/\//, 'googlechrome://');
    window.location.href = chromeUrl;
    setTimeout(()=>{
      alert('คัดลอกลิงก์แล้ว หากยังไม่เด้ง ให้เปิด Safari หรือ Chrome จากหน้าจอเครื่อง แล้ววางลิงก์');
    }, 900);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

async function copyCurrentLink(showAlert=true){
  const url = cleanCurrentUrl();
  try{await navigator.clipboard.writeText(url); if(showAlert) alert('คัดลอกลิงก์แล้ว');}
  catch{prompt('คัดลอกลิงก์นี้', url);}
}
function goHomeSafe(){
  stopChapterTimers(true);
  state.selectedStudent=null; state.chapters=[]; state.totalScore=0; state.isSubmitting=false; state.receiptCode='';
  showView('home');
}
function escapeHtml(v){return String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function escapeAttr(v){return escapeHtml(v).replace(/'/g,'&#039;');}
