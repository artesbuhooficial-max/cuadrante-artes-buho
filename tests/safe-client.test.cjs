const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),store=new Map(),session=new Map(),el={innerHTML:'',disabled:false,textContent:'',dataset:{}};
const context=vm.createContext({console,Date,Math,JSON,Set,Map,AbortController,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},window:{},document:{addEventListener(){},getElementById:()=>el}});
const run=s=>vm.runInContext(s,context);
run(fs.readFileSync(path.join(root,'priorities-report.js'),'utf8'));
run(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]);
run(fs.readFileSync(path.join(root,'safe-sync.js'),'utf8'));run(fs.readFileSync(path.join(root,'app-stability.js'),'utf8'));run(fs.readFileSync(path.join(root,'publication-safe.js'),'utf8'));
run("migrate=function(){};loadPins=function(){};adoptAppsUrl=function(){};initializePriorityReport=function(){};initializeVoicePriorities=function(){};initFile=async function(){};switchTab=function(){storeSet(state)};render=function(){};toast=function(t){window.lastToast=t};updateSaveUI=function(){};");
function fixture(){return {config:{},team:[{id:'a',name:'Ana',grid:{},projects:[],priorities:[],salary:0,rate:0},{id:'b',name:'Bruno',grid:{},projects:[],priorities:[],salary:0,rate:0}],tasks:[],objectives:[],notes:[],extraTasks:[],recurring:[],milestones:[],ui:{person:'a',tab:'cuadrante'},meta:{updatedAt:1}};}
const S=require('../safe-sync.js'),clone=S.clone;let remote=fixture(),posted=[],confirmed=true;
context.safeReadRemote=async()=>({ok:true,protocol:2,state:clone(remote),sha:'s'});
context.askPublishKey=async()=> 'test-key';
context.safeWaitPublish=async()=>{if(!confirmed)throw Error('response lost');return {ok:true,updatedAt:10};};
context.fetch=async(url,options)=>{const payload=JSON.parse(options.body);posted.push(payload);remote=S.merge(payload.base,S.publicDoc(payload.state),S.publicDoc(remote)).value;remote.meta={updatedAt:10};remote.ui={person:'a',tab:'cuadrante'};run("state.tasks.push({id:'during',owner:'a',text:'Editada mientras publicaba'})");return {};};
async function main(){
  context.oldBackup={config:{},ui:{weekId:'2026-10-05'},team:[{id:'a',grid:{'0-9':{p:'school'}},projects:[],priorities:[]}]};assert.equal(run('Object.keys(safeNormalizeBackup(oldBackup).team[0].grid["2026-10-05"]).length'),2);
  let initial=fixture(),local=clone(initial);local.tasks.push({id:'local',owner:'a',text:'sin publicar'});remote=clone(initial);remote.team[1].grid.w={'0-9':{n:'trabajo Bruno'}};
  store.set('cuadrante_artesbuho_v2',JSON.stringify(local));session.set('cuadrante_safe_base_v2',JSON.stringify(S.publicDoc(initial)));
  await run('boot()');assert.equal(run('state.tasks[0].id'),'local');assert.equal(run("state.team[1].grid.w['0-9'].n"),'trabajo Bruno');
  await run('publishViaAppsScript()');assert.equal(posted.length,1);assert.equal(posted[0].action,'publish2');assert.equal(run('state.tasks.length'),2);assert.equal(run('state.tasks.some(x=>x.id==="during")'),true);assert.equal(session.has('cuadrante_safe_pending_v2'),false);
  run("state.tasks.push({id:'before-refresh',owner:'a',text:'Enviar'})");let reads=0;
  context.safeReadRemote=async()=>{if(++reads===2)run("state.tasks.push({id:'during-refresh',owner:'a',text:'Escrita mientras se refresca'})");return {state:clone(remote)};};
  context.fetch=async(url,options)=>{posted.push(JSON.parse(options.body));return {};};
  await run('publishViaAppsScript()');assert.equal(run('state.tasks.some(x=>x.id==="during-refresh")'),true);
  context.safeReadRemote=async()=>({state:clone(remote)});
  confirmed=false;run("state.tasks.push({id:'lost-response',text:'no confirmada',owner:'a'})");await run('publishViaAppsScript()');const firstId=posted.at(-1).requestId;assert.ok(session.has('cuadrante_safe_pending_v2'));
  context.fetch=async(url,options)=>{posted.push(JSON.parse(options.body));return {};};confirmed=true;await run('publishViaAppsScript()');assert.equal(posted.at(-1).requestId,firstId);assert.equal(session.has('cuadrante_safe_pending_v2'),false);
  session.clear();local=fixture();local.tasks.push({id:'old',text:'copia vieja'});store.set('cuadrante_artesbuho_v2',JSON.stringify(local));store.delete('cuadrante_safe_base_v2');await run('boot()');assert.equal(run('state.tasks[0].id'),'old');assert.equal(run('safeBase'),null);
  // El CDN desactualizado no rebaja una base que ya se confirmó en el servidor.
  store.set('cuadrante_safe_base_v2',JSON.stringify(S.publicDoc(local)));context.safeReadRemote=async()=>{throw Error('offline')};
  // safeOriginalFetch es const: el fetch original devuelve null con este simulador.
  context.fetch=async()=>{throw Error('offline')};await run('boot()');assert.equal(run('state.tasks[0].id'),'old');
  store.set('cuadrante_artesbuho_v2',JSON.stringify(fixture()));await run('boot()');assert.equal(run('state.tasks[0].id'),'old');
  // Un borrador local que no corresponde al paquete atómico no hereda la base
  // de otra pestaña: obliga a la recuperación acotada en vez de simular borrados.
  session.clear();const mismatched=fixture();mismatched.tasks.push({id:'unpaired',text:'otra copia'});store.set('cuadrante_artesbuho_v2',JSON.stringify(mismatched));await run('boot()');assert.equal(run('safeBase'),null);assert.equal(run('state.tasks[0].id'),'unpaired');
  console.log('OK: recarga conserva pendientes, combina otros miembros, conserva ediciones durante envío, reintenta el mismo ID y migración sin sustitución silenciosa.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
