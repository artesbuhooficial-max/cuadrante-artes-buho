const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {join}=require('node:path');
const root=join(__dirname,'..'),host={innerHTML:''};
const context=vm.createContext({console,Date,Map,Set,Math,Number,String,Array,JSON,parseInt,parseFloat,
  setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},
  window:{},document:{addEventListener:()=>{},getElementById:()=>host}});
vm.runInContext(readFileSync(join(root,'priorities-report.js'),'utf8'),context);
const app=readFileSync(join(root,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInContext(app.replace(/boot\(\);\s*$/,''),context);
vm.runInContext(`
state={ui:{weekId:'2026-10-05',person:'a'},config:{granularity:'half'},team:[
 {id:'a',name:'David',projects:[{id:'p',name:'Escuela',color:'#123456'}],grid:{'2026-10-05':{'0-18':{p:'p',n:'Preparar clase'}}},priorities:[
  {id:'1',date:'2026-10-05',title:'Primera acción',progress:50,estimatedHours:2,actualHours:1,workNotes:'<script>nota</script>'},
  {id:'2',date:'2026-10-12',title:'Lunes de cierre',done:true,estimatedHours:1,actualHours:0}]},
 {id:'b',name:'Bruno',projects:[],grid:{},priorities:[{id:'3',date:'2026-10-06',title:'Segunda acción',progress:0}]}
]};`,context);
const evaluate=expression=>vm.runInContext(expression,context);
assert.equal(evaluate('priorityScope'),'person');
evaluate("state.ui.person='b';initializePriorityReport()");
assert.equal(evaluate('state.ui.person'),'a');
evaluate('renderPriorityBoard()');assert.ok(!host.innerHTML.includes('Bruno'));
assert.ok(!host.innerHTML.split('class="pr-summary"')[0].includes('Ver todo el equipo'));
assert.ok(host.innerHTML.includes('class="pr-other-views"'));
evaluate("priorityScope='team'");
assert.equal(evaluate('priorityReportDays().length'),8);
assert.equal(evaluate('priorityReportDays()[7]'),'2026-10-12');
const metrics=evaluate('priorityReportMetrics(priorityReportPeople(),priorityReportDays())');
assert.equal(metrics.count,3);assert.equal(metrics.done,1);assert.equal(metrics.pct,50);
assert.equal(metrics.tracked,2);assert.equal(metrics.actual,1);assert.equal(metrics.grid,.5);
evaluate('renderPriorityBoard()');
assert.equal((host.innerHTML.match(/class="pr-day"/g)||[]).length,8);
assert.ok(host.innerHTML.includes('Bruno'));assert.ok(host.innerHTML.includes('Lunes de cierre'));
assert.ok(host.innerHTML.includes('&lt;script&gt;nota&lt;/script&gt;'));
assert.ok(host.innerHTML.includes('Sin registrar'));assert.ok(host.innerHTML.includes('0 min'));
assert.ok(host.innerHTML.includes('Preparar clase'));assert.ok(!host.innerHTML.includes('<script>nota'));
evaluate("priorityScope='person';renderPriorityBoard()");assert.ok(!host.innerHTML.includes('Bruno'));
evaluate("state.ui.weekId='2026-12-28'");assert.equal(evaluate('priorityReportDays()[7]'),'2027-01-04');
const entry={querySelector:selector=>({value:selector.includes('hours')?'1':'30'})};
context.entry=entry;evaluate('priorityChanged=()=>{};updatePriorityActualTime("1",entry)');
assert.equal(evaluate('state.team[0].priorities[0].actualHours'),1.5);
entry.querySelector=()=>({value:''});evaluate('updatePriorityActualTime("1",entry)');
assert.equal(evaluate('state.team[0].priorities[0].actualHours'),null);
console.log('OK: ocho días, equipo/persona, cierre de año, avance, horas reales, texto seguro y edición de tiempo.');
