/* =====================================================================
   SMA Housing System — Student Housing Management (full-stack edition)
   Frontend SPA served by the Node/Express API in server.js.
   Data layer: REST + batch sync against /api (PostgreSQL or SQLite).
===================================================================== */

/* ---------------- API data layer ---------------- */
let ENV = localStorage.getItem('sma:env') || 'prod';   // 'prod' | 'test'
let TOKEN = localStorage.getItem('sma:token') || null;
const COLLECTIONS = ['students','buildings','rooms','allocations','attendance','movements',
  'violations','complaints','requests','documents','calendar','notifications','audit',
  'master','roles','users','settings','files'];
let DB = {};                          // client cache of the current environment
let SERVER_META = {};

async function api(path, options={}){
  const headers = Object.assign({'Content-Type':'application/json','X-Env':ENV}, options.headers||{});
  if(TOKEN) headers['Authorization'] = 'Bearer '+TOKEN;
  const res = await fetch('/api'+path, Object.assign({}, options, {headers}));
  if(res.status===401 && TOKEN && !path.startsWith('/auth/')){ sessionExpired(); throw new Error('Session expired'); }
  return res;
}
function sessionExpired(){
  TOKEN=null; localStorage.removeItem('sma:token');
  $('#app').classList.remove('on'); $('#loginScreen').style.display='flex';
  toast('Session expired — please sign in again.');
}

/* save(col): debounced batch sync of one collection to the server.
   The server diffs against the database, writes the changes and audits each one.
   403 = the current role cannot write that collection server-side; local cache keeps working. */
const saveTimers = {};
function save(col){
  if(col==='audit') return;                       // audit is server-generated
  if(saveTimers[col]) clearTimeout(saveTimers[col]);
  saveTimers[col] = setTimeout(async ()=>{
    try{
      const r = await api('/sync/'+col, {method:'PUT', body: JSON.stringify(DB[col])});
      if(r.status===403) console.warn('sync '+col+': not permitted for this role');
      else if(!r.ok) console.warn('sync '+col+' failed', r.status);
    }catch(e){ console.warn('sync '+col+' error', e.message); }
  }, 300);
}
function saveAll(){ COLLECTIONS.forEach(c=>{ if(c!=='audit') save(c); }); }

async function loadEnv(){
  const r = await api('/bootstrap');
  if(!r.ok) throw new Error('bootstrap failed: '+r.status);
  const data = await r.json();
  SERVER_META = data._meta||{}; delete data._meta;
  return data;
}

/* ---------------- Utilities ---------------- */
const $=q=>document.querySelector(q);
const uid=p=>(p||'ID')+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
const todayStr=()=>new Date().toISOString().slice(0,10);
const nowTime=()=>new Date().toTimeString().slice(0,5);
const fmtD=d=>d?new Date(d+'T00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'—';
const fmtDT=iso=>iso?new Date(iso).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(t._h);t._h=setTimeout(()=>t.style.display='none',2600);}
function hoursBetween(a,b){ return Math.round((new Date(b)-new Date(a))/36e5*10)/10; }

/* status → tag color */
const TAGC = {'Present':'green','Absent':'brick','Hospital':'violet','Official Leave':'blue','Weekend Leave':'amber','Unknown':'grey',
'Open':'brick','Investigation':'amber','Decision':'blue','Closed':'grey',
'Submitted':'blue','Assigned':'violet','In Progress':'amber','Resolved':'green',
'Under Review':'amber','Approved':'green','Completed':'grey','Rejected':'brick',
'Active':'green','Inactive':'grey','High':'brick','Medium':'amber','Low':'blue'};
const tag=s=>`<span class="tag ${TAGC[s]||'grey'}">${esc(s)}</span>`;

/* ---------------- Audit trail ---------------- */
function audit(action, entity, entityId, details){
  const rec = { id:uid('AUD'), at:new Date().toISOString(),
    user: CURRENT_USER? CURRENT_USER.name : 'system', role: CURRENT_USER? CURRENT_USER.role : '—',
    action, entity, entityId, details: details||'' };
  DB.audit.unshift(rec);                          // immediate UI echo
  if(DB.audit.length>3000) DB.audit.length=3000;
  api('/audit',{method:'POST',body:JSON.stringify({action,entity,entityId,details})}).catch(()=>{});
}

/* ---------------- Notifications ---------------- */
function notify(type, title, body, link){
  DB.notifications.unshift({id:uid('NTF'), at:new Date().toISOString(), type, title, body, link:link||null, read:false});
  if(DB.notifications.length>500) DB.notifications.length=500;
  save('notifications'); updateNotifDot();
}
function updateNotifDot(){ $('#notifDot').style.display = DB.notifications.some(n=>!n.read)?'block':'none'; }

/* ---------------- Master data helpers (date-range aware) ---------------- */
function masterList(type, onDate){
  const d = onDate || todayStr();
  return (DB.master||[]).filter(m=>m.type===type && m.active!==false
      && (!m.from || m.from<=d) && (!m.to || m.to>=d))
    .map(m=>m.value);
}
function optionsHtml(arr, sel){ return arr.map(v=>`<option ${v===sel?'selected':''}>${esc(v)}</option>`).join(''); }

/* ---------------- Seed data ---------------- */
function seedData(){
  const master=[];
  const addM=(type,vals)=>vals.forEach(v=>master.push({id:uid('MD'),type,value:v,from:'2025-01-01',to:'',active:true}));
  addM('college',['Engineering','Medicine','Business','Computer Science','Law','Sciences','Arts & Humanities']);
  addM('violationType',['Noise disturbance','Smoking','Security violation','Property damage']);
  addM('complaintCategory',['Maintenance','Housekeeping','Room-related','Roommate','Internet','Dining Services','Security','Others']);
  addM('maintenanceSub',['Electrical','HVAC','Plumbing','Furniture','Internet','Doors','Equipment']);
  addM('requestType',['Room change','Exit permission','Leave extension','Furniture request','Equipment request','Housing certificate','Personal belongings retrieval']);
  addM('attendanceStatus',['Present','Absent','Hospital','Official Leave','Weekend Leave','Unknown']);
  addM('docType',['Housing agreement','Undertaking','Report','ID copy','Medical note','Supporting document']);
  addM('disciplinaryAction',['Verbal warning','Written warning','Fine','Community service','Referral to committee','Housing suspension']);

  const buildings=[{id:'B1',name:'Building A',floors:4},{id:'B2',name:'Building B',floors:4},{id:'B3',name:'Building C',floors:3}];
  const rooms=[]; let rn=0;
  buildings.forEach(b=>{ for(let f=1;f<=b.floors;f++) for(let r=1;r<=6;r++){ rn++;
    rooms.push({id:`${b.id}-${f}${String(r).padStart(2,'0')}`,buildingId:b.id,floor:f,number:`${f}${String(r).padStart(2,'0')}`,capacity:2,active:true}); }});

  const first=['Ahmed','Sara','Omar','Layla','Yousef','Noura','Khalid','Mona','Fahad','Reem','Hassan','Dana','Tariq','Aisha','Salem','Huda','Nasser','Lina','Majed','Farah','Ali','Rana','Ziad','Maha'];
  const last=['Al-Harbi','Al-Otaibi','Khan','Haddad','Nasser','Saleh','Rahman','Aziz','Qassim','Farouk','Mansour','Zaki'];
  const colleges=masterListFrom(master,'college');
  const students=[]; 
  for(let i=0;i<24;i++){
    const room=rooms[i]; const name=`${first[i]} ${last[i%last.length]}`;
    students.push({ id:'STU-'+String(1001+i), name, email:name.toLowerCase().replace(/[^a-z]+/g,'.')+'@univ.edu',
      phone:'05'+String(50000000+i*13579).slice(0,8), college:colleges[i%colleges.length],
      building:room.buildingId, room:room.id, status:'Active', joined:'2025-08-20',
      emergency:'Guardian · 0500-000-'+String(100+i) });
  }
  const allocations=students.map(s=>({id:uid('ALC'),studentId:s.id,roomId:s.room,from:'2025-08-20',to:'',note:'Semester move-in'}));

  const today=todayStr();
  const attendance=students.map((s,i)=>({id:uid('ATT'),date:today,studentId:s.id,
    status:i%9===0?'Absent':i%11===0?'Weekend Leave':i%13===0?'Hospital':'Present',
    note:'',by:'System seed',at:new Date().toISOString()}));

  const now=new Date();
  const iso=(h)=>new Date(now.getTime()-h*36e5).toISOString();
  const movements=[
    {id:uid('MOV'),studentId:students[2].id,type:'Exit',at:iso(6),expectedReturn:iso(-2),returnedAt:null,purpose:'Family visit',by:'Gate 1'},
    {id:uid('MOV'),studentId:students[5].id,type:'Exit',at:iso(30),expectedReturn:iso(24),returnedAt:null,purpose:'Weekend leave',by:'Gate 1'},
    {id:uid('MOV'),studentId:students[7].id,type:'Exit',at:iso(9),expectedReturn:iso(4),returnedAt:iso(2),purpose:'Medical appointment',by:'Gate 2',late:true},
    {id:uid('MOV'),studentId:students[1].id,type:'Exit',at:iso(3),expectedReturn:iso(-5),returnedAt:null,purpose:'Library',by:'Gate 1'},
    {id:uid('MOV'),studentId:students[10].id,type:'Entry',at:iso(1),expectedReturn:null,returnedAt:null,purpose:'Return from class',by:'Gate 1'},
  ];

  const violations=[
    {id:'VIO-2001',studentId:students[3].id,type:'Noise disturbance',date:today,time:'23:40',location:'Building A · Floor 2',
     description:'Loud music after quiet hours despite prior warning.',staff:'S. Rahman',action:'Verbal warning',status:'Investigation',attachments:[],history:[{at:iso(10),by:'S. Rahman',note:'Reported'},{at:iso(8),by:'Supervisor',note:'Moved to Investigation'}]},
    {id:'VIO-2002',studentId:students[8].id,type:'Smoking',date:today,time:'21:15',location:'Building B · Stairwell',
     description:'Smoking in a non-designated indoor area.',staff:'K. Aziz',action:'Written warning',status:'Open',attachments:[],history:[{at:iso(5),by:'K. Aziz',note:'Reported'}]},
    {id:'VIO-2003',studentId:students[3].id,type:'Property damage',date:'2025-08-28',time:'18:00',location:'Building A · Room A-203',
     description:'Broken desk chair; damage assessment pending.',staff:'M. Saleh',action:'Fine',status:'Closed',attachments:[],history:[{at:iso(90),by:'M. Saleh',note:'Reported'},{at:iso(60),by:'Committee',note:'Decision: fine issued'},{at:iso(40),by:'Committee',note:'Closed'}]},
  ];

  const complaints=[
    {id:'CMP-3001',studentId:students[4].id,category:'Maintenance',sub:'HVAC',title:'AC not cooling',description:'Room AC blows warm air since Monday.',
     status:'In Progress',assignee:'Facilities · HVAC team',priority:'High',createdAt:iso(20),respondedAt:iso(18),resolvedAt:null,attachments:[],comments:[{at:iso(18),by:'Supervisor',text:'Assigned to HVAC team'},{at:iso(6),by:'HVAC team',text:'Part ordered, fix tomorrow'}]},
    {id:'CMP-3002',studentId:students[6].id,category:'Internet',sub:'',title:'Wi-Fi drops in Room B-105',description:'Connection drops every few minutes in the evening.',
     status:'Resolved',assignee:'IT Services',priority:'Medium',createdAt:iso(50),respondedAt:iso(46),resolvedAt:iso(30),attachments:[],comments:[{at:iso(30),by:'IT Services',text:'Access point replaced'}]},
    {id:'CMP-3003',studentId:students[9].id,category:'Housekeeping',sub:'',title:'Corridor cleaning schedule',description:'Floor 3 corridor missed cleaning twice this week.',
     status:'Submitted',assignee:'',priority:'Low',createdAt:iso(4),respondedAt:null,resolvedAt:null,attachments:[],comments:[]},
  ];

  const requests=[
    {id:'REQ-4001',studentId:students[11].id,type:'Room change',details:'Requesting quieter room; conflict with roommate schedule.',status:'Under Review',createdAt:iso(26),decidedAt:null,history:[{at:iso(26),by:students[11].name,note:'Submitted'},{at:iso(20),by:'Supervisor',note:'Under review'}]},
    {id:'REQ-4002',studentId:students[13].id,type:'Housing certificate',details:'Certificate needed for scholarship office.',status:'Approved',createdAt:iso(48),decidedAt:iso(24),history:[{at:iso(48),by:students[13].name,note:'Submitted'},{at:iso(24),by:'Admin',note:'Approved'}]},
    {id:'REQ-4003',studentId:students[15].id,type:'Exit permission',details:'Weekend exit — family event, return Sunday 20:00.',status:'Submitted',createdAt:iso(3),decidedAt:null,history:[{at:iso(3),by:students[15].name,note:'Submitted'}]},
  ];

  const documents=[
    {id:'DOC-5001',studentId:students[0].id,type:'Housing agreement',name:'housing-agreement-2025.pdf',uploadedAt:iso(300),by:'Admin',size:'—',fileKey:null},
    {id:'DOC-5002',studentId:students[3].id,type:'Undertaking',name:'quiet-hours-undertaking.pdf',uploadedAt:iso(60),by:'S. Rahman',size:'—',fileKey:null},
  ];

  const calendar=[
    {id:uid('CAL'),date:today,title:'Daily roll call — 21:00',type:'rollcall'},
    {id:uid('CAL'),date:addDays(today,2),title:'Fire safety inspection · Building B',type:'inspection'},
    {id:uid('CAL'),date:addDays(today,5),title:'Planned maintenance — water pumps',type:'maintenance'},
    {id:uid('CAL'),date:addDays(today,9),title:'Movie night · Common hall',type:'event'},
    {id:uid('CAL'),date:addDays(today,20),title:'Mid-semester room inspections',type:'inspection'},
  ];

  const roles=[
    {id:'ROLE-ADMIN',name:'Administrator',desc:'Full access to every page and action.',perms:'ALL',system:true},
    {id:'ROLE-SUP',name:'Housing Supervisor',desc:'Runs daily operations.',perms:{}, system:false},
    {id:'ROLE-SEC',name:'Security Officer',desc:'Gate entry/exit and roll call.',perms:{}, system:false},
    {id:'ROLE-VIEW',name:'Viewer',desc:'Read-only access to dashboards and reports.',perms:{}, system:false},
  ];
  const users=[
    {id:'USR-1',name:'Amal Director',email:'amal.director@univ.edu',role:'Administrator',active:true},
    {id:'USR-2',name:'Sami Supervisor',email:'sami.sup@univ.edu',role:'Housing Supervisor',active:true},
    {id:'USR-3',name:'Ghada Gatekeeper',email:'ghada.sec@univ.edu',role:'Security Officer',active:true},
    {id:'USR-4',name:'Vera Viewer',email:'vera.view@univ.edu',role:'Viewer',active:true},
  ];
  // sensible default permissions for non-admin roles (filled after PAGES defined at runtime)
  return {students,buildings,rooms,allocations,attendance,movements,violations,complaints,requests,documents,
    calendar,notifications:[
      {id:uid('NTF'),at:new Date().toISOString(),type:'rollcall',title:'Daily roll call reminder',body:'Roll call for '+fmtD(today)+' is scheduled at 21:00.',read:false},
      {id:uid('NTF'),at:iso(4),type:'violation',title:'New violation reported',body:'VIO-2002 · Smoking · Building B stairwell.',read:false},
    ],audit:[{id:uid('AUD'),at:new Date().toISOString(),user:'system',role:'—',action:'SEED',entity:'database',entityId:'—',details:'Demo dataset initialised',env:'prod'}],
    master,roles,users,settings:{semester:'Fall 2026',semesterStart:'2025-08-20',semesterEnd:'2026-12-20',rollcallTime:'21:00'},files:{}};
}
function masterListFrom(master,type){ return master.filter(m=>m.type===type).map(m=>m.value); }
function addDays(d,n){ const x=new Date(d+'T00:00'); x.setDate(x.getDate()+n); return x.toISOString().slice(0,10); }

