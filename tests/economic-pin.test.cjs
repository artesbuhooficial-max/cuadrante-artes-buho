/* Pruebas con claves e importes ficticios. Ninguna llamada a servicios reales. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=html.slice(html.indexOf('const PIN_KEY='),html.indexOf('// Devuelve el meta.updatedAt'));
const fields=new Map(),posted=[],people=[{id:'u1',name:'David',rate:0,salary:0},{id:'u2',name:'Compañera',rate:0,salary:0}];
let reply={ok:true,econ:{u1:{rate:20,salary:0},u2:{rate:999,salary:999}}},networkError=false,renders=0,closed=0;
function form(){fields.clear();for(const id of ['econPinSave','econPinStatus','econPinNew','econPinRepeat','econPinMaster'])fields.set(id,{value:'',textContent:'',disabled:false});}
const ctx=vm.createContext({console,document:{getElementById:id=>fields.get(id)},person:id=>people.find(p=>p.id===id),ghGet:()=>({appsUrl:'https://script.test/exec'}),state:{team:people},modal:markup=>ctx.markup=markup,fetch:async(url,options)=>{posted.push(JSON.parse(options.body));},jsonp:async()=>{if(networkError)throw Error('offline');return reply;},closeModal:()=>{closed++;fields.clear();},render:()=>renders++,toast:t=>ctx.message=t,setTimeout(){},localStorage:{getItem:()=>null,setItem:()=>assert.fail('No guardar claves localmente')}});
ctx.esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
vm.runInContext(source,ctx);const run=s=>vm.runInContext(s,ctx);
ctx.jsonp=async()=>{if(networkError)throw Error('offline');return reply;};
async function main(){
  form();run("openEconomicPin('u1')");assert.ok(ctx.markup.includes('PIN económico de David'));assert.ok(!ctx.markup.includes('Compañera'));assert.ok(ctx.markup.includes('Clave maestra de Román'));
  fields.get('econPinNew').value='123';await run("saveEconomicPin('u1')");assert.equal(posted.length,0);
  fields.get('econPinNew').value='123456';fields.get('econPinRepeat').value='654321';await run("saveEconomicPin('u1')");assert.equal(posted.length,0);
  fields.get('econPinRepeat').value='123456';await run("saveEconomicPin('u1')");assert.equal(posted.length,0);
  fields.get('econPinMaster').value='master-ficticio';reply={ok:false,error:'Clave incorrecta'};await run("saveEconomicPin('u1')");assert.equal(renders,0);assert.equal(closed,0);assert.equal(run("isLocked('u1')"),true);assert.equal(fields.get('econPinSave').disabled,false);
  networkError=true;await run("saveEconomicPin('u1')");assert.ok(fields.get('econPinStatus').textContent.includes('puede haberse guardado'));assert.equal(fields.get('econPinNew').value,'123456');networkError=false;
  reply={ok:true,econ:{u1:{rate:20,salary:0},u2:{rate:999,salary:999}}};await run("saveEconomicPin('u1')");assert.equal(closed,1,fields.get('econPinStatus')?.textContent);assert.equal(renders,1);assert.equal(people[0].rate,20);assert.equal(people[1].rate,0);assert.equal(run("isLocked('u1')"),false);assert.equal(run("isLocked('u2')"),true);assert.equal(run('isMasterUnlocked()'),false);
  posted.forEach(body=>{assert.deepEqual(body,{action:'setpins',master:'master-ficticio',pins:{u1:'123456'}});});

  // La ruta real del servidor fusiona solo el PIN enviado y exige la clave maestra.
  const props={PINS:JSON.stringify({u1:'anterior',u2:'intacto'}),MASTER_KEY:'master-ficticio',ECON:'importes-intactos'},writes=[];
  const backend=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{writes.push(k);props[k]=v;}})},UrlFetchApp:{fetch:()=>assert.fail('No leer ni publicar el cuadrante')}});
  vm.runInContext(fs.readFileSync(path.join(root,'apps-script','Codigo.gs'),'utf8'),backend);vm.runInContext('_out=function(value){return value;}',backend);
  backend.body={action:'setpins',master:'incorrecta',pins:{u1:'123456'}};assert.equal(vm.runInContext('doPost({postData:{contents:JSON.stringify(body)}}).ok',backend),false);assert.equal(writes.length,0);
  backend.body.master='master-ficticio';assert.equal(vm.runInContext('doPost({postData:{contents:JSON.stringify(body)}}).ok',backend),true);assert.deepEqual(JSON.parse(props.PINS),{u1:'123456',u2:'intacto'});assert.equal(props.ECON,'importes-intactos');assert.deepEqual(writes,['PINS']);
  console.log('OK PIN económico: validación, autorización maestra, cambio de una persona, datos propios, compañeros bloqueados, errores recuperables y cero escrituras del cuadrante.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
