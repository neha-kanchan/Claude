const B = (process.env.BASE_URL || 'http://localhost:3200') + '/api';
const j=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return t}};
let pass=0,fail=0; const ok=(c,m)=>{c?(pass++,console.log('  PASS',m)):(fail++,console.log('  FAIL',m))};
const login=async(u,p,env='prod')=>(await j(await fetch(B+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Env':env},body:JSON.stringify({username:u,password:p})}))).token;
const H=(t,env='prod')=>({'Content-Type':'application/json','Authorization':'Bearer '+t,'X-Env':env});

const t=await login('amal','admin123');
// a ~700KB body, the kind a document upload produces
const big='data:image/jpeg;base64,'+Buffer.alloc(512*1024,'A').toString('base64');
await fetch(B+'/files',{method:'POST',headers:H(t),body:JSON.stringify({id:'FILE-BIG',name:'agreement.jpg',mime:'image/jpeg',size:big.length,data:big})});
await fetch(B+'/students',{method:'POST',headers:H(t),body:JSON.stringify({id:'S-P',name:'Photo Student',photoKey:'FILE-BIG'})});

const boot=await j(await fetch(B+'/bootstrap',{headers:H(t)}));
const bootBytes=JSON.stringify(boot).length;
ok(boot.files['FILE-BIG'],'bootstrap still lists the file');
ok(!boot.files['FILE-BIG'].data,'bootstrap carries NO file body');
ok(boot.files['FILE-BIG'].name==='agreement.jpg','metadata (name) survives');
ok(bootBytes < 200000, `bootstrap is small: ${(bootBytes/1024).toFixed(0)} KB (body alone is ${(big.length/1024).toFixed(0)} KB)`);

const listed=await j(await fetch(B+'/files',{headers:H(t)}));
ok(!listed['FILE-BIG'].data,'GET /files carries no body');
const single=await j(await fetch(B+'/files/FILE-BIG',{headers:H(t)}));
ok(!single.data,'GET /files/:id carries no body');

// ticket flow
const tk=await j(await fetch(B+'/files/view-token',{headers:H(t)}));
ok(!!tk.token && tk.expiresIn>0,'view ticket minted (ttl '+tk.expiresIn+'s)');
const noHdr=await fetch(B+'/files/FILE-BIG/view?t='+encodeURIComponent(tk.token));   // no Authorization, no X-Env
ok(noHdr.status===200,'img-style request works with ticket and no headers');
ok(noHdr.headers.get('content-type')==='image/jpeg','served with the stored mime type');
ok((await noHdr.arrayBuffer()).byteLength===512*1024,'full body returned');

ok((await fetch(B+'/files/FILE-BIG/view')).status===401,'no ticket → 401');
ok((await fetch(B+'/files/FILE-BIG/view?t=garbage')).status===401,'bad ticket → 401');
// a session token must not work as a file ticket (wrong scope)
ok((await fetch(B+'/files/FILE-BIG/view?t='+encodeURIComponent(t))).status===401,'session token is not a file ticket');

// env binding: a prod ticket must not read test
const tTest=await login('amal','admin123','test');
const tkTest=await j(await fetch(B+'/files/view-token',{headers:H(tTest,'test')})).catch(()=>({}));
const crossEnv=await fetch(B+'/files/FILE-BIG/view?t='+encodeURIComponent(tkTest.token));
ok(crossEnv.status===404,'a test-env ticket cannot read a prod file (got '+crossEnv.status+')');

// download route still requires the real session token
ok((await fetch(B+'/files/FILE-BIG/download')).status===401,'download still needs a bearer token');
const dl=await fetch(B+'/files/FILE-BIG/download',{headers:H(t)});
ok(dl.status===200 && /attachment/.test(dl.headers.get('content-disposition')||''),'download serves as attachment');

// backup must still contain bodies
const bk=await j(await fetch(B+'/admin/backup',{headers:H(t)}));
ok(!!bk.data.files['FILE-BIG'].data,'backup still contains the body (nothing lost)');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