/* ---------------- Pages, permissions, auth ---------------- */
const PAGES=[
  {id:'dashboard',    label:'Dashboard',      icon:'📊', sec:'Overview', actions:[]},
  {id:'students',     label:'Students',       icon:'🎓', sec:'Residents', actions:['add','edit','deactivate','allocate','export']},
  {id:'attendance',   label:'Attendance & Roll Call', icon:'🗓️', sec:'Residents', actions:['record','edit','export']},
  {id:'movements',    label:'Entry / Exit Log',icon:'🚪', sec:'Residents', actions:['record','return','export']},
  {id:'violations',   label:'Violations',     icon:'⚠️', sec:'Cases', actions:['add','update','close','export']},
  {id:'complaints',   label:'Complaints & Maintenance', icon:'🛠️', sec:'Cases', actions:['add','update','comment','export']},
  {id:'requests',     label:'Student Requests',icon:'✉️', sec:'Cases', actions:['add','approve','reject','export']},
  {id:'documents',    label:'Document Register',icon:'📄', sec:'Records', actions:['upload','delete','export']},
  {id:'calendar',     label:'Housing Calendar',icon:'📅', sec:'Records', actions:['add','delete']},
  {id:'notifications',label:'Notifications',  icon:'🔔', sec:'Records', actions:['announce']},
  {id:'reports',      label:'Reports',        icon:'📈', sec:'Records', actions:['export']},
  {id:'audit',        label:'Audit Trail',    icon:'🧾', sec:'Administration', actions:['export']},
  {id:'master',       label:'Master Data',    icon:'🗂️', sec:'Administration', actions:['add','edit','delete']},
  {id:'roles',        label:'Roles & Users',  icon:'🛡️', sec:'Administration', actions:['add','edit']},
  {id:'integration',  label:'Integration & API',icon:'🔌', sec:'Administration', actions:['clone']},
];

let CURRENT_USER=null, CURRENT_PAGE='dashboard', PAGE_ARG=null;

function defaultPerms(roleName){
  const p={};
  const grant=(pg,acts,view=true)=>{p[pg]={view,actions:{}};(acts||[]).forEach(a=>p[pg].actions[a]=true);};
  if(roleName==='Housing Supervisor'){
    ['dashboard','students','attendance','movements','violations','complaints','requests','documents','calendar','notifications','reports'].forEach(pg=>{
      const def=PAGES.find(x=>x.id===pg); grant(pg,def.actions);
    });
  } else if(roleName==='Security Officer'){
    grant('dashboard',[]); grant('attendance',['record','export']); grant('movements',['record','return','export']); grant('students',[]); grant('notifications',[]);
  } else if(roleName==='Viewer'){
    ['dashboard','students','attendance','movements','violations','complaints','requests','reports','calendar'].forEach(pg=>grant(pg,[]));
  }
  return p;
}
function roleOf(name){ return DB.roles.find(r=>r.name===name); }
function can(page, action){
  if(!CURRENT_USER) return false;
  const role=roleOf(CURRENT_USER.role);
  if(!role) return false;
  if(role.perms==='ALL') return true;
  const p=role.perms[page];
  if(!p||!p.view) return false;
  if(!action) return true;
  return !!p.actions[action];
}
/* render an action button only if permitted */
function abtn(page,action,html){ return can(page,action)? html : ''; }

function populateLogin(){
  const pill=$('#loginEnvPill');
  pill.textContent = ENV==='prod'?'PRODUCTION':'NON-PRODUCTION';
  pill.style.background = ENV==='prod'?'var(--leaf-soft)':'var(--amber-soft)';
  pill.style.color = ENV==='prod'?'var(--leaf)':'var(--amber)';
}
async function localLogin(){
  const username=$('#loginUser').value.trim(), password=$('#loginPass').value;
  if(!username||!password) return toast('Enter username and password');
  const btn=$('#loginBtn'); btn.disabled=true; btn.textContent='Signing in…';
  try{
    const r=await api('/auth/login',{method:'POST',body:JSON.stringify({username,password})});
    const data=await r.json();
    if(!r.ok){ toast(data.error||'Sign-in failed'); return; }
    TOKEN=data.token; localStorage.setItem('sma:token',TOKEN);
    await startSession(data.user,'local');
  }catch(e){ toast('Cannot reach the server: '+e.message); }
  finally{ btn.disabled=false; btn.textContent='Sign in'; }
}
function ssoLogin(){
  toast('Set AUTH_MODE=entra and the ENTRA_* values in .env, then wire MSAL in the browser — see README for the two Entra app registrations.');
}
async function startSession(u,method){
  CURRENT_USER=u;
  try{
    DB=await loadEnv();
    // First run: the server holds only identities; seed demo business data and sync it up.
    if(!DB.students || !DB.students.length){
      const seeded=seedData();
      for(const c of COLLECTIONS){ if(c==='roles'||c==='users'||c==='audit') continue; if(seeded[c]!==undefined) DB[c]=seeded[c]; }
      if(!DB.settings||!Object.keys(DB.settings).length) DB.settings=seeded.settings;
      saveAll();
      toast('First run — demo data created and saved to the database.');
    }
    COLLECTIONS.forEach(c=>{ if(DB[c]==null) DB[c]=(c==='settings'||c==='files')?{}:[]; });
    DB.roles.forEach(r=>{ if(r.perms!=='ALL'&&(!r.perms||!Object.keys(r.perms).length)) r.perms=defaultPerms(r.name); });
  }catch(e){ toast('Could not load data: '+e.message); return; }
  audit('LOGIN','session',u.id,`Signed in (${method})`);
  $('#loginScreen').style.display='none';
  $('#app').classList.add('on');
  $('#uName').textContent=u.name; $('#uRole').textContent=u.role+' · '+(ENV==='prod'?'Production':'Non-Prod');
  $('#uAvatar').textContent=u.name.split(' ').map(x=>x[0]).slice(0,2).join('');
  buildNav(); updateNotifDot(); dailyChecks();
  go(can('dashboard')?'dashboard':PAGES.find(p=>can(p.id))?.id||'dashboard');
}
function logout(){
  audit('LOGOUT','session',CURRENT_USER?CURRENT_USER.id:'—','Signed out');
  CURRENT_USER=null; TOKEN=null; localStorage.removeItem('sma:token');
  $('#app').classList.remove('on'); $('#loginScreen').style.display='flex';
  populateLogin();
}

/* ---------------- Navigation / router ---------------- */
function buildNav(){
  let html='',sec='';
  PAGES.forEach(p=>{
    if(!can(p.id)) return;
    if(p.sec!==sec){ sec=p.sec; html+=`<div class="nav-sec">${sec}</div>`; }
    let badge='';
    if(p.id==='requests'){ const n=DB.requests.filter(r=>['Submitted','Under Review'].includes(r.status)).length; if(n) badge=`<span class="badge">${n}</span>`; }
    if(p.id==='complaints'){ const n=DB.complaints.filter(c=>!['Resolved','Closed'].includes(c.status)).length; if(n) badge=`<span class="badge">${n}</span>`; }
    html+=`<button class="nav-item ${p.id===CURRENT_PAGE?'active':''}" onclick="go('${p.id}')">${p.icon} ${p.label} ${badge}</button>`;
  });
  $('#nav').innerHTML=html;
  $('#envSelect').value=ENV;
}
function go(page,arg){
  if(!can(page)) { toast('Your role does not have access to that page.'); return; }
  CURRENT_PAGE=page; PAGE_ARG=arg||null;
  document.getElementById('sidebar').classList.remove('open');
  buildNav();
  const R=ROUTES[page]; $('#content').innerHTML=''; R&&R();
  window.scrollTo(0,0);
}

/* ---------------- Modal ---------------- */
function openModal(title,bodyHtml,footHtml,wide){
  $('#modalBox').className='modal'+(wide?' wide':'');
  $('#modalBox').innerHTML=`<header><h2>${title}</h2><button class="x" onclick="closeModal()">✕</button></header>
  <div class="body">${bodyHtml}</div>${footHtml?`<footer>${footHtml}</footer>`:''}`;
  $('#modalBack').classList.add('on');
}
function closeModal(){ $('#modalBack').classList.remove('on'); }
$('#modalBack')?.addEventListener('click',e=>{ if(e.target.id==='modalBack') closeModal(); });

