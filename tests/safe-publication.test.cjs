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
const unknownLocal=copy(base),unknownRemote=copy(base);unknownLocal.tasks.push({id:'local-new',owner:'a',text:'local'});unknownRemote.tasks.push({id:'remote-new',owner:'b',text:'remote'});const unknown=S.mergeUnknown(unknownLocal,unknownRemote);assert.equal(unknown.value.tasks.some(x=>x.id==='remote-new'),true);const recoverChoices={[unknown.conflicts.find(x=>x.path[1]==='@local-new').key]:'mine'};assert.equal(S.mergeUnknown(unknownLocal,unknownRemote,recoverChoices).value.tasks.length,3);
backup.tasks=[{id:'t',owner:'b',text:'colisión'}];assert.throws(()=>S.restorePerson(current,backup,'b'),/otra persona/);
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
