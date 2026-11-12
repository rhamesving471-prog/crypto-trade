const http=require('http'),fs=require('fs'),crypto=require('crypto'),path=require('path');
const PORT=process.env.PORT||3000,KEY=process.env.ADMIN_KEY||crypto.randomBytes(6).toString('hex'),FILE=path.join(__dirname,'state.json');
let S={assets:{ACME:{price:100,hist:[100]},MOON:{price:42,hist:[42]},BYTE:{price:250,hist:[250]}},players:{},auto:false};
try{S=JSON.parse(fs.readFileSync(FILE))}catch(e){}
const save=()=>{try{fs.writeFileSync(FILE,JSON.stringify(S))}catch(e){}};
const push=(k,p)=>{const a=S.assets[k];a.price=p;a.hist=[...a.hist,p].slice(-120)};
setInterval(()=>{if(!S.auto)return;for(const k in S.assets)push(k,Math.max(.01,+(S.assets[k].price*(1+(Math.random()-.5)*.03)).toFixed(2)));save()},3000);
const pub=()=>({assets:S.assets,auto:S.auto,players:Object.fromEntries(Object.entries(S.players).map(([i,p])=>[i,{name:p.name,cash:p.cash,pos:p.pos}]))});
const send=(res,o,c=200)=>{res.writeHead(c,{'content-type':'application/json'});res.end(JSON.stringify(o))};
http.createServer((req,res)=>{
 if(req.method==='GET'&&req.url.split('?')[0]==='/')return fs.createReadStream(path.join(__dirname,'index.html')).pipe(res.writeHead(200,{'content-type':'text/html'})||res);
 if(req.method==='GET'&&req.url==='/api/state')return send(res,{...pub(),admin:req.headers['x-admin']===KEY});
 if(req.method!=='POST')return send(res,{error:'not found'},404);
 let raw='';req.on('data',d=>{raw+=d;if(raw.length>1e4)req.destroy()});
 req.on('end',()=>{let b={};try{b=JSON.parse(raw||'{}')}catch(e){}
  const r=req.url.replace('/api/',''),adm=req.headers['x-admin']===KEY,a=S.assets[b.sym];
  if(r==='join'){const name=String(b.name||'').trim().slice(0,20);if(!name)return send(res,{error:'Name needed'},400);
   const id=crypto.randomBytes(5).toString('hex'),t=crypto.randomBytes(12).toString('hex');S.players[id]={name,cash:10000,pos:{},t};save();return send(res,{id,token:t})}
  if(r==='trade'){const p=S.players[b.id],n=Math.floor(+b.qty);
   if(!p||p.t!==b.token)return send(res,{error:'Rejoin the room'},403);if(!a||!(n>0))return send(res,{error:'Bad order'},400);
   const cost=n*a.price;
   if(b.side==='buy'){if(cost>p.cash)return send(res,{error:'Not enough cash'});p.cash=+(p.cash-cost).toFixed(2);p.pos[b.sym]=(p.pos[b.sym]||0)+n}
   else{if((p.pos[b.sym]||0)<n)return send(res,{error:'You don’t hold that many'});p.cash=+(p.cash+cost).toFixed(2);p.pos[b.sym]-=n;if(!p.pos[b.sym])delete p.pos[b.sym]}
   save();return send(res,{ok:1})}
  if(!adm)return send(res,{error:'Host only'},403);
  if(r==='price'&&a&&+b.price>0)push(b.sym,+(+b.price).toFixed(2));
  else if(r==='nudge'&&a)push(b.sym,Math.max(.01,+(a.price*(1+b.pct/100)).toFixed(2)));
  else if(r==='add'){const k=String(b.sym||'').toUpperCase().slice(0,6);if(k&&+b.price>0&&!S.assets[k])S.assets[k]={price:+b.price,hist:[+b.price]}}
  else if(r==='del'&&a&&Object.keys(S.assets).length>1)delete S.assets[b.sym];
  else if(r==='cash'&&S.players[b.id])S.players[b.id].cash=+b.cash||0;
  else if(r==='clear'&&S.players[b.id])S.players[b.id].pos={};
  else if(r==='kick')delete S.players[b.id];
  else if(r==='auto')S.auto=!!b.on;
  save();send(res,{ok:1})})
}).listen(PORT,()=>console.log('Trading Room on port '+PORT+'\nHost link: /?admin='+KEY+(process.env.ADMIN_KEY?'':'  (set ADMIN_KEY to keep this fixed)')));
