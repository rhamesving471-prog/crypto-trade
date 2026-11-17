const http=require('http'),fs=require('fs'),crypto=require('crypto'),path=require('path');
const PORT=process.env.PORT||3000,KEY=process.env.ADMIN_KEY||crypto.randomBytes(6).toString('hex'),FILE=path.join(__dirname,'state.json'),B=10000,N=240;
const bk=()=>Math.floor(Date.now()/B)*B;
const rd=p=>+p.toFixed(p>=10?2:4);
const COINS={BTC:65000,ETH:3200,SOL:150,BNB:600,XRP:0.55,ADA:0.45,AVAX:35,DOT:7,LTC:80};
function mk(price,n=N,t0=bk()){let p=price,c=[];const t=t0;for(let i=0;i<n;i++){const cl=p,o=rd(cl/(1+(Math.random()-.5)*.012));c.unshift({t:t-i*B,o,h:rd(Math.max(o,cl)*(1+Math.random()*.004)),l:rd(Math.min(o,cl)*(1-Math.random()*.004)),c:cl,v:Math.round(20+Math.random()*80)});p=o}return{price,trend:0,c}}
let S={assets:Object.fromEntries(Object.entries(COINS).map(([k,v])=>[k,mk(v)])),players:{},auto:false};
try{S=JSON.parse(fs.readFileSync(FILE))}catch(e){}
function migrate(){
S.sv=S.sv||{number:'',date:'2026-12-25',log:[]};S.round=S.round||{end:0,done:false,winner:null};
if(!S.v2){S.startCash=5;S.v2=1}S.startCash=S.startCash??5;
for(const k in S.assets){const a=S.assets[k];if(!a.c)a.c=mk(a.price).c;a.trend=a.trend||0;delete a.hist;if(a.c.length<N)a.c=mk(a.c[0].o,N-a.c.length,a.c[0].t-B).c.concat(a.c)}
S.tape=S.tape||[];
if(!S.v3){for(const o of ['ACME','MOON','BYTE']){const a=S.assets[o];if(!a)continue;for(const p of Object.values(S.players)){const q=p.pos&&p.pos[o];if(q){p.cash=+(p.cash+q*a.price).toFixed(4);delete p.pos[o]}}delete S.assets[o]}
 for(const k in COINS)if(!S.assets[k])S.assets[k]=mk(COINS[k]);S.v3=1}
}
migrate();
const eqOf=p=>{let t=p.cash;for(const k in p.pos)if(S.assets[k])t+=p.pos[k]*S.assets[k].price;return t};
const finish=()=>{let best=null;for(const p of Object.values(S.players)){const e=eqOf(p);if(!best||e>best.eq)best={name:p.name,eq:+e.toFixed(4)}}S.round.done=true;S.round.winner=best};
const lsave=()=>{try{fs.writeFileSync(FILE,JSON.stringify(S))}catch(e){}};
const RU=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,''),RT=process.env.UPSTASH_REDIS_REST_TOKEN||'',RK='trading-room-v1';let dirty=false,blocked=false;
const save=()=>{dirty=true;lsave()};
async function rload(){if(!RU)return null;for(let i=0;i<3;i++){try{const r=await fetch(RU+'/get/'+RK,{headers:{Authorization:'Bearer '+RT}});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();return j.result?JSON.parse(j.result):null}catch(e){console.log('Could not load saved data ('+e.message+'), try '+(i+1))}await new Promise(z=>setTimeout(z,1000))}blocked=true;console.log('WARNING: saving is switched off so old data is not overwritten. Check the Upstash settings.');return null}
async function rsave(){if(!RU||!dirty||blocked)return;dirty=false;try{const slim={...S,tape:undefined,assets:Object.fromEntries(Object.entries(S.assets).map(([k,a])=>[k,{price:a.price,trend:a.trend}]))};const r=await fetch(RU+'/set/'+RK,{method:'POST',headers:{Authorization:'Bearer '+RT},body:JSON.stringify(slim)});if(!r.ok)throw new Error('HTTP '+r.status)}catch(e){dirty=true;console.log('Save failed: '+e.message)}}
setInterval(rsave,5000);setInterval(()=>{dirty=true},300000);
process.on('SIGTERM',async()=>{dirty=true;await rsave();process.exit(0)});
const push=(k,p,v=0)=>{const a=S.assets[k],t=bk(),l=a.c[a.c.length-1];p=rd(p);const o=l?l.c:p;
 if(l&&l.t===t){l.h=Math.max(l.h,p);l.l=Math.min(l.l,p);l.c=p;l.v+=v}else a.c.push({t,o,h:Math.max(o,p),l:Math.min(o,p),c:p,v});
 a.c=a.c.slice(-N);a.price=p};