/* ---------------- CSV export & print ---------------- */
function exportCSV(filename, rows){
  if(!rows.length) return toast('Nothing to export');
  const cols=Object.keys(rows[0]);
  const csv=[cols.join(',')].concat(rows.map(r=>cols.map(c=>{
    let v=r[c]==null?'':String(r[c]); if(/[",\n]/.test(v)) v='"'+v.replace(/"/g,'""')+'"'; return v;
  }).join(','))).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  audit('EXPORT','report',filename,'CSV export');
  toast('Exported '+filename);
}
function printPage(){ window.print(); }

/* ---------------- Shared lookups ---------------- */
const student=id=>DB.students.find(s=>s.id===id)||{name:'(removed)',id};
const room=id=>DB.rooms.find(r=>r.id===id);
const bldg=id=>DB.buildings.find(b=>b.id===id)||{name:id};
function studentLink(id){ const s=student(id); return `<a class="rowlink" onclick="go('studentDetail','${id}')">${esc(s.name)}</a><br><span class="mono" style="color:var(--ink-soft)">${id}</span>`; }
const initials=n=>String(n||'').trim().split(/\s+/).map(x=>x[0]||'').slice(0,2).join('').toUpperCase();
/* Student photo: stored like any other upload in DB.files, referenced by student.photoKey. */
function studentPhotoUrl(s){ const f=s&&s.photoKey?(DB.files||{})[s.photoKey]:null; return f&&f.data?f.data:null; }
function studentAvatar(s,cls){
  const url=studentPhotoUrl(s);
  return url?`<span class="avatar ${cls||''} has-photo"><img src="${url}" alt="${esc(s.name||'Student')} photo"></span>`
            :`<span class="avatar ${cls||''}">${esc(initials(s.name)||'?')}</span>`;
}
function studentOptions(sel){ return DB.students.filter(s=>s.status==='Active').map(s=>`<option value="${s.id}" ${s.id===sel?'selected':''}>${esc(s.name)} (${s.id})</option>`).join(''); }

/* overdue = exit with expected return in the past and no return logged */
function overdueMovements(){
  const now=new Date().toISOString();
  return DB.movements.filter(m=>m.type==='Exit'&&!m.returnedAt&&m.expectedReturn&&m.expectedReturn<now);
}
function occupancy(){
  const activeRooms=DB.rooms.filter(r=>r.active!==false);
  const cap=activeRooms.reduce((a,r)=>a+r.capacity,0);
  const occupied=DB.students.filter(s=>s.status==='Active'&&s.room).length;
  const roomsUsed=new Set(DB.students.filter(s=>s.status==='Active'&&s.room).map(s=>s.room)).size;
  return {rooms:activeRooms.length,roomsUsed,roomsFree:activeRooms.length-roomsUsed,cap,occupied,rate:cap?Math.round(occupied/cap*100):0};
}

/* =====================================================================
   VIEWS
===================================================================== */
const ROUTES={};

/* ---------------- Dashboard ---------------- */
ROUTES.dashboard=function(){
  const occ=occupancy();
  const today=todayStr();
  const att=DB.attendance.filter(a=>a.date===today);
  const present=att.filter(a=>a.status==='Present').length;
  const absent=att.filter(a=>a.status==='Absent').length;
  const openC=DB.complaints.filter(c=>!['Resolved','Closed'].includes(c.status)).length;
  const maint=DB.complaints.filter(c=>c.category==='Maintenance'&&!['Resolved','Closed'].includes(c.status)).length;
  const openV=DB.violations.filter(v=>v.status!=='Closed').length;
  const newR=DB.requests.filter(r=>['Submitted','Under Review'].includes(r.status)).length;
  const overdue=overdueMovements();

  const vioByType={}; DB.violations.forEach(v=>vioByType[v.type]=(vioByType[v.type]||0)+1);
  const maxV=Math.max(1,...Object.values(vioByType));

  $('#content').innerHTML=`
  <div class="page-head"><h1>Housing dashboard</h1>
    <div class="actions"><button class="btn" onclick="printPage()">🖨️ Print</button></div>
    <p>${esc(DB.settings.semester)} · ${fmtD(today)} · ${ENV==='prod'?'Production':'Non-production'} environment</p></div>

  ${overdue.length?`<div class="card" style="border-left:4px solid var(--brick);margin-bottom:1rem">
     <strong style="color:var(--brick)">⏰ ${overdue.length} student${overdue.length>1?'s have':' has'} exceeded the approved return time</strong>
     <div style="font-size:.87rem;margin-top:.4rem">${overdue.map(m=>`${esc(student(m.studentId).name)} — expected ${fmtDT(m.expectedReturn)}`).join(' · ')}</div>
     <button class="btn small" style="margin-top:.6rem" onclick="go('movements')">Open entry / exit log</button></div>`:''}

  <div class="grid kpis" style="margin-bottom:1rem">
    <div class="kpi"><div class="v">${DB.students.filter(s=>s.status==='Active').length}</div><div class="l">Resident students</div><div class="s">${DB.students.filter(s=>s.status!=='Active').length} inactive</div></div>
    <div class="kpi blue"><div class="v">${occ.roomsUsed}/${occ.rooms}</div><div class="l">Rooms occupied</div><div class="s">${occ.roomsFree} available</div></div>
    <div class="kpi"><div class="v">${occ.rate}%</div><div class="l">Occupancy rate</div><div class="s">${occ.occupied} of ${occ.cap} beds</div></div>
    <div class="kpi amber"><div class="v">${openC}</div><div class="l">Open complaints</div><div class="s">${maint} maintenance</div></div>
    <div class="kpi brick"><div class="v">${openV}</div><div class="l">Open violations</div><div class="s">${DB.violations.length} total this semester</div></div>
    <div class="kpi violet"><div class="v">${newR}</div><div class="l">New requests</div><div class="s">awaiting decision</div></div>
    <div class="kpi"><div class="v">${present}</div><div class="l">Present today</div><div class="s">${absent} absent · ${att.length? att.length : 0} recorded</div></div>
  </div>

  <div class="grid two-col">
    <div class="card"><h2>Today's roll call</h2>
      ${att.length?`<div class="tbl-wrap"><table><thead><tr><th>Student</th><th>Building / Room</th><th>Status</th><th>Latest activity</th></tr></thead><tbody>
      ${att.slice(0,8).map(a=>{const s=student(a.studentId);return `<tr><td>${studentLink(s.id)}</td><td>${esc(bldg(s.building).name)} · ${esc(s.room||'—')}</td><td>${tag(a.status)}</td><td style="font-size:.8rem;color:var(--ink-soft)">${esc(latestActivity(s.id))}</td></tr>`;}).join('')}
      </tbody></table></div>
      <button class="btn small" style="margin-top:.7rem" onclick="go('attendance')">Full roll call →</button>`
      :`<div class="empty">No roll call recorded for today yet.<br><button class="btn primary small" style="margin-top:.6rem" onclick="go('attendance')">Start roll call</button></div>`}
    </div>
    <div>
      <div class="card" style="margin-bottom:1rem"><h2>Violations by type</h2>
        ${Object.keys(vioByType).length?Object.entries(vioByType).map(([t,n])=>`<div class="barrow ${t==='Smoking'?'amber':t==='Property damage'?'brick':''}"><span class="lbl">${esc(t)}</span><span class="bar" style="width:${n/maxV*60}%"></span> ${n}</div>`).join(''):'<div class="empty">No violations recorded.</div>'}
      </div>
      <div class="card"><h2>Upcoming on the calendar</h2>
        ${DB.calendar.filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4).map(e=>`<div style="display:flex;gap:.6rem;padding:.35rem 0;font-size:.87rem"><span class="mono" style="color:var(--ink-soft);min-width:70px">${fmtD(e.date)}</span> ${esc(e.title)}</div>`).join('')||'<div class="empty">Nothing scheduled.</div>'}
        <button class="btn small" style="margin-top:.5rem" onclick="go('calendar')">Open calendar →</button>
      </div>
    </div>
  </div>`;
};
function latestActivity(sid){
  const m=DB.movements.filter(x=>x.studentId===sid).sort((a,b)=>b.at.localeCompare(a.at))[0];
  if(!m) return 'No movement logged';
  if(m.type==='Exit'&&!m.returnedAt) return 'Out since '+fmtDT(m.at);
  if(m.returnedAt) return 'Returned '+fmtDT(m.returnedAt);
  return m.type+' '+fmtDT(m.at);
}

/* ---------------- Students ---------------- */
ROUTES.students=function(){
  const colleges=masterList('college');
  $('#content').innerHTML=`
  <div class="page-head"><h1>Resident students</h1>
    <div class="actions">
      ${abtn('students','export','<button class="btn" onclick="exportStudents()">⬇ Export CSV</button>')}
      <button class="btn" onclick="printPage()">🖨️ Print</button>
      ${abtn('students','add','<button class="btn primary" onclick="studentForm()">＋ Add student</button>')}
    </div>
    <p>Profiles, room assignments and status. Open a student for the full one-page history.</p></div>
  <div class="card">
    <div class="filters">
      <div style="flex:1;min-width:200px"><label>Search</label><input id="stF_q" placeholder="Name, ID or email" oninput="renderStudents()"></div>
      <div><label>College</label><select id="stF_col" onchange="renderStudents()"><option value="">All</option>${optionsHtml(colleges)}</select></div>
      <div><label>Building</label><select id="stF_b" onchange="renderStudents()"><option value="">All</option>${DB.buildings.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      <div><label>Status</label><select id="stF_s" onchange="renderStudents()"><option value="">All</option><option>Active</option><option>Inactive</option></select></div>
    </div>
    <div class="tbl-wrap" id="stTable"></div>
  </div>`;
  renderStudents();
};
function renderStudents(){
  const q=($('#stF_q').value||'').toLowerCase(), col=$('#stF_col').value, b=$('#stF_b').value, st=$('#stF_s').value;
  const rows=DB.students.filter(s=>
    (!q||s.name.toLowerCase().includes(q)||s.id.toLowerCase().includes(q)||s.email.toLowerCase().includes(q))
    &&(!col||s.college===col)&&(!b||s.building===b)&&(!st||s.status===st));
  $('#stTable').innerHTML=rows.length?`<table><thead><tr><th>Student</th><th>Email</th><th>College / Major</th><th>Building</th><th>Room</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.map(s=>`<tr><td><div class="cell-user">${studentAvatar(s,'sm')}<div>${studentLink(s.id)}</div></div></td><td style="font-size:.82rem">${esc(s.email)}</td><td>${esc(s.college)}</td>
    <td>${esc(bldg(s.building).name)}</td><td class="mono">${esc(s.room||'—')}</td><td>${tag(s.status)}</td>
    <td style="white-space:nowrap">${abtn('students','edit',`<button class="btn small" onclick="studentForm('${s.id}')">Edit</button>`)}
    ${abtn('students','allocate',`<button class="btn small" onclick="allocateForm('${s.id}')">Room</button>`)}</td></tr>`).join('')}
  </tbody></table>`:`<div class="empty">No students match these filters.</div>`;
}
function exportStudents(){
  exportCSV('students.csv',DB.students.map(s=>({id:s.id,name:s.name,email:s.email,college:s.college,
    building:bldg(s.building).name,room:s.room,status:s.status,photo:s.photoKey?'on file':'none',
    last_activity:latestActivity(s.id)})));
}
function studentForm(id){
  const s=id?student(id):{};
  const url=FORM_PHOTO_URL=studentPhotoUrl(s);
  openModal(id?'Edit student':'Add student',`
    <div class="photo-field">
      <div class="photo-preview" id="sf_preview">${url?`<img src="${url}" alt="Current photo">`:`<span>${esc(initials(s.name)||'?')}</span>`}</div>
      <div class="photo-field-body">
        <label>Student photo</label>
        <input type="file" id="sf_photo" accept="image/*" onchange="previewStudentPhoto(this)">
        <p class="hint">JPEG or PNG up to ${PHOTO_MAX_UPLOAD/1048576} MB. The photo is resized to ${PHOTO_MAX_DIM}px before it is stored with the record.</p>
        ${url?`<label class="inline-check"><input type="checkbox" id="sf_photo_rm" onchange="previewStudentPhoto($('#sf_photo'))"> Remove the current photo</label>`:''}
      </div>
    </div>
    <div class="frow"><div><label>Full name</label><input id="sf_name" value="${esc(s.name||'')}"></div>
    <div><label>Student ID</label><input id="sf_id" value="${esc(s.id||'STU-'+(1000+DB.students.length+1))}" ${id?'disabled':''}></div></div>
    <div class="frow"><div><label>Email</label><input id="sf_email" value="${esc(s.email||'')}"></div>
    <div><label>Phone</label><input id="sf_phone" value="${esc(s.phone||'')}"></div></div>
    <div class="frow"><div><label>College / Major</label><select id="sf_col">${optionsHtml(masterList('college'),s.college)}</select></div>
    <div><label>Status</label><select id="sf_status"><option ${s.status!=='Inactive'?'selected':''}>Active</option><option ${s.status==='Inactive'?'selected':''}>Inactive</option></select></div></div>
    <div><label>Emergency contact</label><input id="sf_em" value="${esc(s.emergency||'')}"></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveStudent('${id||''}')">Save student</button>`);
}
async function saveStudent(id){
  const data={name:$('#sf_name').value.trim(),email:$('#sf_email').value.trim(),phone:$('#sf_phone').value.trim(),
    college:$('#sf_col').value,status:$('#sf_status').value,emergency:$('#sf_em').value.trim()};
  if(!data.name) return toast('Name is required');
  const removePhoto=$('#sf_photo_rm')?$('#sf_photo_rm').checked:false;
  let photo=null;
  try{ photo=removePhoto?null:await readImageInput($('#sf_photo')); }
  catch(e){ return toast(e.message); }
  const photoNote=photo?' · photo updated':(removePhoto?' · photo removed':'');
  if(id){ const s=student(id); const wasActive=s.status; Object.assign(s,data);
    if(wasActive!=='Inactive'&&data.status==='Inactive'&&s.room){ endAllocation(id,'Deactivated'); s.room=null; s.building=null; }
    if(photo||removePhoto) setStudentPhoto(s,photo?storeFile(photo):null);
    audit('UPDATE','student',id,'Profile updated'+photoNote);
  } else {
    const nid=$('#sf_id').value.trim()||uid('STU');
    if(DB.students.some(x=>x.id===nid)) return toast('Student ID already exists');
    DB.students.push({id:nid,...data,building:null,room:null,joined:todayStr(),photoKey:photo?storeFile(photo):null});
    audit('CREATE','student',nid,'Student added'+photoNote);
  }
  save('students'); closeModal(); toast('Student saved');
  CURRENT_PAGE==='studentDetail'?go('studentDetail',id):go('students');
}
function endAllocation(sid,note){
  const a=DB.allocations.find(x=>x.studentId===sid&&!x.to);
  if(a){ a.to=todayStr(); a.note=(a.note?a.note+' · ':'')+note; save('allocations'); }
}
function allocateForm(sid){
  const s=student(sid);
  const freeRooms=DB.rooms.filter(r=>r.active!==false).filter(r=>{
    const occ=DB.students.filter(x=>x.status==='Active'&&x.room===r.id).length;
    return occ<r.capacity||r.id===s.room;});
  openModal('Room assignment — '+esc(s.name),`
    <div><label>Current room</label><div class="mono">${esc(s.room||'None')}</div></div>
    <div class="frow"><div><label>New room</label><select id="al_room">
      <option value="">— Unassign —</option>
      ${freeRooms.map(r=>`<option value="${r.id}" ${r.id===s.room?'selected':''}>${esc(bldg(r.buildingId).name)} · Room ${r.number} (${DB.students.filter(x=>x.status==='Active'&&x.room===r.id).length}/${r.capacity})</option>`).join('')}
    </select></div><div><label>Effective from</label><input type="date" id="al_from" value="${todayStr()}"></div></div>
    <div><label>Note</label><input id="al_note" placeholder="Reason for the change"></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveAllocation('${sid}')">Assign</button>`);
}
function saveAllocation(sid){
  const s=student(sid), rid=$('#al_room').value, from=$('#al_from').value, note=$('#al_note').value.trim();
  if(rid===s.room){ closeModal(); return; }
  endAllocation(sid, rid?'Moved to '+rid:'Unassigned');
  if(rid){ const r=room(rid); s.room=rid; s.building=r.buildingId;
    DB.allocations.push({id:uid('ALC'),studentId:sid,roomId:rid,from,to:'',note:note||'Room assignment'});
  } else { s.room=null; s.building=null; }
  save('students'); save('allocations');
  audit('ALLOCATE','student',sid,rid?('Assigned to room '+rid):'Room unassigned');
  notify('room','Room change',`${s.name} ${rid?'assigned to '+rid:'unassigned from room'}.`);
  closeModal(); toast('Room assignment saved');
  CURRENT_PAGE==='studentDetail'?go('studentDetail',sid):go('students');
}

/* ---------------- Student 360 detail ---------------- */
ROUTES.studentDetail=function(){
  const s=student(PAGE_ARG); const sid=s.id;
  const allocs=DB.allocations.filter(a=>a.studentId===sid).sort((a,b)=>b.from.localeCompare(a.from));
  const atts=DB.attendance.filter(a=>a.studentId===sid).sort((a,b)=>b.date.localeCompare(a.date));
  const movs=DB.movements.filter(m=>m.studentId===sid).sort((a,b)=>b.at.localeCompare(a.at));
  const vios=DB.violations.filter(v=>v.studentId===sid);
  const cmps=DB.complaints.filter(c=>c.studentId===sid);
  const reqs=DB.requests.filter(r=>r.studentId===sid);
  const docs=DB.documents.filter(d=>d.studentId===sid);
  $('#content').innerHTML=`
  <div class="page-head"><h1>Student record</h1>
    <div class="actions"><button class="btn" onclick="go('students')">← All students</button>
    <button class="btn" onclick="printPage()">🖨️ Print / PDF</button>
    ${abtn('students','edit',`<button class="btn" onclick="studentForm('${sid}')">Edit profile</button>`)}
    ${abtn('students','allocate',`<button class="btn" onclick="allocateForm('${sid}')">Change room</button>`)}
    ${abtn('students','deactivate',`<button class="btn ${s.status==='Active'?'danger':'primary'}" onclick="toggleActive('${sid}')">${s.status==='Active'?'Deactivate':'Reactivate'}</button>`)}</div></div>

  <div class="card" style="margin-bottom:1rem"><div class="detail-hero">
    ${studentAvatar(s)}
    <div style="flex:1;min-width:220px"><h2 style="font-size:1.2rem">${esc(s.name)} ${tag(s.status)}</h2>
      <div style="color:var(--ink-soft);font-size:.87rem" class="mono">${sid}</div></div>
    <div class="meta-grid" style="flex:2;min-width:280px">
      <div><div class="l">Email</div>${esc(s.email||'—')}</div>
      <div><div class="l">Phone</div>${esc(s.phone||'—')}</div>
      <div><div class="l">College / Major</div>${esc(s.college||'—')}</div>
      <div><div class="l">Building · Room</div>${s.room?esc(bldg(s.building).name)+' · '+esc(s.room):'Unassigned'}</div>
      <div><div class="l">Resident since</div>${fmtD(s.joined)}</div>
      <div><div class="l">Emergency contact</div>${esc(s.emergency||'—')}</div>
      <div><div class="l">Latest activity</div>${esc(latestActivity(sid))}</div>
    </div></div></div>

  <div class="grid two-col">
    <div style="display:grid;gap:1rem">
      <div class="card"><h2>Room allocation history</h2>
        ${allocs.length?`<table><thead><tr><th>Room</th><th>From</th><th>To</th><th>Note</th></tr></thead><tbody>
        ${allocs.map(a=>`<tr><td class="mono">${esc(a.roomId)}</td><td>${fmtD(a.from)}</td><td>${a.to?fmtD(a.to):tag('Active')}</td><td style="font-size:.82rem">${esc(a.note||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No allocations yet.</div>'}
      </div>
      <div class="card"><h2>Movement history (entry / exit)</h2>
        ${movs.length?`<div class="tbl-wrap"><table><thead><tr><th>Type</th><th>Time</th><th>Expected return</th><th>Returned</th><th>Purpose</th></tr></thead><tbody>
        ${movs.slice(0,10).map(m=>`<tr><td>${m.type==='Exit'?'🚪 Exit':'✅ Entry'}</td><td>${fmtDT(m.at)}</td><td>${m.expectedReturn?fmtDT(m.expectedReturn):'—'}</td>
          <td>${m.returnedAt?fmtDT(m.returnedAt)+(m.late?' '+tag('Late'):''):(m.type==='Exit'?tag(isOverdue(m)?'Overdue':'Out'):'—')}</td><td style="font-size:.82rem">${esc(m.purpose||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No movements logged.</div>'}
      </div>
      <div class="card"><h2>Attendance history</h2>
        ${atts.length?`<table><thead><tr><th>Date</th><th>Status</th><th>Note</th><th>Recorded by</th></tr></thead><tbody>
        ${atts.slice(0,14).map(a=>`<tr><td>${fmtD(a.date)}</td><td>${tag(a.status)}</td><td style="font-size:.82rem">${esc(a.note||'')}</td><td style="font-size:.82rem">${esc(a.by||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No attendance records.</div>'}
      </div>
    </div>
    <div style="display:grid;gap:1rem;align-content:start">
      <div class="card"><h2>Violations (${vios.length})</h2>
        ${vios.map(v=>`<div style="padding:.5rem 0;border-bottom:1px solid #EFEEE7;font-size:.87rem"><a class="rowlink" onclick="viewViolation('${v.id}')">${v.id}</a> · ${esc(v.type)} ${tag(v.status)}<div style="color:var(--ink-soft);font-size:.78rem">${fmtD(v.date)} ${esc(v.time)} · ${esc(v.location)}</div></div>`).join('')||'<div class="empty">No violations.</div>'}
      </div>
      <div class="card"><h2>Complaints (${cmps.length})</h2>
        ${cmps.map(c=>`<div style="padding:.5rem 0;border-bottom:1px solid #EFEEE7;font-size:.87rem"><a class="rowlink" onclick="viewComplaint('${c.id}')">${c.id}</a> · ${esc(c.title)} ${tag(c.status)}</div>`).join('')||'<div class="empty">No complaints.</div>'}
      </div>
      <div class="card"><h2>Requests (${reqs.length})</h2>
        ${reqs.map(r=>`<div style="padding:.5rem 0;border-bottom:1px solid #EFEEE7;font-size:.87rem"><a class="rowlink" onclick="viewRequest('${r.id}')">${r.id}</a> · ${esc(r.type)} ${tag(r.status)}</div>`).join('')||'<div class="empty">No requests.</div>'}
      </div>
      <div class="card"><h2>Documents (${docs.length})</h2>
        ${docs.map(d=>`<div style="padding:.5rem 0;border-bottom:1px solid #EFEEE7;font-size:.87rem">📄 ${d.fileKey?`<a class="rowlink" onclick="downloadDoc('${d.id}')">${esc(d.name)}</a>`:esc(d.name)}<div style="color:var(--ink-soft);font-size:.78rem">${esc(d.type)} · ${fmtDT(d.uploadedAt)} · ${esc(d.by)}</div></div>`).join('')||'<div class="empty">No documents on file.</div>'}
        ${abtn('documents','upload',`<button class="btn small" style="margin-top:.6rem" onclick="docForm('${sid}')">＋ Upload document</button>`)}
      </div>
    </div>
  </div>`;
};
function toggleActive(sid){
  const s=student(sid);
  s.status=s.status==='Active'?'Inactive':'Active';
  if(s.status==='Inactive'&&s.room){ endAllocation(sid,'Deactivated'); s.room=null; s.building=null; }
  save('students'); audit('UPDATE','student',sid,'Status set to '+s.status);
  toast('Student is now '+s.status); go('studentDetail',sid);
}
function isOverdue(m){ return m.type==='Exit'&&!m.returnedAt&&m.expectedReturn&&m.expectedReturn<new Date().toISOString(); }

/* ---------------- Attendance & roll call ---------------- */
ROUTES.attendance=function(){
  const statuses=masterList('attendanceStatus');
  $('#content').innerHTML=`
  <div class="page-head"><h1>Attendance & daily roll call</h1>
    <div class="actions">
      ${abtn('attendance','export','<button class="btn" onclick="exportAttendance()">⬇ Export CSV</button>')}
      <button class="btn" onclick="printPage()">🖨️ Print</button>
      ${abtn('attendance','record',`<button class="btn primary" onclick="markAllPresent()">Mark all unrecorded Present</button>`)}
    </div>
    <p>Record each resident's status for the selected date. Statuses: ${statuses.join(' · ')}.</p></div>
  <div class="card">
    <div class="filters">
      <div><label>Date</label><input type="date" id="attDate" value="${todayStr()}" onchange="renderAttendance()"></div>
      <div><label>Building</label><select id="attB" onchange="renderAttendance()"><option value="">All</option>${DB.buildings.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      <div><label>Status</label><select id="attS" onchange="renderAttendance()"><option value="">All</option>${optionsHtml(statuses)}</select></div>
      <div style="flex:1;min-width:180px"><label>Search</label><input id="attQ" placeholder="Name or ID" oninput="renderAttendance()"></div>
    </div>
    <div id="attStats" style="margin-bottom:.8rem"></div>
    <div class="tbl-wrap" id="attTable"></div>
  </div>`;
  renderAttendance();
};
function attRec(date,sid){ return DB.attendance.find(a=>a.date===date&&a.studentId===sid); }
function renderAttendance(){
  const date=$('#attDate').value, b=$('#attB').value, st=$('#attS').value, q=($('#attQ').value||'').toLowerCase();
  const students=DB.students.filter(s=>s.status==='Active'&&(!b||s.building===b)
    &&(!q||s.name.toLowerCase().includes(q)||s.id.toLowerCase().includes(q)));
  const counts={}; masterList('attendanceStatus').forEach(x=>counts[x]=0); let unrec=0;
  students.forEach(s=>{const r=attRec(date,s.id); r?counts[r.status]=(counts[r.status]||0)+1:unrec++;});
  $('#attStats').innerHTML=Object.entries(counts).filter(([,n])=>n).map(([k,n])=>`${tag(k)} <strong style="margin-right:.9rem">${n}</strong>`).join('')+(unrec?`<span class="tag grey">Not recorded</span> <strong>${unrec}</strong>`:'');
  const rows=students.filter(s=>{const r=attRec(date,s.id);return !st||(r&&r.status===st);});
  const canRec=can('attendance','record');
  $('#attTable').innerHTML=rows.length?`<table><thead><tr><th>Student</th><th>Room</th><th>Status</th><th>Note</th><th>Latest activity</th></tr></thead><tbody>
  ${rows.map(s=>{const r=attRec(date,s.id);
    return `<tr><td>${studentLink(s.id)}</td><td class="mono">${esc(s.room||'—')}</td>
    <td>${canRec?`<select style="min-width:130px" onchange="setAttendance('${date}','${s.id}',this.value)"><option value="">— record —</option>${masterList('attendanceStatus').map(x=>`<option ${r&&r.status===x?'selected':''}>${x}</option>`).join('')}</select>`:(r?tag(r.status):'<span class="tag grey">Not recorded</span>')}</td>
    <td>${canRec?`<input style="min-width:120px" value="${esc(r?.note||'')}" placeholder="note" onchange="setAttNote('${date}','${s.id}',this.value)">`:esc(r?.note||'')}</td>
    <td style="font-size:.8rem;color:var(--ink-soft)">${esc(latestActivity(s.id))}</td></tr>`;}).join('')}</tbody></table>`:'<div class="empty">No students match.</div>';
}
function setAttendance(date,sid,status){
  if(!status) return;
  let r=attRec(date,sid);
  if(r){ r.status=status; r.by=CURRENT_USER.name; r.at=new Date().toISOString(); }
  else DB.attendance.push({id:uid('ATT'),date,studentId:sid,status,note:'',by:CURRENT_USER.name,at:new Date().toISOString()});
  save('attendance'); audit('ATTENDANCE','student',sid,`${date}: ${status}`);
  renderAttendance();
}
function setAttNote(date,sid,note){
  let r=attRec(date,sid);
  if(!r){ r={id:uid('ATT'),date,studentId:sid,status:'Unknown',note,by:CURRENT_USER.name,at:new Date().toISOString()}; DB.attendance.push(r); }
  else r.note=note;
  save('attendance');
}
function markAllPresent(){
  const date=$('#attDate').value; let n=0;
  DB.students.filter(s=>s.status==='Active').forEach(s=>{ if(!attRec(date,s.id)){ DB.attendance.push({id:uid('ATT'),date,studentId:s.id,status:'Present',note:'',by:CURRENT_USER.name,at:new Date().toISOString()}); n++; }});
  save('attendance'); audit('ATTENDANCE','rollcall',date,`Bulk marked ${n} students Present`);
  toast(n+' students marked Present'); renderAttendance();
}
function exportAttendance(){
  const date=$('#attDate').value;
  exportCSV(`attendance-${date}.csv`, DB.students.filter(s=>s.status==='Active').map(s=>{const r=attRec(date,s.id);
    return {date,student_id:s.id,name:s.name,building:bldg(s.building).name,room:s.room,status:r?r.status:'Not recorded',note:r?.note||'',recorded_by:r?.by||''};}));
}

/* ---------------- Entry / Exit movements ---------------- */
ROUTES.movements=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Entry / exit log</h1>
    <div class="actions">
      ${abtn('movements','export','<button class="btn" onclick="exportMovements()">⬇ Export CSV</button>')}
      ${abtn('movements','record',`<button class="btn primary" onclick="movementForm()">＋ Record exit / entry</button>`)}
    </div>
    <p>Temporary exits, returns and gate activity. Overdue returns are flagged automatically.</p></div>
  <div id="movAlerts"></div>
  <div class="card">
    <div class="filters">
      <div style="flex:1;min-width:180px"><label>Search</label><input id="movQ" placeholder="Name or ID" oninput="renderMovements()"></div>
      <div><label>Show</label><select id="movF" onchange="renderMovements()"><option value="">All records</option><option value="out">Currently out</option><option value="overdue">Overdue only</option><option value="late">Returned late</option></select></div>
    </div>
    <div class="tbl-wrap" id="movTable"></div>
  </div>`;
  renderMovements();
};
function renderMovements(){
  const od=overdueMovements();
  $('#movAlerts').innerHTML=od.length?`<div class="card" style="border-left:4px solid var(--brick);margin-bottom:1rem">
    <strong style="color:var(--brick)">⏰ Overdue returns (${od.length})</strong>
    ${od.map(m=>`<div style="font-size:.87rem;margin-top:.35rem">${esc(student(m.studentId).name)} — expected back ${fmtDT(m.expectedReturn)} (${hoursBetween(m.expectedReturn,new Date().toISOString())}h overdue)
      ${abtn('movements','return',`<button class="btn small" onclick="logReturn('${m.id}')">Log return now</button>`)}</div>`).join('')}</div>`:'';
  const q=($('#movQ').value||'').toLowerCase(), f=$('#movF').value;
  const now=new Date().toISOString();
  let rows=DB.movements.slice().sort((a,b)=>b.at.localeCompare(a.at)).filter(m=>{
    const s=student(m.studentId);
    if(q&&!(s.name.toLowerCase().includes(q)||s.id.toLowerCase().includes(q))) return false;
    if(f==='out') return m.type==='Exit'&&!m.returnedAt;
    if(f==='overdue') return isOverdue(m);
    if(f==='late') return !!m.late;
    return true;});
  $('#movTable').innerHTML=rows.length?`<table><thead><tr><th>Student</th><th>Type</th><th>Time</th><th>Purpose</th><th>Expected return</th><th>Returned</th><th>Gate / by</th><th></th></tr></thead><tbody>
  ${rows.map(m=>`<tr><td>${studentLink(m.studentId)}</td><td>${m.type==='Exit'?'🚪 Exit':'✅ Entry'}</td><td>${fmtDT(m.at)}</td>
    <td style="font-size:.83rem">${esc(m.purpose||'')}</td><td>${m.expectedReturn?fmtDT(m.expectedReturn):'—'}</td>
    <td>${m.returnedAt?fmtDT(m.returnedAt)+(m.late?' '+tag('Late'):''):(m.type==='Exit'?(isOverdue(m)?'<span class="tag brick">Overdue</span>':'<span class="tag amber">Out</span>'):'—')}</td>
    <td style="font-size:.83rem">${esc(m.by||'')}</td>
    <td>${m.type==='Exit'&&!m.returnedAt?abtn('movements','return',`<button class="btn small" onclick="logReturn('${m.id}')">Log return</button>`):''}</td></tr>`).join('')}</tbody></table>`
    :'<div class="empty">No movement records match.</div>';
}
function movementForm(){
  openModal('Record movement',`
    <div class="frow"><div><label>Student</label><select id="mv_s">${studentOptions()}</select></div>
    <div><label>Type</label><select id="mv_type" onchange="$('#mv_erWrap').style.display=this.value==='Exit'?'block':'none'"><option>Exit</option><option>Entry</option></select></div></div>
    <div class="frow"><div><label>Date</label><input type="date" id="mv_d" value="${todayStr()}"></div><div><label>Time</label><input type="time" id="mv_t" value="${nowTime()}"></div></div>
    <div id="mv_erWrap"><label>Expected return (for exits)</label><input type="datetime-local" id="mv_er"></div>
    <div><label>Purpose</label><input id="mv_p" placeholder="e.g. Family visit, medical appointment"></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveMovement()">Record</button>`);
}
function saveMovement(){
  const sid=$('#mv_s').value, type=$('#mv_type').value;
  const at=new Date($('#mv_d').value+'T'+$('#mv_t').value).toISOString();
  const er=$('#mv_er').value?new Date($('#mv_er').value).toISOString():null;
  DB.movements.push({id:uid('MOV'),studentId:sid,type,at,expectedReturn:type==='Exit'?er:null,returnedAt:null,purpose:$('#mv_p').value.trim(),by:CURRENT_USER.name});
  save('movements'); audit('MOVEMENT','student',sid,type+' recorded');
  closeModal(); toast(type+' recorded'); renderMovements();
}
function logReturn(mid){
  const m=DB.movements.find(x=>x.id===mid);
  m.returnedAt=new Date().toISOString();
  m.late=!!(m.expectedReturn&&m.returnedAt>m.expectedReturn);
  save('movements'); audit('MOVEMENT','student',m.studentId,'Return logged'+(m.late?' (LATE)':''));
  if(m.late) notify('late','Late return recorded',`${student(m.studentId).name} returned ${hoursBetween(m.expectedReturn,m.returnedAt)}h after the approved time.`);
  toast('Return logged'+(m.late?' — marked late':''));
  CURRENT_PAGE==='movements'?renderMovements():go(CURRENT_PAGE,PAGE_ARG);
}
function exportMovements(){
  exportCSV('movements.csv',DB.movements.map(m=>({id:m.id,student_id:m.studentId,student:student(m.studentId).name,
    type:m.type,at:m.at,expected_return:m.expectedReturn||'',returned_at:m.returnedAt||'',late:m.late?'yes':'',purpose:m.purpose,recorded_by:m.by})));
}

/* ---------------- File helper (secure document storage) ---------------- */
function readFileInput(inputEl){
  return new Promise(res=>{
    const f=inputEl.files&&inputEl.files[0];
    if(!f) return res(null);
    if(f.size>2*1024*1024){ toast('File larger than 2 MB — stored by reference only'); return res({name:f.name,size:f.size,data:null}); }
    const r=new FileReader();
    r.onload=()=>res({name:f.name,size:f.size,mime:f.type,data:r.result});
    r.onerror=()=>res(null);
    r.readAsDataURL(f);
  });
}
function storeFile(fileObj){
  if(!fileObj||!fileObj.data) return null;
  const key=uid('FILE');
  DB.files[key]={name:fileObj.name,mime:fileObj.mime,data:fileObj.data,size:fileObj.size};
  save('files'); return key;
}
function downloadFileKey(key,fallbackName){
  const f=DB.files[key];
  if(!f||!f.data) return toast('File content not available in this environment');
  const a=document.createElement('a'); a.href=f.data; a.download=f.name||fallbackName||'document'; a.click();
}
function fmtSize(b){ if(!b) return '—'; return b>1048576?(b/1048576).toFixed(1)+' MB':Math.round(b/1024)+' KB'; }

/* ---------------- Photo helper (student photos) ----------------
   Photos go through the same file store as documents, but are downscaled in the
   browser first so a phone snapshot does not travel to the database at full size. */
const PHOTO_MAX_DIM=480;                 // longest edge, pixels
const PHOTO_MAX_UPLOAD=8*1024*1024;      // rejected before any resizing work
const PHOTO_QUALITY=0.85;

function readImageInput(inputEl,maxDim){
  const max=maxDim||PHOTO_MAX_DIM;
  return new Promise((resolve,reject)=>{
    const f=inputEl&&inputEl.files&&inputEl.files[0];
    if(!f) return resolve(null);
    if(!/^image\//.test(f.type)) return reject(new Error('That file is not an image — choose a JPEG or PNG'));
    if(f.size>PHOTO_MAX_UPLOAD) return reject(new Error('Image is larger than '+(PHOTO_MAX_UPLOAD/1048576)+' MB'));
    const r=new FileReader();
    r.onerror=()=>reject(new Error('Could not read that file'));
    r.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('That image could not be decoded'));
      img.onload=()=>{
        const scale=Math.min(1,max/Math.max(img.width,img.height));
        const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const ctx=c.getContext('2d');
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);   // flatten transparency for JPEG
        ctx.drawImage(img,0,0,w,h);
        const data=c.toDataURL('image/jpeg',PHOTO_QUALITY);
        const base64=data.slice(data.indexOf(',')+1);
        resolve({name:f.name.replace(/\.[^.]+$/,'')+'.jpg',mime:'image/jpeg',
          size:Math.round(base64.length*3/4),data});
      };
      img.src=r.result;
    };
    r.readAsDataURL(f);
  });
}

/* Point a student at a new photo (or none) and drop the file it replaces. */
function setStudentPhoto(s,key){
  if(s.photoKey&&s.photoKey!==key&&DB.files[s.photoKey]) delete DB.files[s.photoKey];
  s.photoKey=key||null;
  save('files');
}

/* Live preview inside the student form — no upload happens until Save. */
let FORM_PHOTO_URL=null;   // photo already on the record being edited
function previewStudentPhoto(inputEl){
  const box=$('#sf_preview'); if(!box) return;
  const remove=$('#sf_photo_rm')?$('#sf_photo_rm').checked:false;
  const f=!remove&&inputEl&&inputEl.files&&inputEl.files[0];
  if(box._url){ URL.revokeObjectURL(box._url); box._url=null; }
  if(!f){
    const fallback=remove?null:FORM_PHOTO_URL;
    const name=$('#sf_name')?$('#sf_name').value:'';
    box.innerHTML=fallback?`<img src="${fallback}" alt="Current photo">`:`<span>${esc(initials(name)||'?')}</span>`;
    return;
  }
  if(!/^image\//.test(f.type)) return toast('That file is not an image — choose a JPEG or PNG');
  if(f.size>PHOTO_MAX_UPLOAD) return toast('Image is larger than '+(PHOTO_MAX_UPLOAD/1048576)+' MB');
  box._url=URL.createObjectURL(f);
  box.innerHTML=`<img src="${box._url}" alt="Selected photo">`;
}

/* ---------------- Violations ---------------- */
const VIO_FLOW=['Open','Investigation','Decision','Closed'];
ROUTES.violations=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Student violations</h1>
    <div class="actions">
      ${abtn('violations','export','<button class="btn" onclick="exportViolations()">⬇ Export CSV</button>')}
      <button class="btn" onclick="printPage()">🖨️ Print</button>
      ${abtn('violations','add','<button class="btn primary" onclick="violationForm()">＋ Report violation</button>')}
    </div>
    <p>Workflow: Open → Investigation → Decision → Closed.</p></div>
  <div class="card">
    <div class="filters">
      <div style="flex:1;min-width:180px"><label>Search</label><input id="vQ" placeholder="Student, ID, location" oninput="renderViolations()"></div>
      <div><label>Type</label><select id="vT" onchange="renderViolations()"><option value="">All</option>${optionsHtml(masterList('violationType'))}</select></div>
      <div><label>Status</label><select id="vS" onchange="renderViolations()"><option value="">All</option>${VIO_FLOW.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div><label>Building</label><select id="vB" onchange="renderViolations()"><option value="">All</option>${DB.buildings.map(b=>`<option value="${b.name}">${esc(b.name)}</option>`).join('')}</select></div>
    </div>
    <div class="tbl-wrap" id="vTable"></div>
  </div>`;
  renderViolations();
};
function renderViolations(){
  const q=($('#vQ').value||'').toLowerCase(), t=$('#vT').value, st=$('#vS').value, b=$('#vB').value;
  const rows=DB.violations.filter(v=>{const s=student(v.studentId);
    return (!q||s.name.toLowerCase().includes(q)||v.id.toLowerCase().includes(q)||(v.location||'').toLowerCase().includes(q))
      &&(!t||v.type===t)&&(!st||v.status===st)&&(!b||(v.location||'').includes(b));})
    .sort((a,b2)=>(b2.date+b2.time).localeCompare(a.date+a.time));
  $('#vTable').innerHTML=rows.length?`<table><thead><tr><th>Case</th><th>Student</th><th>Type</th><th>Date / time</th><th>Location</th><th>Action</th><th>Status</th></tr></thead><tbody>
  ${rows.map(v=>`<tr><td><a class="rowlink" onclick="viewViolation('${v.id}')">${v.id}</a></td><td>${studentLink(v.studentId)}</td>
    <td>${esc(v.type)}</td><td>${fmtD(v.date)} ${esc(v.time)}</td><td style="font-size:.83rem">${esc(v.location)}</td>
    <td style="font-size:.83rem">${esc(v.action||'—')}</td><td>${tag(v.status)}</td></tr>`).join('')}</tbody></table>`
    :'<div class="empty">No violations match.</div>';
}
function violationForm(){
  openModal('Report violation',`
    <div class="frow"><div><label>Student</label><select id="vf_s">${studentOptions()}</select></div>
    <div><label>Violation type</label><select id="vf_t">${optionsHtml(masterList('violationType'))}</select></div></div>
    <div class="frow"><div><label>Date</label><input type="date" id="vf_d" value="${todayStr()}"></div><div><label>Time</label><input type="time" id="vf_tm" value="${nowTime()}"></div></div>
    <div><label>Location</label><input id="vf_l" placeholder="Building · floor · room"></div>
    <div><label>Description</label><textarea id="vf_desc" rows="3"></textarea></div>
    <div class="frow"><div><label>Reporting staff member</label><input id="vf_staff" value="${esc(CURRENT_USER.name)}"></div>
    <div><label>Disciplinary action</label><select id="vf_a"><option value="">— pending —</option>${optionsHtml(masterList('disciplinaryAction'))}</select></div></div>
    <div><label>Attachment (photo or PDF)</label><input type="file" id="vf_file" accept="image/*,.pdf"></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveViolation()">Report</button>`);
}
async function saveViolation(){
  const fileObj=await readFileInput($('#vf_file'));
  const id='VIO-'+(2000+DB.violations.length+1);
  const attachments=[]; if(fileObj){ attachments.push({name:fileObj.name,size:fileObj.size,fileKey:storeFile(fileObj)}); }
  const v={id,studentId:$('#vf_s').value,type:$('#vf_t').value,date:$('#vf_d').value,time:$('#vf_tm').value,
    location:$('#vf_l').value.trim(),description:$('#vf_desc').value.trim(),staff:$('#vf_staff').value.trim(),
    action:$('#vf_a').value,status:'Open',attachments,history:[{at:new Date().toISOString(),by:CURRENT_USER.name,note:'Reported'}]};
  DB.violations.push(v); save('violations');
  audit('CREATE','violation',id,v.type+' — '+student(v.studentId).name);
  notify('violation','New violation reported',`${id} · ${v.type} · ${student(v.studentId).name}.`);
  closeModal(); toast('Violation reported'); go('violations');
}
function viewViolation(id){
  const v=DB.violations.find(x=>x.id===id); const s=student(v.studentId);
  const next=VIO_FLOW[VIO_FLOW.indexOf(v.status)+1];
  openModal('Violation '+id,`
    <div class="meta-grid">
      <div><div class="l">Student</div>${esc(s.name)} (${s.id})</div>
      <div><div class="l">Type</div>${esc(v.type)}</div>
      <div><div class="l">Date / time</div>${fmtD(v.date)} ${esc(v.time)}</div>
      <div><div class="l">Location</div>${esc(v.location)}</div>
      <div><div class="l">Reported by</div>${esc(v.staff)}</div>
      <div><div class="l">Status</div>${tag(v.status)}</div>
    </div>
    <div><div class="l" style="font-size:.72rem;font-weight:700;color:var(--ink-soft)">DESCRIPTION</div>${esc(v.description)}</div>
    ${v.attachments.length?`<div><div class="l" style="font-size:.72rem;font-weight:700;color:var(--ink-soft)">ATTACHMENTS</div>${v.attachments.map(a=>a.fileKey?`<a class="rowlink" onclick="downloadFileKey('${a.fileKey}')">📎 ${esc(a.name)}</a> (${fmtSize(a.size)})`:`📎 ${esc(a.name)}`).join('<br>')}</div>`:''}
    ${can('violations','update')?`<div class="frow"><div><label>Disciplinary action</label><select id="vv_a"><option value="">— pending —</option>${optionsHtml(masterList('disciplinaryAction'),v.action)}</select></div>
      <div><label>Add note</label><input id="vv_note" placeholder="Investigation / decision note"></div></div>`:''}
    <div><div class="l" style="font-size:.72rem;font-weight:700;color:var(--ink-soft)">CASE HISTORY</div>
      <ul class="timeline">${v.history.map(h=>`<li><div class="t">${fmtDT(h.at)} · ${esc(h.by)}</div>${esc(h.note)}</li>`).join('')}</ul></div>`,
    `${can('violations','update')&&next?`<button class="btn primary" onclick="advanceViolation('${id}','${next}')">Move to ${next} →</button>`:''}
     ${can('violations','update')?`<button class="btn" onclick="advanceViolation('${id}','')">Save note</button>`:''}
     <button class="btn" onclick="closeModal()">Close</button>`, true);
}
function advanceViolation(id,next){
  const v=DB.violations.find(x=>x.id===id);
  const note=$('#vv_note')?$('#vv_note').value.trim():'';
  if($('#vv_a')) v.action=$('#vv_a').value;
  if(next){ v.status=next; v.history.push({at:new Date().toISOString(),by:CURRENT_USER.name,note:'Moved to '+next+(note?' — '+note:'')}); 
    audit('WORKFLOW','violation',id,'Status → '+next);
    if(next==='Closed') notify('violation','Violation closed',id+' has been closed.'); }
  else if(note){ v.history.push({at:new Date().toISOString(),by:CURRENT_USER.name,note}); audit('UPDATE','violation',id,'Note added'); }
  save('violations'); closeModal(); toast('Violation updated');
  go(CURRENT_PAGE,PAGE_ARG);
}
function exportViolations(){
  exportCSV('violations.csv',DB.violations.map(v=>({id:v.id,student_id:v.studentId,student:student(v.studentId).name,
    type:v.type,date:v.date,time:v.time,location:v.location,description:v.description,staff:v.staff,action:v.action,status:v.status})));
}

/* ---------------- Complaints & maintenance ---------------- */
const CMP_FLOW=['Submitted','Assigned','In Progress','Resolved','Closed'];
ROUTES.complaints=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Complaints & maintenance</h1>
    <div class="actions">
      ${abtn('complaints','export','<button class="btn" onclick="exportComplaints()">⬇ Export CSV</button>')}
      <button class="btn" onclick="printPage()">🖨️ Print</button>
      ${abtn('complaints','add','<button class="btn primary" onclick="complaintForm()">＋ Log complaint</button>')}
    </div>
    <p>Workflow: Submitted → Assigned → In Progress → Resolved → Closed. Response and resolution times are tracked automatically.</p></div>
  <div class="grid kpis" style="margin-bottom:1rem" id="cmpKpis"></div>
  <div class="card">
    <div class="filters">
      <div style="flex:1;min-width:180px"><label>Search</label><input id="cQ" placeholder="Title, student, ID" oninput="renderComplaints()"></div>
      <div><label>Category</label><select id="cC" onchange="renderComplaints()"><option value="">All</option>${optionsHtml(masterList('complaintCategory'))}</select></div>
      <div><label>Status</label><select id="cS" onchange="renderComplaints()"><option value="">All</option>${CMP_FLOW.map(x=>`<option>${x}</option>`).join('')}</select></div>
    </div>
    <div class="tbl-wrap" id="cTable"></div>
  </div>`;
  renderComplaints();
};
function cmpStats(list){
  const resp=list.filter(c=>c.respondedAt).map(c=>hoursBetween(c.createdAt,c.respondedAt));
  const reso=list.filter(c=>c.resolvedAt).map(c=>hoursBetween(c.createdAt,c.resolvedAt));
  const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10:null;
  return {avgResp:avg(resp),avgReso:avg(reso),
    open:list.filter(c=>!['Resolved','Closed'].includes(c.status)).length,
    closed:list.filter(c=>['Resolved','Closed'].includes(c.status)).length};
}
function renderComplaints(){
  const st=cmpStats(DB.complaints);
  $('#cmpKpis').innerHTML=`
    <div class="kpi blue"><div class="v">${st.avgResp??'—'}<span style="font-size:.9rem">h</span></div><div class="l">Avg response time</div></div>
    <div class="kpi"><div class="v">${st.avgReso??'—'}<span style="font-size:.9rem">h</span></div><div class="l">Avg resolution time</div></div>
    <div class="kpi amber"><div class="v">${st.open}</div><div class="l">Open complaints</div></div>
    <div class="kpi"><div class="v">${st.closed}</div><div class="l">Resolved / closed</div></div>`;
  const q=($('#cQ').value||'').toLowerCase(), cat=$('#cC').value, s=$('#cS').value;
  const rows=DB.complaints.filter(c=>{const stu=student(c.studentId);
    return (!q||c.title.toLowerCase().includes(q)||stu.name.toLowerCase().includes(q)||c.id.toLowerCase().includes(q))
      &&(!cat||c.category===cat)&&(!s||c.status===s);})
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  $('#cTable').innerHTML=rows.length?`<table><thead><tr><th>Case</th><th>Title</th><th>Student</th><th>Category</th><th>Priority</th><th>Assignee</th><th>Response</th><th>Resolution</th><th>Status</th></tr></thead><tbody>
  ${rows.map(c=>`<tr><td><a class="rowlink" onclick="viewComplaint('${c.id}')">${c.id}</a></td><td>${esc(c.title)}</td>
    <td>${studentLink(c.studentId)}</td><td>${esc(c.category)}${c.sub?' · '+esc(c.sub):''}</td><td>${tag(c.priority)}</td>
    <td style="font-size:.82rem">${esc(c.assignee||'—')}</td>
    <td>${c.respondedAt?hoursBetween(c.createdAt,c.respondedAt)+'h':'—'}</td>
    <td>${c.resolvedAt?hoursBetween(c.createdAt,c.resolvedAt)+'h':'—'}</td><td>${tag(c.status)}</td></tr>`).join('')}</tbody></table>`
    :'<div class="empty">No complaints match.</div>';
}
function complaintForm(){
  openModal('Log complaint',`
    <div class="frow"><div><label>Student</label><select id="cf_s">${studentOptions()}</select></div>
    <div><label>Category</label><select id="cf_c" onchange="$('#cf_subWrap').style.display=this.value==='Maintenance'?'block':'none'">${optionsHtml(masterList('complaintCategory'))}</select></div></div>
    <div id="cf_subWrap"><label>Maintenance type</label><select id="cf_sub">${optionsHtml(masterList('maintenanceSub'))}</select></div>
    <div><label>Title</label><input id="cf_title"></div>
    <div><label>Description</label><textarea id="cf_desc" rows="3"></textarea></div>
    <div class="frow"><div><label>Priority</label><select id="cf_p"><option>Low</option><option selected>Medium</option><option>High</option></select></div>
    <div><label>Attachment (image or file)</label><input type="file" id="cf_file" accept="image/*,.pdf"></div></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveComplaint()">Submit</button>`);
}
async function saveComplaint(){
  const fileObj=await readFileInput($('#cf_file'));
  const id='CMP-'+(3000+DB.complaints.length+1);
  const attachments=[]; if(fileObj) attachments.push({name:fileObj.name,size:fileObj.size,fileKey:storeFile(fileObj)});
  const cat=$('#cf_c').value;
  DB.complaints.push({id,studentId:$('#cf_s').value,category:cat,sub:cat==='Maintenance'?$('#cf_sub').value:'',
    title:$('#cf_title').value.trim()||'(untitled)',description:$('#cf_desc').value.trim(),status:'Submitted',assignee:'',
    priority:$('#cf_p').value,createdAt:new Date().toISOString(),respondedAt:null,resolvedAt:null,attachments,comments:[]});
  save('complaints'); audit('CREATE','complaint',id,cat);
  notify('complaint','New complaint submitted',id+' · '+cat+'.');
  closeModal(); toast('Complaint logged'); go('complaints');
}
function viewComplaint(id){
  const c=DB.complaints.find(x=>x.id===id); const s=student(c.studentId);
  openModal('Complaint '+id,`
    <div class="meta-grid">
      <div><div class="l">Student</div>${esc(s.name)} (${s.id})</div>
      <div><div class="l">Category</div>${esc(c.category)}${c.sub?' · '+esc(c.sub):''}</div>
      <div><div class="l">Priority</div>${tag(c.priority)}</div>
      <div><div class="l">Status</div>${tag(c.status)}</div>
      <div><div class="l">Submitted</div>${fmtDT(c.createdAt)}</div>
      <div><div class="l">Response time</div>${c.respondedAt?hoursBetween(c.createdAt,c.respondedAt)+' h':'awaiting first response'}</div>
      <div><div class="l">Resolution time</div>${c.resolvedAt?hoursBetween(c.createdAt,c.resolvedAt)+' h':'—'}</div>
      <div><div class="l">Assignee</div>${esc(c.assignee||'—')}</div>
    </div>
    <div><strong>${esc(c.title)}</strong><br><span style="font-size:.9rem">${esc(c.description)}</span></div>
    ${c.attachments.length?`<div>${c.attachments.map(a=>a.fileKey?`<a class="rowlink" onclick="downloadFileKey('${a.fileKey}')">📎 ${esc(a.name)}</a> (${fmtSize(a.size)})`:`📎 ${esc(a.name)}`).join('<br>')}</div>`:''}
    ${can('complaints','update')?`<div class="frow">
      <div><label>Status</label><select id="cv_st">${CMP_FLOW.map(x=>`<option ${x===c.status?'selected':''}>${x}</option>`).join('')}</select></div>
      <div><label>Assignee</label><input id="cv_as" value="${esc(c.assignee||'')}" placeholder="Team or person"></div></div>`:''}
    ${can('complaints','comment')?`<div><label>Add comment</label><input id="cv_cm" placeholder="Update for the record"></div>`:''}
    <div><div class="l" style="font-size:.72rem;font-weight:700;color:var(--ink-soft)">COMMENTS & UPDATES</div>
      <ul class="timeline">${c.comments.map(h=>`<li><div class="t">${fmtDT(h.at)} · ${esc(h.by)}</div>${esc(h.text)}</li>`).join('')||'<li><div class="t">No comments yet</div></li>'}</ul></div>`,
    `${can('complaints','update')||can('complaints','comment')?`<button class="btn primary" onclick="updateComplaint('${id}')">Save update</button>`:''}
     <button class="btn" onclick="closeModal()">Close</button>`,true);
}
function updateComplaint(id){
  const c=DB.complaints.find(x=>x.id===id);
  const now=new Date().toISOString();
  if($('#cv_st')){
    const ns=$('#cv_st').value, na=$('#cv_as').value.trim();
    if(ns!==c.status){
      if(c.status==='Submitted'&&!c.respondedAt) c.respondedAt=now;
      if(ns==='Resolved'&&!c.resolvedAt) c.resolvedAt=now;
      c.comments.push({at:now,by:CURRENT_USER.name,text:'Status: '+c.status+' → '+ns});
      c.status=ns; audit('WORKFLOW','complaint',id,'Status → '+ns);
      notify('complaint','Complaint update',id+' is now '+ns+'.');
    }
    if(na!==c.assignee){ c.assignee=na; if(!c.respondedAt) c.respondedAt=now; }
  }
  const cm=$('#cv_cm')?$('#cv_cm').value.trim():'';
  if(cm){ c.comments.push({at:now,by:CURRENT_USER.name,text:cm}); if(!c.respondedAt) c.respondedAt=now; audit('COMMENT','complaint',id,cm); }
  save('complaints'); closeModal(); toast('Complaint updated'); go(CURRENT_PAGE,PAGE_ARG);
}
function exportComplaints(){
  exportCSV('complaints.csv',DB.complaints.map(c=>({id:c.id,student_id:c.studentId,student:student(c.studentId).name,
    college:student(c.studentId).college,category:c.category,sub:c.sub,title:c.title,priority:c.priority,status:c.status,
    created:c.createdAt,response_h:c.respondedAt?hoursBetween(c.createdAt,c.respondedAt):'',resolution_h:c.resolvedAt?hoursBetween(c.createdAt,c.resolvedAt):''})));
}

/* ---------------- Student requests ---------------- */
ROUTES.requests=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Student requests</h1>
    <div class="actions">
      ${abtn('requests','export','<button class="btn" onclick="exportRequests()">⬇ Export CSV</button>')}
      ${abtn('requests','add','<button class="btn primary" onclick="requestForm()">＋ New request</button>')}
    </div>
    <p>Workflow: Submitted → Under Review → Approved → Completed, or Rejected.</p></div>
  <div class="card">
    <div class="filters">
      <div style="flex:1;min-width:180px"><label>Search</label><input id="rQ" placeholder="Student or ID" oninput="renderRequests()"></div>
      <div><label>Type</label><select id="rT" onchange="renderRequests()"><option value="">All</option>${optionsHtml(masterList('requestType'))}</select></div>
      <div><label>Status</label><select id="rS" onchange="renderRequests()"><option value="">All</option>${['Submitted','Under Review','Approved','Completed','Rejected'].map(x=>`<option>${x}</option>`).join('')}</select></div>
    </div>
    <div class="tbl-wrap" id="rTable"></div>
  </div>`;
  renderRequests();
};
function renderRequests(){
  const q=($('#rQ').value||'').toLowerCase(), t=$('#rT').value, st=$('#rS').value;
  const rows=DB.requests.filter(r=>{const s=student(r.studentId);
    return (!q||s.name.toLowerCase().includes(q)||r.id.toLowerCase().includes(q))&&(!t||r.type===t)&&(!st||r.status===st);})
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  $('#rTable').innerHTML=rows.length?`<table><thead><tr><th>Request</th><th>Student</th><th>Type</th><th>Submitted</th><th>Decided</th><th>Status</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td><a class="rowlink" onclick="viewRequest('${r.id}')">${r.id}</a></td><td>${studentLink(r.studentId)}</td>
    <td>${esc(r.type)}</td><td>${fmtDT(r.createdAt)}</td><td>${r.decidedAt?fmtDT(r.decidedAt):'—'}</td><td>${tag(r.status)}</td></tr>`).join('')}</tbody></table>`
    :'<div class="empty">No requests match.</div>';
}
function requestForm(){
  openModal('New student request',`
    <div class="frow"><div><label>Student</label><select id="rf_s">${studentOptions()}</select></div>
    <div><label>Request type</label><select id="rf_t">${optionsHtml(masterList('requestType'))}</select></div></div>
    <div><label>Details</label><textarea id="rf_d" rows="3" placeholder="What is being requested and why"></textarea></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveRequest()">Submit</button>`);
}
function saveRequest(){
  const id='REQ-'+(4000+DB.requests.length+1);
  DB.requests.push({id,studentId:$('#rf_s').value,type:$('#rf_t').value,details:$('#rf_d').value.trim(),
    status:'Submitted',createdAt:new Date().toISOString(),decidedAt:null,
    history:[{at:new Date().toISOString(),by:CURRENT_USER.name,note:'Submitted'}]});
  save('requests'); audit('CREATE','request',id,$('#rf_t').value);
  closeModal(); toast('Request submitted'); go('requests');
}
function viewRequest(id){
  const r=DB.requests.find(x=>x.id===id); const s=student(r.studentId);
  const canAct=can('requests','approve'), canRej=can('requests','reject');
  let actions='';
  if(r.status==='Submitted'&&canAct) actions+=`<button class="btn primary" onclick="reqAction('${id}','Under Review')">Start review</button>`;
  if(r.status==='Under Review'){ if(canAct) actions+=`<button class="btn primary" onclick="reqAction('${id}','Approved')">Approve ✓</button>`;
    if(canRej) actions+=`<button class="btn danger" onclick="reqAction('${id}','Rejected')">Reject ✕</button>`; }
  if(r.status==='Approved'&&canAct) actions+=`<button class="btn primary" onclick="reqAction('${id}','Completed')">Mark completed</button>`;
  openModal('Request '+id,`
    <div class="meta-grid">
      <div><div class="l">Student</div>${esc(s.name)} (${s.id})</div>
      <div><div class="l">Type</div>${esc(r.type)}</div>
      <div><div class="l">Status</div>${tag(r.status)}</div>
      <div><div class="l">Submitted</div>${fmtDT(r.createdAt)}</div>
    </div>
    <div><div class="l" style="font-size:.72rem;font-weight:700;color:var(--ink-soft)">DETAILS</div>${esc(r.details)}</div>
    ${canAct?'<div><label>Decision note</label><input id="rq_note" placeholder="Optional note for the record"></div>':''}
    <div><div class="l" style="font-size:.72rem;font-weight:700;color:var(--ink-soft)">HISTORY</div>
      <ul class="timeline">${r.history.map(h=>`<li><div class="t">${fmtDT(h.at)} · ${esc(h.by)}</div>${esc(h.note)}</li>`).join('')}</ul></div>`,
    actions+`<button class="btn" onclick="closeModal()">Close</button>`,true);
}
function reqAction(id,status){
  const r=DB.requests.find(x=>x.id===id);
  const note=$('#rq_note')?$('#rq_note').value.trim():'';
  r.status=status;
  if(['Approved','Rejected'].includes(status)) r.decidedAt=new Date().toISOString();
  r.history.push({at:new Date().toISOString(),by:CURRENT_USER.name,note:status+(note?' — '+note:'')});
  save('requests'); audit('WORKFLOW','request',id,'Status → '+status);
  if(status==='Approved') notify('request','Request approved',id+' ('+r.type+') was approved.');
  if(status==='Rejected') notify('request','Request rejected',id+' ('+r.type+') was rejected.');
  closeModal(); toast('Request '+status.toLowerCase()); go(CURRENT_PAGE,PAGE_ARG);
}
function exportRequests(){
  exportCSV('requests.csv',DB.requests.map(r=>({id:r.id,student_id:r.studentId,student:student(r.studentId).name,
    type:r.type,details:r.details,status:r.status,submitted:r.createdAt,decided:r.decidedAt||''})));
}

/* ---------------- Document register ---------------- */
ROUTES.documents=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Document register</h1>
    <div class="actions">
      ${abtn('documents','export','<button class="btn" onclick="exportDocs()">⬇ Export CSV</button>')}
      ${abtn('documents','upload','<button class="btn primary" onclick="docForm()">＋ Upload document</button>')}
    </div>
    <p>Housing agreements, undertakings, reports and supporting documents. Files up to 2 MB are stored in full and can be downloaded.</p></div>
  <div class="card">
    <div class="filters">
      <div style="flex:1;min-width:180px"><label>Search</label><input id="dQ" placeholder="Document or student" oninput="renderDocs()"></div>
      <div><label>Type</label><select id="dT" onchange="renderDocs()"><option value="">All</option>${optionsHtml(masterList('docType'))}</select></div>
    </div>
    <div class="tbl-wrap" id="dTable"></div>
  </div>`;
  renderDocs();
};
function renderDocs(){
  const q=($('#dQ').value||'').toLowerCase(), t=$('#dT').value;
  const rows=DB.documents.filter(d=>{const s=student(d.studentId);
    return (!q||d.name.toLowerCase().includes(q)||s.name.toLowerCase().includes(q))&&(!t||d.type===t);})
    .sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt));
  $('#dTable').innerHTML=rows.length?`<table><thead><tr><th>Document</th><th>Type</th><th>Student</th><th>Uploaded</th><th>By</th><th>Size</th><th></th></tr></thead><tbody>
  ${rows.map(d=>`<tr><td>📄 ${d.fileKey?`<a class="rowlink" onclick="downloadDoc('${d.id}')">${esc(d.name)}</a>`:esc(d.name)}</td>
    <td>${esc(d.type)}</td><td>${studentLink(d.studentId)}</td><td>${fmtDT(d.uploadedAt)}</td><td style="font-size:.83rem">${esc(d.by)}</td><td>${esc(d.size)}</td>
    <td>${abtn('documents','delete',`<button class="btn small danger" onclick="delDoc('${d.id}')">Delete</button>`)}</td></tr>`).join('')}</tbody></table>`
    :'<div class="empty">No documents match.</div>';
}
function docForm(sid){
  openModal('Upload document',`
    <div class="frow"><div><label>Student</label><select id="df_s">${studentOptions(sid)}</select></div>
    <div><label>Document type</label><select id="df_t">${optionsHtml(masterList('docType'))}</select></div></div>
    <div><label>File (image or PDF, up to 2 MB stored in full)</label><input type="file" id="df_file"></div>
    <div><label>Or record by name only</label><input id="df_name" placeholder="e.g. housing-agreement.pdf"></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveDoc()">Save</button>`);
}
async function saveDoc(){
  const fileObj=await readFileInput($('#df_file'));
  const name=fileObj?fileObj.name:($('#df_name').value.trim());
  if(!name) return toast('Choose a file or enter a name');
  const id=uid('DOC');
  DB.documents.push({id,studentId:$('#df_s').value,type:$('#df_t').value,name,
    uploadedAt:new Date().toISOString(),by:CURRENT_USER.name,size:fileObj?fmtSize(fileObj.size):'—',fileKey:fileObj?storeFile(fileObj):null});
  save('documents'); audit('CREATE','document',id,name);
  closeModal(); toast('Document saved'); go(CURRENT_PAGE,PAGE_ARG);
}
function downloadDoc(id){ const d=DB.documents.find(x=>x.id===id); downloadFileKey(d.fileKey,d.name); }
function delDoc(id){
  const d=DB.documents.find(x=>x.id===id);
  if(!confirm('Delete "'+d.name+'" from the register?')) return;
  if(d.fileKey) delete DB.files[d.fileKey];
  DB.documents=DB.documents.filter(x=>x.id!==id);
  save('documents'); save('files'); audit('DELETE','document',id,d.name);
  toast('Document deleted'); renderDocs();
}
function exportDocs(){
  exportCSV('documents.csv',DB.documents.map(d=>({id:d.id,name:d.name,type:d.type,student_id:d.studentId,
    student:student(d.studentId).name,uploaded:d.uploadedAt,by:d.by,size:d.size,file_stored:d.fileKey?'yes':'name only'})));
}

/* ---------------- Calendar ---------------- */
let calCursor=new Date();
ROUTES.calendar=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Housing calendar</h1>
    <div class="actions">${abtn('calendar','add','<button class="btn primary" onclick="calForm()">＋ Add event</button>')}</div>
    <p>Move-in/move-out dates, inspections, events and planned maintenance.</p></div>
  <div class="card">
    <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.9rem">
      <button class="btn small" onclick="calNav(-1)">←</button>
      <h2 id="calTitle" style="margin:0"></h2>
      <button class="btn small" onclick="calNav(1)">→</button>
      <button class="btn small" onclick="calCursor=new Date();renderCal()">Today</button>
    </div>
    <div class="cal" id="calGrid"></div>
  </div>`;
  renderCal();
};
function calNav(n){ calCursor.setMonth(calCursor.getMonth()+n); renderCal(); }
function renderCal(){
  const y=calCursor.getFullYear(), m=calCursor.getMonth();
  $('#calTitle').textContent=calCursor.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const first=new Date(y,m,1), startDow=first.getDay();
  const start=new Date(y,m,1-startDow);
  let html=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="dow">${d}</div>`).join('');
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const ds=d.toISOString().slice(0,10);
    const evs=DB.calendar.filter(e=>e.date===ds);
    html+=`<div class="day ${d.getMonth()!==m?'other':''} ${ds===todayStr()?'today':''}" onclick="${can('calendar','add')?`calForm('${ds}')`:''}">
      <div class="n">${d.getDate()}</div>
      ${evs.map(e=>`<div class="ev ${e.type==='maintenance'?'amber':e.type==='inspection'?'blue':''}" title="${esc(e.title)}" onclick="event.stopPropagation();${can('calendar','delete')?`delCal('${e.id}')`:''}">${esc(e.title)}</div>`).join('')}
    </div>`;
  }
  $('#calGrid').innerHTML=html;
}
function calForm(date){
  openModal('Add calendar event',`
    <div class="frow"><div><label>Date</label><input type="date" id="ce_d" value="${date||todayStr()}"></div>
    <div><label>Type</label><select id="ce_t"><option value="event">Event</option><option value="inspection">Inspection</option><option value="maintenance">Planned maintenance</option><option value="movein">Move-in / move-out</option><option value="rollcall">Roll call</option></select></div></div>
    <div><label>Title</label><input id="ce_title" placeholder="e.g. Fire drill · Building A"></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveCal()">Add</button>`);
}
function saveCal(){
  const e={id:uid('CAL'),date:$('#ce_d').value,title:$('#ce_title').value.trim()||'Event',type:$('#ce_t').value};
  DB.calendar.push(e); save('calendar'); audit('CREATE','calendar',e.id,e.title);
  notify('announcement','Calendar updated',e.title+' on '+fmtD(e.date)+'.');
  closeModal(); renderCal(); toast('Event added');
}
function delCal(id){
  const e=DB.calendar.find(x=>x.id===id);
  if(!confirm('Remove "'+e.title+'"?')) return;
  DB.calendar=DB.calendar.filter(x=>x.id!==id); save('calendar');
  audit('DELETE','calendar',id,e.title); renderCal();
}

