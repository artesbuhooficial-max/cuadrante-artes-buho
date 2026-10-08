const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const elements=new Map();let rows=[],saved=0,posted=[],answer,captureError=false,ended=0,requestKey='office-test',closed=0;
function element(id){
  if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',_html:'',children:[],fields:{},
    set innerHTML(v){this._html=v;if(id==='voicePreview')rows=[];},get innerHTML(){return this._html;},
    appendChild(child){this.children.push(child);if(child.className==='voice-review-row')rows.push(child);},before(){},
    querySelector(selector){const field=selector.match(/data-field="([^"]+)"/);if(field)return this.fields[field[1]]||(this.fields[field[1]]={value:''});return this.fields[selector]||(this.fields[selector]={textContent:''});}});
  return elements.get(id);
}
const p={id:'u1',name:'David',salary:9999,priorities:[]};
const ctx=vm.createContext({console,Date,Number,Promise,crypto:{randomUUID:()=> 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'},setTimeout:fn=>fn(),
  voiceCapture:null,voiceListening:false,voiceFinal:'',voicePlan:[],window:{SpeechRecognition:function(){}},_publishKey:'',
  document:{getElementById:element,createElement:()=>element('created'+Math.random()),querySelector:selector=>selector.includes('data-field')?(rows.length?{}:null):{},querySelectorAll:()=>rows},
  state:{team:[p],ui:{weekId:'2026-10-05'}},person:id=>id==='u1'?p:null,ghGet:()=>({appsUrl:'https://script.google.com/test/exec'}),
  askPublishKey:async()=>requestKey,voiceStatus:t=>element('voiceStatus').textContent=t,voiceSaveDraft(){},
  voiceOpen(){element('voicePanel').hidden=false;},voiceClose(){closed++;element('voicePanel').hidden=true;},voiceCommit(){throw Error('unexpected manual commit');},
  voiceStart(){ctx.voiceCapture={onerror(){captureError=true;},onend(){ended++;}};},
  fetch:async(url,options)=>{posted.push({url,options});},jsonp:async()=>answer,
  dStr:()=> '2026-10-08',esc:s=>s,uid:()=> 'i'+p.priorities.length,prioritiesForDay:(p,d)=>p.priorities.filter(x=>x.date===d),markDirty(){},save(){saved++;},renderPriorityBoard(){},toast(){}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','voice-ai.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx),flush=()=>new Promise(resolve=>setImmediate(resolve));
const sample={date:'2026-10-08',title:'Terminar cartel',workNotes:'Cartel de Escuela finalizado.',actualHours:.5,estimatedHours:null,progress:100,sourceQuote:'Terminé el cartel'};
async function main(){
  element('voiceText').value='Terminé el cartel en media hora.';element('voiceDate').value='2026-10-08';element('voiceOwner').value='u1';
  answer={ok:true,items:[sample,{...sample,title:'Revisar correo',actualHours:null,progress:null}],warnings:['Revisar la fecha.']};
  await run('voiceOrganize()');assert.equal(saved,0);assert.equal(rows.length,2);assert.equal(element('voiceSave').hidden,false);
  const request=JSON.parse(posted[0].options.body);assert.equal(request.publishKey,'office-test');assert.equal(request.text,element('voiceText').value);assert.equal(JSON.stringify(request).includes('9999'),false);
  assert.equal(posted[0].options.mode,'no-cors');assert.equal(posted[0].url.includes('office-test'),false);
  assert.equal(rows[1].fields.actualHours.value,'');assert.equal(rows[1].fields.progress.value,'');
  rows.forEach(row=>row.querySelector('[data-field="date"]').value='2026-10-08');
  rows[0].fields.actualHours.value=25;run('voiceCommit()');assert.equal(saved,0);rows[0].fields.actualHours.value=.5;
  run('voiceCommit()');assert.equal(saved,1);assert.equal(p.priorities.length,2);assert.equal(p.priorities[0].progress,100);assert.equal(p.priorities[0].done,true);assert.equal(p.priorities[1].actualHours,null);
  run('voiceCommit()');assert.equal(p.priorities.length,2);
  element('voiceText').value='Otro relato';requestKey='';await run('voiceOrganize()');assert.equal(posted.length,1);assert.ok(element('voiceStatus').textContent.includes('cancelada'));
  requestKey='wrong';answer={ok:false,authError:true,error:'Clave incorrecta'};await run('voiceOrganize()');assert.equal(run('_publishKey'),'');assert.equal(element('voiceText').value,'Otro relato');assert.equal(element('voiceSave').hidden,true);
  requestKey='office-test';answer={ok:true,items:[sample],warnings:[]};
  run('voiceStart();voiceCapture.onend()');await flush();assert.equal(ended,1);assert.equal(rows.length,1);
  const before=posted.length;run("voiceStart();voiceCapture.onerror({error:'not-allowed'});voiceCapture.onend()");await flush();assert.equal(captureError,true);assert.equal(posted.length,before);
  run('voiceClose()');assert.equal(closed,1);assert.equal(run('voiceAiBusy'),false);
  console.log('OK: propuesta sin autoguardado, transporte privado, vacíos, edición, guardado único, cancelación, errores y organización automática al detener.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
