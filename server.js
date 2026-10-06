const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,ADMIN=process.env.ADMIN_PASS||'1224',F=path.join(__dirname,'data.json');
let db={users:{},settings:{taxPercent:5,debtLimit:1000,nextTax:Date.now()+864e5}};
try{db=JSON.parse(fs.readFileSync(F))}catch{}
db.tx=db.tx||[];const log=(from,to,amt,note)=>{db.tx.push({t:Date.now(),from,to,amt,note:(note||'').slice(0,60)});if(db.tx.length>500)db.tx.shift()};
const save=()=>fs.writeFileSync(F,JSON.stringify(db)),sess={},clients=new Set();
const push=()=>clients.forEach(r=>r.write('data: u\n\n'));
const tax=()=>{const p=db.settings.taxPercent;for(const [k,u] of Object.entries(db.users))if(u.balance>0){const n=Math.floor(u.balance*(100-p)/100);log(k,'ТАТВАР',u.balance-n,'Өдөр тутмын татвар '+p+'%');u.balance=n}db.settings.nextTax=Date.now()+864e5;save();push()};
setInterval(()=>{if(Date.now()>=db.settings.nextTax)tax()},3e4);
const nameOk=n=>/^[A-Za-z0-9_]{2,16}$/.test(n||''),pwOk=x=>/^[A-Za-z0-9]{4,8}$/.test(x||'');
http.createServer((q,s)=>{
const p=new URL(q.url,'http://x').pathname;
const send=(c,o)=>{s.writeHead(c,{'Content-Type':'application/json'});s.end(JSON.stringify(o))};
if(!p.startsWith('/api/')){const f=p==='/'?'index.html':p.slice(1),fp=path.join(__dirname,f);
 if(!/^[\w.-]+\.html$/.test(f)||!fs.existsSync(fp)){s.writeHead(404);return s.end('404')}
 s.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return s.end(fs.readFileSync(fp))}
if(p==='/api/events'){s.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});s.write('\n');clients.add(s);q.on('close',()=>clients.delete(s));return}
let b='';q.on('data',d=>b+=d);q.on('end',()=>{
let j={};try{j=JSON.parse(b||'{}')}catch{}
const U=db.users,me=sess[q.headers['x-token']],E=m=>send(400,{error:m}),done=()=>{save();push();send(200,{ok:1})};
if(p.startsWith('/api/admin/')&&q.headers['x-admin']!==ADMIN)return send(401,{error:'Админ нууц үг буруу'});
const t=U[j.name];
switch(p){
case '/api/signup':
 if(!nameOk(j.name))return E('Ner 2-16 useg/too baih ystoi');
 if(!pwOk(j.password))return E('Password 4-8 useg/too baih ystoi');
 if(U[j.name])return E('Ene ner avsan baina');
 U[j.name]={password:j.password,balance:0};{const k=crypto.randomUUID();sess[k]=j.name;save();push();return send(200,{token:k})}
case '/api/login':{const u=U[j.name];if(!u||u.password!==j.password)return send(401,{error:'Incorrect'});
 const k=crypto.randomUUID();sess[k]=j.name;return send(200,{token:k})}
case '/api/me':if(!me||!U[me])return send(401,{error:'login'});return send(200,{name:me,balance:U[me].balance,...db.settings,history:db.tx.filter(x=>x.from===me||x.to===me).slice(-15).reverse()});
case '/api/users':if(!me)return send(401,{error:'login'});return send(200,Object.keys(U).map(name=>({name})));
case '/api/transfer':{const a=parseInt(j.amount),r=U[j.to];
 if(!me||!U[me])return send(401,{error:'login'});
 if(!r||j.to===me)return E('Хүлээн авагч олдсонгүй');if(!(a>0))return E('Дүн буруу байна');
 if(U[me].balance-a<-db.settings.debtLimit)return E('Зээлийн хязгаар -'+db.settings.debtLimit+' ₮ байна');
 U[me].balance-=a;r.balance+=a;log(me,j.to,a,j.note);return done()}
case '/api/admin/users':return send(200,{settings:db.settings,tx:db.tx.slice(-30).reverse(),users:Object.entries(U).map(([name,u])=>({name,...u}))});
case '/api/admin/save':{if(!t)return E('Хэрэглэгч олдсонгүй');
 if(j.password&&!pwOk(j.password))return E('Нууц үг 4-8 тэмдэгт');
 if(j.password)t.password=j.password;
 if(j.newName&&j.newName!==j.name){if(!nameOk(j.newName)||U[j.newName])return E('Нэр буруу эсвэл давхардсан');
  U[j.newName]=t;delete U[j.name];for(const k in sess)if(sess[k]===j.name)sess[k]=j.newName}
 return done()}
case '/api/admin/money':if(!t||!Number.isFinite(+j.delta))return E('Буруу');{const d=Math.trunc(+j.delta);t.balance+=d;log(d>0?'АДМИН':j.name,d>0?j.name:'АДМИН',Math.abs(d),'Админ засвар')}return done();
case '/api/admin/clearDebt':if(j.name){if(!t)return E('Хэрэглэгч олдсонгүй');if(t.balance<0)t.balance=0}else for(const u of Object.values(U))if(u.balance<0)u.balance=0;return done();
case '/api/admin/delete':if(!t)return E('Хэрэглэгч олдсонгүй');delete U[j.name];return done();
case '/api/admin/settings':db.settings.taxPercent=Math.min(100,Math.max(0,+j.taxPercent||0));db.settings.debtLimit=Math.max(0,+j.debtLimit||0);return done();
case '/api/admin/taxnow':tax();return send(200,{ok:1});
}
send(404,{error:'404'})})}).listen(PORT,()=>console.log('http://localhost:'+PORT));
