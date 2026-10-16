const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),S=require('../safe-sync.js'),copy=S.clone;
function fixture(){return {config:{startHour:8},team:[{id:'a',name:'Ana',salary:0,rate:0,grid:{w:{'0-8':{p:'school',n:'clase'}}},projects:[{id:'school',name:'Escuela'}],priorities:[]},{id:'b',name:'Bruno',salary:0,rate:0,grid:{},projects:[],priorities:[]}],tasks:[{id:'t',owner:'a',text:'Preparar',done:false}],objectives:[],recurring:[],extraTasks:[],milestones:[],notes:[],meta:{updatedAt:1}};}
let base=S.publicDoc(fixture()),a=copy(base),b=copy(base);
a.team[0].grid.w['0-9']={p:'school',n:'Ana'};b.team[1].grid.w={'1-9':{p:'school',n:'Bruno'}};
let first=S.merge(base,a,base);let second=S.merge(base,b,first.value);assert.equal(second.conflicts.length,0);assert.equal(second.value.team[0].grid.w['0-9'].n,'Ana');assert.equal(second.value.team[1].grid.w['1-9'].n,'Bruno');
b=copy(base);b.team[0].grid.w['1-10']={p:'school',n:'otro día'};second=S.merge(base,b,first.value);assert.equal(second.conflicts.length,0);assert.equal(second.value.team[0].grid.w['0-9'].n,'Ana');
a=copy(base);b=copy(base);a.team[0].grid.w['0-8'].n='cambio A';b.team[0].grid.w['0-8'].n='cambio B';let conflict=S.merge(base,a,b);assert.equal(conflict.conflicts.length,1);assert.equal(conflict.value.team[0].grid.w['0-8'].n,'cambio B');
const decisions={[conflict.conflicts[0].key]:'mine'};assert.equal(S.merge(base,a,b,decisions).value.team[0].grid.w['0-8'].n,'cambio A');
a=copy(base);b=copy(base);a.team[0].grid.w['0-8'].n='nota nueva';b.team[0].grid.w['0-8'].p='other';assert.equal(S.merge(base,a,b).conflicts.length,1);
a=copy(base);b=copy(base);a.tasks=[];b.tasks[0].text='editado';assert.equal(S.merge(base,a,b).conflicts.length,1);
a=copy(base);b=copy(base);a.tasks.push({id:'a-new',owner:'a',text:'nueva A'});b.tasks.push({id:'b-new',owner:'b',text:'nueva B'});assert.equal(S.merge(base,a,b).value.tasks.length,3);
let current=fixture(),backup=fixture();current.team[1].grid.w={'1-9':{p:'school',n:'publicado Bruno'}};current.team[0].priorities=[{id:'new',title:'Prioridad nueva'}];backup.team[0].grid.w['0-8'].n='recuperado Ana';backup.meta.dirtyPeople=['a','b'];backup.ui={person:'b'};
let restored=S.restorePerson(current,backup,'a');assert.deepEqual(restored.team[1],current.team[1]);assert.equal(restored.team[0].priorities[0].id,'new');assert.equal(restored.team[0].grid.w['0-8'].n,'recuperado Ana');assert.deepEqual(restored.meta,current.meta);
backup.team[0].salary=9999;assert.equal(S.restorePerson(current,backup,'a').team[0].salary,0);
assert.ok(S.mergeUnknown(S.publicDoc(backup),S.publicDoc(current)).conflicts.some(c=>c.path[0]==='team'));
const unknownLocal=copy(base),unknownRemote=copy(base);unknownLocal.tasks.push({id:'local-new',owner:'a',text:'local'});unknownRemote.tasks.push({id:'remote-new',owner:'b',text:'remote'});const unknown=S.mergeUnknown(unknownLocal,unknownRemote);assert.equal(unknown.value.tasks.some(x=>x.id==='remote-new'),true);assert.equal(unknown.value.tasks.length,3);assert.equal(unknown.conflicts.length,0);
// Migración antigua: conservar compañeros completos, datos publicados ausentes y
// campos de la misma prioridad; preguntar solo por el bloque/campo coincidente.
let ancient=copy(base),latest=copy(base);ancient.team[1].grid.w={stale:{p:'school',n:'no publicar'}};latest.team[1].grid.w={fresh:{p:'school',n:'compañero reciente'}};
latest.team[0].grid.w['2-20']={p:'school',n:'bloque publicado que falta en la copia vieja'};ancient.team[0].grid.w['0-8'].n='mi corrección';ancient.team[0].grid.w['1-20']={p:'school',n:'nuevo mío'};
ancient.team[0].priorities=[{id:'p',title:'Título local',progress:20}];latest.team[0].priorities=[{id:'p',title:'Título publicado',progress:50,actualHours:2}];
latest.tasks.push({id:'only-server',owner:'a',text:'No eliminar'});ancient.tasks.push({id:'only-local',owner:'a',text:'Añadir'});ancient.tasks.push({id:'peer-stale',owner:'b',text:'No importar'});
let scoped=S.legacyScope(ancient,latest,'a',false),review=S.mergeUnknown(scoped,latest);
assert.deepEqual(review.value.team[1],latest.team[1]);assert.equal(review.value.team[0].grid.w['2-20'].n,latest.team[0].grid.w['2-20'].n);assert.ok(review.value.tasks.some(x=>x.id==='only-server'));assert.ok(review.value.tasks.some(x=>x.id==='only-local'));assert.equal(review.value.tasks.some(x=>x.id==='peer-stale'),false);
assert.ok(review.conflicts.every(c=>c.path.length>3));assert.ok(review.conflicts.some(c=>c.path.at(-1)==='0-8'));assert.ok(review.conflicts.some(c=>c.path.at(-1)==='title'));assert.equal(review.value.team[0].priorities[0].actualHours,2);
const chooseBlock=Object.fromEntries(review.conflicts.map(c=>[c.key,c.path.at(-1)==='0-8'?'mine':'theirs']));let combined=S.mergeUnknown(scoped,latest,chooseBlock).value;
assert.equal(combined.team[0].grid.w['0-8'].n,'mi corrección');assert.equal(combined.team[0].priorities[0].progress,50);assert.equal(combined.team[0].priorities[0].title,'Título publicado');assert.deepEqual(combined.team[1],latest.team[1]);
latest.tasks.push({id:'collision',owner:'b'});ancient.tasks.push({id:'collision',owner:'a'});assert.throws(()=>S.legacyScope(ancient,latest,'a'),/otra persona/);
ancient=copy(base);latest=copy(base);latest.team[0].grid.w['0-8']={p:'school',n:'no borrar'};ancient.team[0].grid.w['0-8']=null;assert.equal(S.mergeUnknown(ancient,latest).value.team[0].grid.w['0-8'].n,'no borrar');
const progressBase=copy(base),progressMine=copy(base),progressRemote=copy(base);
progressBase.team[0].priorities=[{id:'progress',progress:50,done:false}];progressMine.team[0].priorities=[{id:'progress',progress:20,done:false}];progressRemote.team[0].priorities=[{id:'progress',progress:100,done:true}];
for(const merge of [choices=>S.merge(progressBase,progressMine,progressRemote,choices),choices=>S.mergeUnknown(progressMine,progressRemote,choices)]){
  const proposed=merge({});assert.equal(proposed.conflicts.length,1);assert.equal(proposed.conflicts[0].path.at(-1),'progress');
  const chosen=merge({[proposed.conflicts[0].key]:'mine'}).value.team[0].priorities[0];assert.equal(chosen.progress,20);assert.equal(chosen.done,false);
}
backup.tasks=[{id:'t',owner:'b',text:'colisión'}];assert.throws(()=>S.restorePerson(current,backup,'b'),/otra persona/);
backup.milestones=[{id:'h',ownerId:'a',title:'Entrega recuperada'}];current.milestones=[{id:'hb',ownerId:'b',title:'Entrega de Bruno'}];
assert.deepEqual(S.restorePerson(current,backup,'a').milestones.map(x=>x.id),['hb','h']);
backup.milestones=[{id:'hb',ownerId:'a',title:'Colisión de responsables'}];assert.throws(()=>S.restorePerson(current,backup,'a'),/otra persona/);
const cache=new Map();let published=fixture(),sha=1,commits=0,reads=0,release=0,readFails=false,mutation=null;
const ctx=vm.createContext({console,Date,Math,JSON,Object,Array,SafeSync:S,_get:(k,d)=>k==='PUBLISH_KEY'?'test-key':d,
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>release++})},
  _json:()=>({}),_setJson(){},_backupToDrive(){},_savePublishStatus:(id,result)=>cache.set('publish_'+id,JSON.stringify(result))});
