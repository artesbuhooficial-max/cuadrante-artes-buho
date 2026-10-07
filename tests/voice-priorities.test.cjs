const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const els=new Map(),storage=new Map();
function el(id){if(!els.has(id))els.set(id,{value:'',textContent:'',hidden:false,disabled:false,classList:{toggle(){}},setAttribute(){},focus(){},innerHTML:''});return els.get(id);}
const p={id:'u1',name:'David',priorities:[]};let saved=0,dirty=0,aborted=0,started=0;
class Recognition{start(){started++;this.onstart();}stop(){this.onend();}abort(){aborted++;}}
const ctx=vm.createContext({console,Date,Set,Map,window:{SpeechRecognition:Recognition},
  document:{getElementById:el,querySelectorAll:()=>rows},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  state:{team:[p],ui:{weekId:'2026-10-05'}},person:id=>id==='u1'?p:null,
  parseId:s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);},
  dStr:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
  mondayOf:d=>{d=new Date(d);d.setDate(d.getDate()-(d.getDay()+6)%7);return d;},
  addDays:(d,n)=>{d=new Date(d);d.setDate(d.getDate()+n);return d;},
  uid:()=>`v${p.priorities.length}`,prioritiesForDay:(person,date)=>person.priorities.filter(x=>x.date===date),markDirty:()=>dirty++,save:()=>saved++,renderPriorityBoard(){},toast(){}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','voice-priorities.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx),parse=s=>JSON.parse(JSON.stringify(run(`voiceParseDays(${JSON.stringify(s)},'2026-10-07','2026-10-05')`)));
assert.deepEqual(parse('el lunes preparé la campaña; el martes llamé a proveedores'),[{date:'2026-10-05',text:'preparé la campaña'},{date:'2026-10-06',text:'llamé a proveedores'}]);
assert.equal(parse('próximo lunes cerrar campaña')[0].date,'2026-10-12');
assert.equal(parse('El miércoles hice fotos')[0].date,'2026-10-07');
assert.equal(parse('El sábado revisar agenda')[0].date,'2026-10-10');
assert.equal(parse('Preparar reunión')[0].date,'2026-10-07');assert.equal(parse('   ').length,0);
assert.equal(run("voiceParseDays('próximo lunes plan anual','2026-12-28','2026-12-28')[0].date"),'2027-01-04');
el('voiceText').value='Texto anterior';el('voiceOwner').value='u1';el('voiceDate').value='2026-10-07';
assert.equal(started,0);run('voiceStart()');assert.equal(started,1);assert.equal(run('voiceListening'),true);
const result=(text,final)=>Object.assign([{transcript:text}],{isFinal:final});ctx.event={results:[result('el lunes campaña',true),result('el martes',false)]};
run('voiceCapture.onresult(event);voiceCapture.onresult(event)');assert.equal(el('voiceText').value,'Texto anterior el lunes campaña');assert.equal(saved,0);
assert.equal(el('voiceInterim').textContent,'el martes');assert.ok(storage.has('cuadrante_voice_draft_v1'));
run("voiceCapture.onerror({error:'not-allowed'});voiceCapture.onend()");assert.equal(run('voiceListening'),false);assert.ok(el('voiceStatus').textContent.includes('denegado'));
run('voiceClose()');assert.equal(aborted,1);assert.equal(el('voicePanel').hidden,true);
let rows=[{querySelector:s=>({value:s==='input'?'2026-10-06':'Llamé a proveedores'})}];
run('voicePlan=[{date:"2026-10-06",text:"Llamé a proveedores"}];voiceCommit()');
assert.equal(p.priorities.length,1);assert.equal(p.priorities[0].date,'2026-10-06');assert.equal(saved,1);assert.equal(dirty,1);
run('voiceCommit()');assert.equal(p.priorities.length,1);
console.log('OK: reparto por días, cierre de año, micrófono explícito, resultados sin duplicados, borrador, errores, cierre y guardado único.');