/* ---------------- Notifications ---------------- */
const NTF_ICON={rollcall:'🗓️',violation:'⚠️',complaint:'🛠️',request:'✉️',room:'🚪',late:'⏰',leave:'🌙',maintenance:'🔧',announcement:'📢'};
ROUTES.notifications=function(){
  DB.notifications.forEach(n=>n.read=true); save('notifications'); updateNotifDot();
  $('#content').innerHTML=`
  <div class="page-head"><h1>Notifications & announcements</h1>
    <div class="actions">${abtn('notifications','announce','<button class="btn primary" onclick="announceForm()">📢 New announcement</button>')}</div>
    <p>Automatic alerts for approvals, rejections, room changes, violations, complaint updates, leave expiries and roll call reminders. In production these are also delivered by email / SMS.</p></div>
  <div class="card">
    ${DB.notifications.length?DB.notifications.map(n=>`<div class="notif">
      <div class="ic" style="background:var(--leaf-soft)">${NTF_ICON[n.type]||'🔔'}</div>
      <div><strong>${esc(n.title)}</strong><div>${esc(n.body)}</div><div class="t">${fmtDT(n.at)}</div></div></div>`).join('')
    :'<div class="empty">No notifications.</div>'}
  </div>`;
};
function announceForm(){
  openModal('New housing announcement',`
    <div><label>Title</label><input id="an_t" placeholder="e.g. Water outage — Building C"></div>
    <div><label>Message</label><textarea id="an_b" rows="3"></textarea></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveAnnounce()">Publish</button>`);
}
function saveAnnounce(){
  notify('announcement',$('#an_t').value.trim()||'Announcement',$('#an_b').value.trim());
  audit('ANNOUNCE','notification','—',$('#an_t').value);
  closeModal(); toast('Announcement published'); go('notifications');
}

