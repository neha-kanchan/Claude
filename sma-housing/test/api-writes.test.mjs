const B = (process.env.BASE_URL || 'http://localhost:3200') + '/api';
const j=async(r)=>{const t=await r.text();try{return JSON.parse(t)}catch{return t}};
let pass=0,fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  PASS',m)} else {fail++;console.log('  FAIL',m)} };

const login=async(u,p)=>{const r=await fetch(B+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});return (await j(r)).token;};
const H=(t,extra={})=>({'Content-Type':'application/json','Authorization':'Bearer '+t,'X-Env':'prod',...extra});

const admin=await login('amal','admin123');
ok(!!admin,'admin login');

// seed two students directly via REST
for(const s of [{id:'S-A',name:'Alice A'},{id:'S-B',name:'Bob B'}])
  await fetch(B+'/students',{method:'POST',headers:H(admin),body:JSON.stringify(s)});
let list=await j(await fetch(B+'/students',{headers:H(admin)}));
ok(list.length>=2,'two students exist ('+list.length+')');

// --- THE CONCURRENCY TEST ---
// Client 1 and Client 2 both bootstrapped when only S-A and S-B existed.
// Client 2 adds S-C. Client 1 then saves an edit to S-A.
// Old behaviour: client 1's whole-collection PUT deletes S-C.
await fetch(B+'/students',{method:'POST',headers:H(admin),body:JSON.stringify({id:'S-C',name:'Carol C'})});
// client 1 edits only S-A, per-record:
await fetch(B+'/students/S-A',{method:'PUT',headers:H(admin,{'X-Source':'ui'}),body:JSON.stringify({id:'S-A',name:'Alice Edited'})});
list=await j(await fetch(B+'/students',{headers:H(admin)}));
ok(!!list.find(s=>s.id==='S-C'),"concurrent client's new record survives a per-record save");
ok(list.find(s=>s.id==='S-A').name==='Alice Edited','the edit landed');

// old whole-collection sync would have wiped it — prove that is what used to happen
await fetch(B+'/sync/students',{method:'PUT',headers:H(admin),body:JSON.stringify(list.filter(s=>s.id!=='S-C'))});
let after=await j(await fetch(B+'/students',{headers:H(admin)}));
ok(!after.find(s=>s.id==='S-C'),'(control) whole-collection sync still deletes omitted records');

// audit channel labelling
const aud=await j(await fetch(B+'/audit',{headers:H(admin)}));
ok(aud.some(a=>a.details==='In-app edit'),'UI writes audited as In-app edit');
ok(aud.some(a=>a.details==='Via REST API'),'API writes audited as Via REST API');

// per-record 403 for a read-only role
const vera=await login('vera','demo123');
const r403=await fetch(B+'/students/S-A',{method:'PUT',headers:H(vera),body:JSON.stringify({name:'nope'})});
ok(r403.status===403,'viewer gets 403 on per-record write (got '+r403.status+')');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