setInterval(()=>{for(const k in S.assets){const a=S.assets[k],live=a.trend||S.auto;push(k,Math.max(.0001,a.price*(1+a.trend/100+(live?(Math.random()-.5)*.008:0))),live?Math.round(Math.random()*10):0)}if(S.round.end&&!S.round.done&&Date.now()>=S.round.end)finish();lsave()},2000);
const hp=(pw,salt)=>crypto.scryptSync(pw,salt,32);
const mkpw=pw=>{const salt=crypto.randomBytes(8).toString('hex');return{salt,hash:hp(pw,salt).toString('hex')}};
const okpw=(p,pw)=>!!(p.hash&&p.salt&&crypto.timingSafeEqual(hp(pw,p.salt),Buffer.from(p.hash,'hex')));
const uname=u=>String(u||'').toLowerCase().trim(),UOK=/^[a-z0-9_]{3,20}$/,taken=u=>Object.values(S.players).some(p=>p.user===u);
const fails={},locked=u=>fails[u]&&fails[u].n>=8&&Date.now()-fails[u].t<6e5;
const bad=u=>{const f=fails[u];fails[u]=f&&Date.now()-f.t<6e5?{n:f.n+1,t:Date.now()}:{n:1,t:Date.now()}};
const svTot=id=>+S.sv.log.filter(e=>e.pid===id).reduce((t,e)=>t+(e.type==='deposit'?e.amt:-e.amt),0).toFixed(2);
const who=req=>{const p=S.players[req.headers['x-id']];return p&&p.t===req.headers['x-token']?req.headers['x-id']:null};
const pl=(id,p)=>({name:p.name,cash:p.cash,pos:p.pos,saved:svTot(id),user:p.user||'',avg:p.avg||{}});
const pub=(adm,id,sym)=>({tape:(S.tape||[]).filter(t=>t.sym===sym).slice(-20),assets:Object.fromEntries(Object.entries(S.assets).map(([k,a])=>[k,k===sym?a:{price:a.price,trend:a.trend,c:a.c.slice(-1)}])),auto:S.auto,startCash:S.startCash,round:{active:!!S.round.end&&!S.round.done,done:S.round.done,winner:S.round.winner?{name:S.round.winner.name}:null,left:Math.max(0,S.round.end-Date.now())},players:adm?Object.fromEntries(Object.entries(S.players).map(([i,p])=>[i,pl(i,p)])):(id?{[id]:pl(id,S.players[id])}:{}),savings:{number:(adm||S.sv.show)?S.sv.number:'',show:!!S.sv.show,date:S.sv.date,log:adm?S.sv.log:S.sv.log.filter(e=>e.pid===id),total:adm?+S.sv.log.reduce((t,e)=>t+(e.type==='deposit'?e.amt:-e.amt),0).toFixed(2):undefined}});
const zlib=require('zlib');
const sendz=(req,res,o)=>{const b=Buffer.from(JSON.stringify(o));if(/gzip/.test(req.headers['accept-encoding']||'')){res.writeHead(200,{'content-type':'application/json','content-encoding':'gzip'});res.end(zlib.gzipSync(b))}else{res.writeHead(200,{'content-type':'application/json'});res.end(b)}};
const send=(res,o,c=200)=>{res.writeHead(c,{'content-type':'application/json'});res.end(JSON.stringify(o))};
const srv=http.createServer((req,res)=>{
 if(req.method==='GET'&&req.url==='/ping'){res.writeHead(200);return res.end('ok')}
 if(req.method==='GET'&&req.url.split('?')[0]==='/'){res.writeHead(200,{'content-type':'text/html'});return fs.createReadStream(path.join(__dirname,'index.html')).pipe(res)}
 if(req.method==='GET'&&req.url.startsWith('/api/state')){const adm=req.headers['x-admin']===KEY;return sendz(req,res,{...pub(adm,who(req),new URL(req.url,'http://x').searchParams.get('sym')),admin:adm,persist:!!RU})};
 if(req.method!=='POST')return send(res,{error:'not found'},404);
 let raw='';req.on('data',d=>{raw+=d;if(raw.length>1e4)req.destroy()});
 req.on('end',()=>{let b={};try{b=JSON.parse(raw||'{}')}catch(e){}
  const r=req.url.replace('/api/',''),adm=req.headers['x-admin']===KEY,a=S.assets[b.sym];
  if(r==='register'){const u=uname(b.username),pw=String(b.password||'');
   if(!UOK.test(u))return send(res,{error:'Username: 3 to 20 letters, numbers or _'});
   if(pw.length<6||pw.length>100)return send(res,{error:'Password needs 6 or more characters'});
   if(taken(u))return send(res,{error:'That username is taken'});
   if(Object.keys(S.players).length>=100)return send(res,{error:'The room is full'});
   const id=crypto.randomBytes(5).toString('hex'),t=crypto.randomBytes(12).toString('hex');
   S.players[id]={name:u,user:u,...mkpw(pw),cash:S.startCash,pos:{},t};save();return send(res,{id,token:t})}
  if(r==='login'){const u=uname(b.username);if(locked(u))return send(res,{error:'Too many tries. Wait 10 minutes.'});
   const e=Object.entries(S.players).find(([i,p])=>p.user===u);
   if(!e||!okpw(e[1],String(b.password||''))){bad(u);return send(res,{error:'Wrong username or password'})}
   delete fails[u];return send(res,{id:e[0],token:e[1].t})}
  if(r==='setlogin'){const p=S.players[b.id],u=uname(b.username),pw=String(b.password||'');
   if(!p||p.t!==b.token)return send(res,{error:'Please sign in again'},403);if(p.user)return send(res,{error:'You already have a login'});
   if(!UOK.test(u))return send(res,{error:'Username: 3 to 20 letters, numbers or _'});
   if(pw.length<6||pw.length>100)return send(res,{error:'Password needs 6 or more characters'});
   if(taken(u))return send(res,{error:'That username is taken'});
   Object.assign(p,{user:u},mkpw(pw));save();return send(res,{ok:1})}
  if(r==='trade'){const p=S.players[b.id],n=+(+b.qty).toFixed(8);
   if(!p||p.t!==b.token)return send(res,{error:'Please sign in again'},403);if(S.round.done)return send(res,{error:'The round is over'});if(!a||!(n>0))return send(res,{error:'Bad order'},400);
   const cost=n*a.price;if(cost<0.01&&!(b.side==='sell'&&n>=(p.pos[b.sym]||0)-1e-9))return send(res,{error:'Minimum order is $0.01'});
   if(b.side==='buy'){if(cost>p.cash+1e-9)return send(res,{error:'Not enough cash'});p.cash=Math.max(0,+(p.cash-cost).toFixed(4));{const q0=p.pos[b.sym]||0;p.avg=p.avg||{};const a0=p.avg[b.sym]||a.price;p.avg[b.sym]=+((q0*a0+n*a.price)/(q0+n)).toPrecision(8)}p.pos[b.sym]=+((p.pos[b.sym]||0)+n).toFixed(8)}
   else{if((p.pos[b.sym]||0)<n-1e-9)return send(res,{error:'You don’t hold that many'});p.cash=+(p.cash+cost).toFixed(4);p.pos[b.sym]=+((p.pos[b.sym]||0)-n).toFixed(8);if(p.pos[b.sym]<=0){delete p.pos[b.sym];if(p.avg)delete p.avg[b.sym]}}
   a.c[a.c.length-1].v+=n;S.tape.push({t:Date.now(),sym:b.sym,side:b.side,price:a.price,qty:n});S.tape=S.tape.slice(-80);save();return send(res,{ok:1})}
  if(!adm)return send(res,{error:'Host only'},403);
  if(r==='price'&&a&&+b.price>0)push(b.sym,+b.price);
  else if(r==='nudge'&&a)push(b.sym,Math.max(.0001,a.price*(1+b.pct/100)),30);
  else if(r==='trend'&&a)a.trend=+b.pct||0;
  else if(r==='add'){const k=String(b.sym||'').toUpperCase().slice(0,6);if(k&&+b.price>0&&!S.assets[k])S.assets[k]=mk(+b.price)}
  else if(r==='del'&&a&&Object.keys(S.assets).length>1)delete S.assets[b.sym];
  else if(r==='cash'&&S.players[b.id])S.players[b.id].cash=+b.cash||0;
  else if(r==='clear'&&S.players[b.id]){S.players[b.id].pos={};S.players[b.id].avg={}}
  else if(r==='kick')delete S.players[b.id];
  else if(r==='savecfg'){S.sv.number=String(b.number||'').slice(0,40);if(/^\d{4}-\d{2}-\d{2}$/.test(b.date||''))S.sv.date=b.date}
  else if(r==='sdeposit'||r==='swithdraw'){const p=S.players[b.id],amt=+b.amt;if(!p||!(amt>0)||amt>1e9)return send(res,{error:'Pick a player and enter an amount'});
   if(r==='swithdraw'){if(Date.now()<new Date(S.sv.date+'T00:00:00+03:00'))return send(res,{error:'Withdrawals open on '+S.sv.date});if(amt>svTot(b.id))return send(res,{error:'That is more than their saved total'})}
   S.sv.log.push({lid:crypto.randomBytes(4).toString('hex'),pid:b.id,name:p.name,type:r==='sdeposit'?'deposit':'withdraw',amt:+amt.toFixed(2),code:String(b.code||'').slice(0,20),t:Date.now()})}
  else if(r==='sdel')S.sv.log=S.sv.log.filter(e=>e.lid!==b.lid);
  else if(r==='topup'&&S.players[b.id]&&+b.amt>0)S.players[b.id].cash=+(S.players[b.id].cash+ +b.amt).toFixed(2);
  else if(r==='startcash'&&+b.amt>=0&&+b.amt<=1e6)S.startCash=+(+b.amt).toFixed(2);
  else if(r==='resetpw'){const p=S.players[b.id],pw=String(b.password||'');if(!p)return send(res,{error:'No such player'});if(pw.length<6)return send(res,{error:'Password needs 6 or more characters'});
   if(!p.user){const u=uname(b.username);if(!UOK.test(u)||taken(u))return send(res,{error:'Pick a free username (3 to 20 letters, numbers or _)'});p.user=u}
   Object.assign(p,mkpw(pw));p.t=crypto.randomBytes(12).toString('hex');delete fails[p.user]}
  else if(r==='roundstart')S.round={end:Date.now()+Math.min(1440,Math.max(.1,+b.min||10))*60000,done:false,winner:null};
  else if(r==='roundend'){if(S.round.end&&!S.round.done)finish()}
  else if(r==='roundreset')S.round={end:0,done:false,winner:null};
  else if(r==='svshow')S.sv.show=!!b.on;
  else if(r==='auto')S.auto=!!b.on;
  save();send(res,{ok:1})})
});
rload().then(r=>{if(r){S=r;migrate();console.log('Loaded saved data')}
 srv.listen(PORT,()=>{console.log('Trading Room on port '+PORT+(RU?' (saving to Upstash)':' (WARNING: no permanent storage)'));
  if(process.env.RENDER_EXTERNAL_URL)setInterval(()=>{fetch(process.env.RENDER_EXTERNAL_URL+'/ping').catch(()=>{})},10*60*1000)})});