/* ---------------- Reports ---------------- */
ROUTES.reports=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Reports</h1>
    <div class="actions"><button class="btn" onclick="printPage()">🖨️ Print / Save as PDF</button></div>
    <p>Daily, weekly, monthly and semester views across attendance, violations, complaints and requests.</p></div>
  <div class="card" style="margin-bottom:1rem">
    <div class="filters" style="margin:0">
      <div><label>Report period</label><select id="rpPeriod" onchange="setPeriod()"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly" selected>Monthly</option><option value="semester">Semester</option></select></div>
      <div><label>From</label><input type="date" id="rpFrom"></div>
      <div><label>To</label><input type="date" id="rpTo"></div>
      <button class="btn primary" onclick="renderReports()">Run report</button>
    </div>
  </div>
  <div id="rpOut"></div>`;
  setPeriod();
};
function setPeriod(){
  const p=$('#rpPeriod').value, t=todayStr();
  let from=t;
  if(p==='weekly') from=addDays(t,-7);
  if(p==='monthly') from=addDays(t,-30);
  if(p==='semester') from=DB.settings.semesterStart;
  $('#rpFrom').value=from; $('#rpTo').value=t;
  renderReports();
}
function renderReports(){
  const from=$('#rpFrom').value, to=$('#rpTo').value;
  const inR=(d)=>d&&d.slice(0,10)>=from&&d.slice(0,10)<=to;
  const att=DB.attendance.filter(a=>inR(a.date));
  const attBy={}; att.forEach(a=>attBy[a.status]=(attBy[a.status]||0)+1);
  const vio=DB.violations.filter(v=>inR(v.date));
  const vioBy={}; vio.forEach(v=>vioBy[v.type]=(vioBy[v.type]||0)+1);
  const vioByB={}; vio.forEach(v=>{const b=(v.location||'').split('·')[0].trim()||'Unknown'; vioByB[b]=(vioByB[b]||0)+1;});
  const repeat={}; vio.forEach(v=>repeat[v.studentId]=(repeat[v.studentId]||0)+1);
  const repeaters=Object.entries(repeat).filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]);
  const cmp=DB.complaints.filter(c=>inR(c.createdAt));
  const cst=cmpStats(cmp);
  const cmpByCol={}; cmp.forEach(c=>{const col=student(c.studentId).college||'—'; cmpByCol[col]=(cmpByCol[col]||0)+1;});
  const req=DB.requests.filter(r=>inR(r.createdAt));
  const reqBy={}; req.forEach(r=>reqBy[r.status]=(reqBy[r.status]||0)+1);
  const late=DB.movements.filter(m=>m.late&&inR(m.at));
  const bars=(obj,cls)=>{const mx=Math.max(1,...Object.values(obj));return Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<div class="barrow ${cls||''}"><span class="lbl">${esc(k)}</span><span class="bar" style="width:${n/mx*55}%"></span> ${n}</div>`).join('')||'<div class="empty">No data in range.</div>';};

  $('#rpOut').innerHTML=`
  <div class="grid two-col">
    <div style="display:grid;gap:1rem">
      <div class="card"><h2>Attendance summary · ${fmtD(from)} – ${fmtD(to)}</h2>${bars(attBy)}
        <div style="margin-top:.6rem">${abtn('reports','export',`<button class="btn small" onclick="exportAttendanceRange('${from}','${to}')">⬇ Export attendance</button>`)}</div></div>
      <div class="card"><h2>Violations</h2>
        <p style="font-size:.85rem;color:var(--ink-soft);margin-bottom:.5rem">Most common types</p>${bars(vioBy,'brick')}
        <p style="font-size:.85rem;color:var(--ink-soft);margin:.8rem 0 .5rem">By building</p>${bars(vioByB,'amber')}
        <p style="font-size:.85rem;color:var(--ink-soft);margin:.8rem 0 .5rem">Students with repeated violations</p>
        ${repeaters.length?`<table><thead><tr><th>Student</th><th>Count</th></tr></thead><tbody>${repeaters.map(([sid,n])=>`<tr><td>${studentLink(sid)}</td><td>${n}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No repeat violations in range.</div>'}
        <div style="margin-top:.6rem">${abtn('reports','export','<button class="btn small" onclick="exportViolations()">⬇ Export violations</button>')}</div></div>
    </div>
    <div style="display:grid;gap:1rem;align-content:start">
      <div class="card"><h2>Complaints</h2>
        <div class="grid kpis" style="margin-bottom:.8rem">
          <div class="kpi blue"><div class="v">${cst.avgResp??'—'}h</div><div class="l">Avg response</div></div>
          <div class="kpi"><div class="v">${cst.avgReso??'—'}h</div><div class="l">Avg resolution</div></div>
          <div class="kpi amber"><div class="v">${cst.open}</div><div class="l">Open</div></div>
          <div class="kpi"><div class="v">${cst.closed}</div><div class="l">Closed</div></div></div>
        <p style="font-size:.85rem;color:var(--ink-soft);margin-bottom:.5rem">By academic college / major</p>${bars(cmpByCol,'blue')}</div>
      <div class="card"><h2>Requests</h2>${bars(reqBy,'blue')}</div>
      <div class="card"><h2>Late returns</h2>
        ${late.length?late.map(m=>`<div style="font-size:.87rem;padding:.35rem 0">${esc(student(m.studentId).name)} — ${fmtDT(m.returnedAt)} (${hoursBetween(m.expectedReturn,m.returnedAt)}h late)</div>`).join(''):'<div class="empty">No late returns in range.</div>'}</div>
    </div>
  </div>`;
}
function exportAttendanceRange(from,to){
  exportCSV(`attendance-${from}-to-${to}.csv`,DB.attendance.filter(a=>a.date>=from&&a.date<=to)
    .map(a=>({date:a.date,student_id:a.studentId,student:student(a.studentId).name,status:a.status,note:a.note,by:a.by})));
}

/* ---------------- Audit trail ---------------- */
ROUTES.audit=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Audit trail</h1>
    <div class="actions">${abtn('audit','export','<button class="btn" onclick="exportAudit()">⬇ Export CSV</button>')}</div>
    <p>Every action: who performed it, when, and what changed. In production this log is mirrored server-side and included in backups.</p></div>
  <div class="card">
    <div class="filters">
      <div style="flex:1;min-width:180px"><label>Search</label><input id="auQ" placeholder="User, entity, ID" oninput="renderAudit()"></div>
      <div><label>Action</label><select id="auA" onchange="renderAudit()"><option value="">All</option>${[...new Set(DB.audit.map(a=>a.action))].map(a=>`<option>${a}</option>`).join('')}</select></div>
    </div>
    <div class="tbl-wrap" id="auTable"></div>
  </div>`;
  renderAudit();
};
function renderAudit(){
  const q=($('#auQ').value||'').toLowerCase(), act=$('#auA').value;
  const rows=DB.audit.filter(a=>(!q||a.user.toLowerCase().includes(q)||a.entity.toLowerCase().includes(q)||String(a.entityId).toLowerCase().includes(q)||a.details.toLowerCase().includes(q))&&(!act||a.action===act)).slice(0,300);
  $('#auTable').innerHTML=rows.length?`<table><thead><tr><th>When</th><th>User</th><th>Role</th><th>Action</th><th>Entity</th><th>Record</th><th>Details</th><th>Env</th></tr></thead><tbody>
  ${rows.map(a=>`<tr><td style="white-space:nowrap">${fmtDT(a.at)}</td><td>${esc(a.user)}</td><td style="font-size:.8rem">${esc(a.role)}</td>
    <td><span class="tag ${a.action==='DELETE'?'brick':a.action==='CREATE'?'green':'blue'}">${a.action}</span></td>
    <td>${esc(a.entity)}</td><td class="mono">${esc(a.entityId)}</td><td style="font-size:.83rem">${esc(a.details)}</td><td style="font-size:.75rem">${a.env}</td></tr>`).join('')}</tbody></table>`
    :'<div class="empty">No audit entries match.</div>';
}
function exportAudit(){ exportCSV('audit-trail.csv',DB.audit.map(a=>({at:a.at,user:a.user,role:a.role,action:a.action,entity:a.entity,record:a.entityId,details:a.details,env:a.env}))); }

/* ---------------- Master data ---------------- */
const MASTER_TYPES=[['college','Colleges / Majors'],['violationType','Violation types'],['complaintCategory','Complaint categories'],
  ['maintenanceSub','Maintenance types'],['requestType','Request types'],['attendanceStatus','Attendance statuses'],
  ['docType','Document types'],['disciplinaryAction','Disciplinary actions']];
let masterTab='college';
ROUTES.master=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Master data</h1>
    <div class="actions">${abtn('master','add','<button class="btn primary" onclick="masterForm()">＋ Add value</button>')}</div>
    <p>Values behind every drop-down. Each value carries a validity date range, so lists can change per semester without losing history.</p></div>
  <div class="card">
    <div class="tabs">${MASTER_TYPES.map(([t,l])=>`<button class="tab ${t===masterTab?'active':''}" onclick="masterTab='${t}';go('master')">${l}</button>`).join('')}</div>
    <div class="tbl-wrap" id="mdTable"></div>
  </div>
  <div class="card" style="margin-top:1rem"><h2>Buildings & rooms</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Building</th><th>Floors</th><th>Rooms</th><th>Capacity</th><th>Occupied beds</th></tr></thead><tbody>
    ${DB.buildings.map(b=>{const rs=DB.rooms.filter(r=>r.buildingId===b.id);const cap=rs.reduce((a,r)=>a+r.capacity,0);
      const occ=DB.students.filter(s=>s.status==='Active'&&s.building===b.id).length;
      return `<tr><td><strong>${esc(b.name)}</strong></td><td>${b.floors}</td><td>${rs.length}</td><td>${cap}</td><td>${occ}</td></tr>`;}).join('')}
    </tbody></table></div></div>`;
  renderMaster();
};
function renderMaster(){
  const rows=DB.master.filter(m=>m.type===masterTab);
  $('#mdTable').innerHTML=rows.length?`<table><thead><tr><th>Value</th><th>Valid from</th><th>Valid to</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.map(m=>`<tr><td><strong>${esc(m.value)}</strong></td><td>${fmtD(m.from)}</td><td>${m.to?fmtD(m.to):'Open-ended'}</td>
    <td>${tag(m.active!==false?'Active':'Inactive')}</td>
    <td style="white-space:nowrap">${abtn('master','edit',`<button class="btn small" onclick="masterForm('${m.id}')">Edit</button>`)}
    ${abtn('master','delete',`<button class="btn small danger" onclick="delMaster('${m.id}')">Remove</button>`)}</td></tr>`).join('')}</tbody></table>`
    :'<div class="empty">No values for this list yet.</div>';
}
function masterForm(id){
  const m=id?DB.master.find(x=>x.id===id):{type:masterTab,from:todayStr(),to:'',active:true};
  openModal(id?'Edit master value':'Add master value',`
    <div class="frow"><div><label>List</label><select id="md_t" ${id?'disabled':''}>${MASTER_TYPES.map(([t,l])=>`<option value="${t}" ${t===m.type?'selected':''}>${l}</option>`).join('')}</select></div>
    <div><label>Value</label><input id="md_v" value="${esc(m.value||'')}"></div></div>
    <div class="frow"><div><label>Valid from</label><input type="date" id="md_f" value="${m.from||''}"></div>
    <div><label>Valid to (blank = open-ended)</label><input type="date" id="md_to" value="${m.to||''}"></div></div>
    <div><label><input type="checkbox" id="md_a" ${m.active!==false?'checked':''} style="width:auto;margin-right:.4rem">Active</label></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveMaster('${id||''}')">Save</button>`);
}
function saveMaster(id){
  const data={type:$('#md_t').value,value:$('#md_v').value.trim(),from:$('#md_f').value,to:$('#md_to').value,active:$('#md_a').checked};
  if(!data.value) return toast('Value is required');
  if(id){ Object.assign(DB.master.find(x=>x.id===id),data); audit('UPDATE','master',id,data.type+': '+data.value); }
  else { const nid=uid('MD'); DB.master.push({id:nid,...data}); audit('CREATE','master',nid,data.type+': '+data.value); }
  save('master'); closeModal(); toast('Master data saved'); go('master');
}
function delMaster(id){
  const m=DB.master.find(x=>x.id===id);
  if(!confirm('Remove "'+m.value+'" from '+m.type+'? Existing records keep the value.')) return;
  DB.master=DB.master.filter(x=>x.id!==id); save('master');
  audit('DELETE','master',id,m.type+': '+m.value); renderMaster();
}