vm.runInContext(fs.readFileSync(path.join(root,'apps-script','SafePublish.gs'),'utf8'),ctx);
ctx._safeReadCurrent=()=>{reads++;if(readFails)throw Error('offline');return {state:copy(published),sha:String(sha)};};
ctx._safeCommit=(state,expected)=>{if(mutation){mutation();mutation=null;}if(expected!==String(sha))return {retry:true};published=copy(state);sha++;commits++;return {ok:true,sha:String(sha),updatedAt:state.meta.updatedAt};};
function post(doc,baseDoc,id){ctx.body={publishKey:'test-key',requestId:id.repeat(32),state:doc,base:baseDoc};return vm.runInContext('_safePublish(body)',ctx);}
published=fixture();let origin=S.publicDoc(published),mine=copy(origin);mine.team[0].priorities.push({id:'r',title:'Recuperado'});
mutation=()=>{published.team[1].grid.w={'2-8':{n:'publicado mientras tanto'}};sha++;};let result=post(mine,origin,'r');assert.equal(result.ok,true);assert.equal(published.team[1].grid.w['2-8'].n,'publicado mientras tanto');assert.equal(published.team[0].priorities[0].id,'r');assert.equal(commits,1);
let before=commits;assert.equal(post(mine,origin,'r').ok,true);assert.equal(commits,before);
cache.clear();assert.equal(post(mine,origin,'r').alreadyCommitted,true);assert.equal(commits,before);
origin=S.publicDoc(published);mine=copy(origin);mine.team[0].grid.w['0-8'].n='local';published.team[0].grid.w['0-8'].n='otro';sha++;assert.equal(post(mine,origin,'s').code,'CONFLICT');assert.equal(commits,before);
readFails=true;assert.equal(post(mine,origin,'z').ok,false);assert.equal(commits,before);readFails=false;
ctx.body={publishKey:'test-key',requestId:'q'.repeat(32),state:mine};assert.equal(vm.runInContext('_safePublish(body)',ctx).ok,false);assert.equal(commits,before);
assert.ok(release>=5);
console.log('OK: personas/días/tareas concurrentes, conflicto del mismo dato, recuperación por persona, no heredar marcas, escritura con SHA, reintento idempotente y bloqueo sin lectura/base.');
