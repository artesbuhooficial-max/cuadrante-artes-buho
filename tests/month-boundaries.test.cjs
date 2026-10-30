/* Cálculos aislados: los bloques nunca se guardan ni se publican. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},classList:{toggle(){}},appendChild(){}});return elements.get(id);}
const ctx=vm.createContext({console,Date,Map,Set,Math,Number,String,Array,JSON,parseInt,parseFloat,setTimeout(){},clearTimeout(){},localStorage:{getItem:()=>null,setItem:()=>assert.fail('No guardar durante el cálculo')},window:{},document:{addEventListener(){},getElementById:element,createElement:()=>({style:{}})}});
vm.runInContext(fs.readFileSync(path.join(root,'priorities-report.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
vm.runInContext(`state={config:{currency:'€'},ui:{person:'a',monthScope:'person',monthRef:{y:2026,m:9}},team:[{id:'a',name:'David',rate:15,projects:[{id:'normal'},{id:'premium',rate:30},{id:'holiday',fullDay:true,billable:false},{id:'unbilled',billable:false}],grid:{
 '2026-09-28':{'2-18':{p:'normal'},'3-18':{p:'normal'},'3-19':{p:'normal'},'6-18':{p:'premium'}},
 '2026-10-12':{'0-18':{p:'holiday'},'3-18':{p:'unbilled'}},
 '2026-10-26':{'5-18':{p:'normal'},'5-19':{p:'normal'},'6-18':{p:'normal'}},
 '2026-12-28':{'3-18':{p:'normal'},'4-18':{p:'normal'},'5-18':{p:'normal'},'6-18':{p:'normal'}}
 }}]};`,ctx);
const run=s=>vm.runInContext(s,ctx),plain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(run("personMonth(person('a'),2026,9)")),{hours:3,cost:45},'Octubre excluye 30 septiembre y 1 noviembre; respeta tarifas y no laboral');
assert.deepEqual(plain(run("personMonth(person('a'),2026,8)")),{hours:.5,cost:7.5},'Septiembre incluye sus últimos días aunque el jueves esté en octubre');
assert.deepEqual(plain(run("personMonth(person('a'),2026,10)")),{hours:.5,cost:7.5},'Noviembre incluye el domingo 1 aunque el jueves sea de octubre');
assert.deepEqual(plain(run("personMonth(person('a'),2027,0)")),{hours:1.5,cost:22.5},'Enero incluye 1–3 en una semana que empieza en diciembre');
assert.deepEqual(plain(run("personMonth(person('a'),2026,11)")),{hours:.5,cost:7.5});
run('renderMonth()');
const monthTable=element('mesWeeks').innerHTML;
assert.ok(monthTable.includes('1 oct – 4 oct'));assert.ok(monthTable.includes('26 oct – 31 oct'));
assert.ok(!monthTable.includes('sept'));assert.ok(!monthTable.includes('nov'));
assert.ok(monthTable.includes('3 h'));assert.ok(monthTable.includes('45,00'));
// Cada fecha del calendario debe coincidir con el total mensual en todos los meses,
// incluidos febrero bisiesto, domingos de cierre y cambios de año.
for(let year=2024;year<=2028;year++)for(let month=0;month<12;month++){
  ctx.year=year;ctx.month=month;
  run("person('a').grid={};for(let d=1;d<=new Date(year,month+1,0).getDate();d++){const date=new Date(year,month,d),id=weekId(mondayOf(date));(person('a').grid[id]||=( {} ))[((date.getDay()+6)%7)+'-18']={p:'normal'};}");
  const days=new Date(year,month+1,0).getDate();assert.deepEqual(plain(run("personMonth(person('a'),year,month)")),{hours:days*.5,cost:days*7.5},`${year}-${month+1}: cuenta exactamente todos sus días`);
}
run("state.ui.monthRef={y:2028,m:11};state.team[0].grid={};renderMonth()");
console.log('OK meses: excluye vecinos, incluye bordes completos, tarifas por proyecto, no laboral y 60 meses con cambio de año y febrero bisiesto.');