/* ---------------- Roles & users ---------------- */
ROUTES.roles=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Roles & users</h1>
    <div class="actions">${abtn('roles','add','<button class="btn" onclick="userForm()">＋ Add user</button><button class="btn primary" onclick="roleForm()">＋ Create role</button>')}</div>
    <p>Admins create roles and assign every page and every button to a role. Users inherit exactly what their role permits.</p></div>
  <div class="card" style="margin-bottom:1rem"><h2>Roles</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Role</th><th>Description</th><th>Access</th><th>Users</th><th></th></tr></thead><tbody>
    ${DB.roles.map(r=>`<tr><td><strong>${esc(r.name)}</strong>${r.system?' <span class="tag grey">system</span>':''}</td>
      <td style="font-size:.85rem">${esc(r.desc||'')}</td>
      <td style="font-size:.82rem">${r.perms==='ALL'?'<span class="tag green">All pages & actions</span>':Object.keys(r.perms).length+' pages'}</td>
      <td>${DB.users.filter(u=>u.role===r.name).length}</td>
      <td>${!r.system&&can('roles','edit')?`<button class="btn small" onclick="roleForm('${r.id}')">Edit permissions</button>`:''}</td></tr>`).join('')}
    </tbody></table></div></div>
  <div class="card"><h2>Users</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
    ${DB.users.map(u=>`<tr><td><strong>${esc(u.name)}</strong></td><td style="font-size:.85rem">${esc(u.email)}</td><td>${esc(u.role)}</td>
      <td>${tag(u.active?'Active':'Inactive')}</td>
      <td>${abtn('roles','edit',`<button class="btn small" onclick="userForm('${u.id}')">Edit</button>`)} ${can('roles','edit')?`<button class="btn small" onclick="credForm('${u.id}')">🔑 Credentials</button>`:''}</td></tr>`).join('')}
    </tbody></table></div></div>`;
};
async function credForm(id){
  const u=DB.users.find(x=>x.id===id); if(!u) return;
  openModal('Sign-in credentials — '+esc(u.name),`
    <div class="frow"><div><label>Username</label><input id="cr_user" value="${esc(u.username||'')}" placeholder="e.g. ${esc((u.email||'user@x').split('@')[0])}"></div>
    <div><label>New password</label><input id="cr_pass" type="password" placeholder="min 6 characters"></div></div>
    <p style="font-size:.8rem;color:var(--ink-soft)">Passwords are stored server-side as bcrypt hashes. Administrator only.</p>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveCred('${id}')">Save credentials</button>`);
}
async function saveCred(id){
  const username=$('#cr_user').value.trim(), password=$('#cr_pass').value;
  if(!password||password.length<6) return toast('Password must be at least 6 characters');
  const r=await api('/users/'+id+'/password',{method:'POST',body:JSON.stringify({username,password})});
  if(!r.ok){ const d=await r.json().catch(()=>({})); return toast(d.error||'Failed'); }
  const u=DB.users.find(x=>x.id===id); if(u&&username) u.username=username;
  closeModal(); toast('Credentials updated');
}
function roleForm(id){
  const r=id?DB.roles.find(x=>x.id===id):{name:'',desc:'',perms:{}};
  const perms=r.perms==='ALL'?{}:r.perms;
  openModal(id?'Edit role — '+esc(r.name):'Create role',`
    <div class="frow"><div><label>Role name</label><input id="rl_name" value="${esc(r.name)}" ${id?'disabled':''}></div>
    <div><label>Description</label><input id="rl_desc" value="${esc(r.desc||'')}"></div></div>
    <div><label>Page & button permissions</label>
    <div class="perm-grid">
    ${PAGES.map(p=>`<div class="perm-row"><span class="pg">${p.icon} ${p.label}</span>
      <label><input type="checkbox" data-pg="${p.id}" data-act="__view" ${perms[p.id]?.view?'checked':''}> View page</label>
      ${p.actions.map(a=>`<label><input type="checkbox" data-pg="${p.id}" data-act="${a}" ${perms[p.id]?.actions?.[a]?'checked':''}> ${a}</label>`).join('')}
    </div>`).join('')}
    </div></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveRole('${id||''}')">Save role</button>`,true);
}
function saveRole(id){
  const name=$('#rl_name').value.trim();
  if(!name) return toast('Role name required');
  const perms={};
  document.querySelectorAll('#modalBox input[type=checkbox]').forEach(cb=>{
    const pg=cb.dataset.pg, act=cb.dataset.act;
    if(!cb.checked) return;
    perms[pg]=perms[pg]||{view:false,actions:{}};
    if(act==='__view') perms[pg].view=true; else perms[pg].actions[act]=true;
  });
  Object.values(perms).forEach(p=>{ if(Object.keys(p.actions).length) p.view=true; });
  if(id){ const r=DB.roles.find(x=>x.id===id); r.desc=$('#rl_desc').value.trim(); r.perms=perms; audit('UPDATE','role',id,'Permissions updated'); }
  else{ if(DB.roles.some(x=>x.name===name)) return toast('Role name already exists');
    const nid=uid('ROLE'); DB.roles.push({id:nid,name,desc:$('#rl_desc').value.trim(),perms,system:false});
    audit('CREATE','role',nid,name); }
  save('roles'); closeModal(); toast('Role saved'); buildNav(); go('roles');
}
function userForm(id){
  const u=id?DB.users.find(x=>x.id===id):{name:'',email:'',role:DB.roles[1]?.name||'Viewer',active:true};
  openModal(id?'Edit user':'Add user',`
    <div class="frow"><div><label>Name</label><input id="us_n" value="${esc(u.name)}"></div>
    <div><label>Email</label><input id="us_e" value="${esc(u.email)}"></div></div>
    <div class="frow"><div><label>Role</label><select id="us_r">${DB.roles.map(r=>`<option ${r.name===u.role?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>
    <div><label>Status</label><select id="us_a"><option value="1" ${u.active?'selected':''}>Active</option><option value="0" ${!u.active?'selected':''}>Inactive</option></select></div></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveUser('${id||''}')">Save</button>`);
}
function saveUser(id){
  const data={name:$('#us_n').value.trim(),email:$('#us_e').value.trim(),role:$('#us_r').value,active:$('#us_a').value==='1'};
  if(!data.name) return toast('Name required');
  if(id){ Object.assign(DB.users.find(x=>x.id===id),data); audit('UPDATE','user',id,'User updated'); }
  else{ const nid=uid('USR'); DB.users.push({id:nid,...data}); audit('CREATE','user',nid,data.name+' → '+data.role); }
  save('users'); closeModal(); toast('User saved'); go('roles');
}

/* ---------------- Integration & API ---------------- */
ROUTES.integration=function(){
  $('#content').innerHTML=`
  <div class="page-head"><h1>Integration & API</h1>
    <p>The app exposes an in-browser API layer (window.HousingAPI) that mirrors the REST endpoints a production backend will serve, so other systems can push and pull data. The data model is 1:1 database-ready.</p></div>

  <div class="grid two-col">
    <div style="display:grid;gap:1rem">
      <div class="card"><h2>REST-style API (GET / POST / PUT)</h2>
        <p style="font-size:.87rem;margin-bottom:.7rem">Available now in the console as <span class="mono">window.HousingAPI</span>, and designed to map directly onto production endpoints:</p>
        <div class="tbl-wrap"><table><thead><tr><th>Method</th><th>Endpoint</th><th>Purpose</th></tr></thead><tbody>
        ${[['GET','/api/v1/students','List / pull students'],['GET','/api/v1/students/{id}','Full student record incl. history'],
          ['POST','/api/v1/students','Push a new student (Admissions)'],['PUT','/api/v1/students/{id}','Update a student'],
          ['GET','/api/v1/attendance?date=','Pull daily roll call'],['POST','/api/v1/attendance','Push attendance record'],
          ['GET','/api/v1/movements','Entry/exit log (Card Access push)'],['POST','/api/v1/movements','Gate system pushes swipe events'],
          ['GET','/api/v1/violations · /complaints · /requests','Pull cases'],['POST','/api/v1/complaints','Push complaint (student portal)'],
          ['GET','/api/v1/reports/occupancy','KPIs for BI tools'],['GET','/api/v1/audit','Audit log pull']]
          .map(r=>`<tr><td><span class="tag ${r[0]==='GET'?'blue':'green'}">${r[0]}</span></td><td class="mono" style="font-size:.78rem">${r[1]}</td><td style="font-size:.83rem">${r[2]}</td></tr>`).join('')}
        </tbody></table></div>
        <p style="font-size:.8rem;color:var(--ink-soft);margin-top:.7rem">Try in the browser console: <span class="mono">HousingAPI.get('students')</span> · <span class="mono">HousingAPI.post('students', {...})</span> · <span class="mono">HousingAPI.put('students','STU-1001',{phone:'050...'})</span></p>
      </div>
      <div class="card"><h2>Environments</h2>
        <p style="font-size:.87rem">Two isolated datasets are kept: <strong>Production</strong> and <strong>Non-Production</strong>. Switch with the selector in the sidebar. Production can be cloned down for safe testing.</p>
        ${abtn('integration','clone',`<button class="btn primary" style="margin-top:.7rem" onclick="cloneProdToTest()">⧉ Clone Production → Non-Production</button>`)}
        <p style="font-size:.78rem;color:var(--ink-soft);margin-top:.5rem">Cloning overwrites the non-production dataset with a full copy of production. The action is recorded in the audit trail.</p>
      </div>
      <div class="card"><h2>Backups</h2>
        <p style="font-size:.87rem">Download a full snapshot of the current environment (all tables, documents metadata and audit log) as JSON — the same shape a server-side backup job would produce.</p>
        <button class="btn" style="margin-top:.7rem" onclick="downloadBackup()">⬇ Download backup (JSON)</button>
      </div>
    </div>
    <div style="display:grid;gap:1rem;align-content:start">
      <div class="card"><h2>Database schema (production-ready)</h2>
        <p style="font-size:.85rem;margin-bottom:.6rem">Every collection maps to a table (SQL Server / Azure SQL / PostgreSQL / Oracle):</p>
        <div class="mono" style="font-size:.74rem;line-height:1.7;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:.9rem;overflow-x:auto">
students(id PK, name, email, phone, college, building_id FK, room_id FK, status, joined, emergency)<br>
buildings(id PK, name, floors)<br>
rooms(id PK, building_id FK, floor, number, capacity, active)<br>
room_allocations(id PK, student_id FK, room_id FK, from_date, to_date, note)<br>
attendance(id PK, date, student_id FK, status, note, recorded_by, recorded_at)<br>
movements(id PK, student_id FK, type, at, expected_return, returned_at, late, purpose, recorded_by)<br>
violations(id PK, student_id FK, type, date, time, location, description, staff, action, status)<br>
violation_history(id PK, violation_id FK, at, by, note)<br>
complaints(id PK, student_id FK, category, sub, title, description, status, assignee, priority, created_at, responded_at, resolved_at)<br>
complaint_comments(id PK, complaint_id FK, at, by, text)<br>
requests(id PK, student_id FK, type, details, status, created_at, decided_at)<br>
request_history(id PK, request_id FK, at, by, note)<br>
documents(id PK, student_id FK, type, name, uploaded_at, by, size, blob_ref)<br>
files(key PK, name, mime, size, content BLOB)<br>
calendar_events(id PK, date, title, type)<br>
notifications(id PK, at, type, title, body, read)<br>
audit_log(id PK, at, user, role, action, entity, entity_id, details, env)<br>
master_data(id PK, type, value, valid_from, valid_to, active)<br>
roles(id PK, name, description, permissions JSON)<br>
users(id PK, name, email, role_id FK, active)
        </div></div>
      <div class="card"><h2>Planned integrations</h2>
        <div style="font-size:.87rem;line-height:1.9">🎓 Admissions & Registration — student sync (pull)<br>💳 Student ID / Card Access — gate events (push)<br>💰 Finance — fines & housing fees (push/pull)<br>✉️ Email / SMS gateway — notification delivery<br>🔐 Microsoft Entra ID — SSO (OIDC) & role claims</div></div>
    </div>
  </div>`;
};
async function cloneProdToTest(){
  if(!confirm('Overwrite Non-Production with a full copy of Production?')) return;
  const r=await api('/admin/clone-prod-to-test',{method:'POST'});
  if(!r.ok){ const d=await r.json().catch(()=>({})); return toast(d.error||'Clone failed'); }
  if(ENV==='test'){ DB=await loadEnv(); buildNav(); go('integration'); }
  toast('Production cloned to Non-Production');
}
async function downloadBackup(){
  const r=await api('/admin/backup');
  if(!r.ok){ const d=await r.json().catch(()=>({})); return toast(d.error||'Backup failed (administrator only)'); }
  const blob=await r.blob();
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`sma-housing-backup-${ENV}-${todayStr()}.json`; a.click();
  toast('Backup downloaded');
}

/* ---------------- Environment switch ---------------- */
async function switchEnv(env){
  ENV=env; localStorage.setItem('sma:env',env);
  try{ DB=await loadEnv(); }catch(e){ return toast('Could not load '+env+': '+e.message); }
  if(!DB.students||!DB.students.length){
    if(env==='test') toast('Non-production is empty — clone production from Integration & API, or start fresh');
    COLLECTIONS.forEach(c=>{ if(DB[c]==null||(Array.isArray(DB[c])&&!DB[c].length&&(c==='settings'||c==='files'))) DB[c]=(c==='settings'||c==='files')?{}:(DB[c]||[]); });
  }
  COLLECTIONS.forEach(c=>{ if(DB[c]==null) DB[c]=(c==='settings'||c==='files')?{}:[]; });
  DB.roles.forEach(rl=>{ if(rl.perms!=='ALL'&&(!rl.perms||!Object.keys(rl.perms).length)) rl.perms=defaultPerms(rl.name); });
  audit('ENV','environment',env,'Switched to '+(env==='prod'?'Production':'Non-Production'));
  $('#uRole').textContent=CURRENT_USER.role+' · '+(ENV==='prod'?'Production':'Non-Prod');
  buildNav(); updateNotifDot(); go('dashboard');
  toast('Now working in '+(env==='prod'?'Production':'Non-Production'));
}

/* ---------------- Global search ---------------- */
let searchTimer;
function globalSearch(q){
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{
    q=q.trim().toLowerCase(); if(!q) return;
    if(q.length<2) return;
    const hits=[];
    DB.students.forEach(s=>{ if(s.name.toLowerCase().includes(q)||s.id.toLowerCase().includes(q)||(s.room||'').toLowerCase().includes(q)) hits.push({t:'Student',l:s.name+' ('+s.id+')',go:()=>go('studentDetail',s.id)}); });
    DB.violations.forEach(v=>{ if(v.id.toLowerCase().includes(q)) hits.push({t:'Violation',l:v.id+' · '+v.type,go:()=>viewViolation(v.id)}); });
    DB.complaints.forEach(c=>{ if(c.id.toLowerCase().includes(q)||c.title.toLowerCase().includes(q)) hits.push({t:'Complaint',l:c.id+' · '+c.title,go:()=>viewComplaint(c.id)}); });
    DB.requests.forEach(r=>{ if(r.id.toLowerCase().includes(q)) hits.push({t:'Request',l:r.id+' · '+r.type,go:()=>viewRequest(r.id)}); });
    if(!hits.length) return;
    window._hits=hits;
    openModal('Search results — “'+esc(q)+'”',
      hits.slice(0,15).map((h,i)=>`<div style="padding:.4rem 0;border-bottom:1px solid #EFEEE7"><span class="tag blue">${h.t}</span> <a class="rowlink" onclick="closeModal();window._hits[${i}].go()">${esc(h.l)}</a></div>`).join(''),
      `<button class="btn" onclick="closeModal()">Close</button>`);
  },450);
}

/* ---------------- Public API layer (window.HousingAPI) ---------------- */
window.HousingAPI={
  async get(collection,id){
    const r=await api('/'+collection+(id?'/'+id:''));
    return {status:r.status, data: r.ok? await r.json(): undefined, error: r.ok? undefined: (await r.json().catch(()=>({}))).error};
  },
  async post(collection,record){
    const r=await api('/'+collection,{method:'POST',body:JSON.stringify(record)});
    return {status:r.status, data: r.ok? await r.json(): undefined, error: r.ok? undefined: (await r.json().catch(()=>({}))).error};
  },
  async put(collection,id,patch){
    const r=await api('/'+collection+'/'+id,{method:'PUT',body:JSON.stringify(patch)});
    return {status:r.status, data: r.ok? await r.json(): undefined, error: r.ok? undefined: (await r.json().catch(()=>({}))).error};
  },
  async del(collection,id){
    const r=await api('/'+collection+'/'+id,{method:'DELETE'});
    return {status:r.status};
  }
};

/* ---------------- Roll call daily reminder + leave expiry ---------------- */
function dailyChecks(){
  const t=todayStr();
  if(DB.settings.lastRollcallReminder!==t){
    DB.settings.lastRollcallReminder=t;
    notify('rollcall','Daily roll call reminder','Roll call for '+fmtD(t)+' is scheduled at '+(DB.settings.rollcallTime||'21:00')+'.');
    // leave expiry reminders
    overdueMovements().forEach(m=>notify('late','Overdue return',student(m.studentId).name+' has not returned; expected '+fmtDT(m.expectedReturn)+'.'));
    save('settings');
  }
}

/* ---------------- Boot ---------------- */
(async function boot(){
  populateLogin();
  // resume an existing session if the token is still valid
  if(TOKEN){
    try{
      const r=await api('/auth/me');
      if(r.ok){ const me=await r.json(); await startSession(me,'resume'); return; }
    }catch(e){}
    TOKEN=null; localStorage.removeItem('sma:token');
  }
})();
