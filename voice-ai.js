/* Dictado organizado por Claude mediante Apps Script, sin claves API en el cliente. */
const VOICE_APPS_URL='https://script.google.com/macros/s/AKfycbyi_g5j2wYXzxd2qPML3x-kTJy3H4wWvi_9CKWH4aymy-X9d1dpaHkmel7_04UX4eXS9w/exec';
let voiceAiBusy=false,voiceAiGeneration=0;
const voiceOriginalOpen=voiceOpen,voiceOriginalClose=voiceClose,voiceOriginalCommit=voiceCommit,voiceOriginalStart=voiceStart;
voiceOpen=function(){
  voiceOriginalOpen();if(document.getElementById('voicePanel').hidden)return;
  document.getElementById('voiceReview').textContent='Organizar con IA';
  document.getElementById('voiceReview').onclick=voiceOrganize;
  const hint=document.querySelector('#voicePanel .voice-hint');
  if(hint)hint.textContent='Cuenta tu jornada con naturalidad. Al detener el dictado, la IA ordena las acciones por día. Revisa el resultado antes de guardarlo.';
  const notice=document.createElement('p');notice.className='voice-hint';notice.textContent='El audio se transcribe con Google y el texto se envía a Claude mediante Apps Script para organizarlo. No se adjuntan sueldos ni costes del cuadrante. Guardar no publica los cambios.';
  document.getElementById('voicePreview').before(notice);
};
voiceClose=function(){voiceAiGeneration++;voiceAiBusy=false;voiceOriginalClose();};
voiceStart=function(){
  if(voiceAiBusy)return;voiceOriginalStart();const capture=voiceCapture;if(!capture)return;
  const ended=capture.onend;let failed=false;const errored=capture.onerror;
  capture.onerror=function(e){failed=true;errored(e);};
  capture.onend=function(){ended();if(!failed&&capture===voiceCapture&&document.getElementById('voiceText').value.trim())voiceOrganize();};
};
function voiceAiControls(active){
  ['voiceStart','voiceText','voiceDate','voiceOwner','voiceReview','voiceSave'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=active;});
  if(!active&&!(window.SpeechRecognition||window.webkitSpeechRecognition))document.getElementById('voiceStart').disabled=true;
}
async function voiceOrganize(){
  if(voiceListening||voiceAiBusy)return;
  const text=document.getElementById('voiceText').value.trim(),date=document.getElementById('voiceDate').value,url=VOICE_APPS_URL;
  if(!text){voiceStatus('Primero dicta o escribe tu jornada.');return;}
  if(text.length>12000){voiceStatus('Divide el relato en bloques de menos de 12.000 caracteres.');return;}
  if(!voiceAiValidDate(date)){voiceStatus('Elige una fecha por defecto válida.');return;}
  voiceAiBusy=true;const generation=++voiceAiGeneration;voiceAiControls(true);voiceSaveDraft();
  document.getElementById('voiceSave').hidden=true;document.getElementById('voicePreview').innerHTML='';voicePlan=[];
  try{
    voiceStatus('Introduce la clave compartida de la oficina para usar la IA.');
    const key=await askPublishKey({title:'Organizar jornada con IA',button:'Organizar',hint:'Usa la clave compartida de publicación. No se publicará ningún cambio.'});
    if(generation!==voiceAiGeneration)return;
    if(!key){voiceStatus('Organización cancelada. El dictado sigue guardado como borrador.');return;}
    const id=crypto.randomUUID().replace(/-/g,'');
    voiceStatus('La IA está ordenando tu jornada…');
    await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'organizeVoice',requestId:id,publishKey:key,text,defaultDate:date,today:dStr(new Date()),weekStart:state.ui.weekId})});
    const result=await voiceWaitForResult(url,id,generation);
    if(generation!==voiceAiGeneration)return;
    if(!result.ok){if(result.authError)_publishKey='';throw new Error(result.error||'No se pudo organizar el dictado.');}
    _publishKey=key;voiceAiRender(result);
  }catch(e){if(generation===voiceAiGeneration)voiceStatus(e.message+' El texto original no se ha borrado.');}
  finally{if(generation===voiceAiGeneration){voiceAiBusy=false;voiceAiControls(false);}}
}
async function voiceWaitForResult(url,id,generation){
  const deadline=Date.now()+100000;let connectionFailures=0;
  while(Date.now()<deadline){
    if(generation!==voiceAiGeneration)return null;
    try{
      const query='action=voiceStatus&id='+encodeURIComponent(id)+'&t='+Date.now();
      const result=await voiceReadStatus(url+(url.includes('?')?'&':'?')+query);
      connectionFailures=0;
      if(result&&!result.pending)return result;
    }catch(error){
      connectionFailures++;
      if(connectionFailures>=4)throw new Error('No se pudo consultar Apps Script tras varios intentos. Comprueba la conexión en Ajustes → Probar conexión y vuelve a pulsar Organizar.');
      voiceStatus('La respuesta de la IA tarda en llegar. Reconectando… ('+connectionFailures+'/3)');
    }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw new Error('La IA está tardando demasiado. Vuelve a pulsar Organizar; el dictado sigue disponible.');
}
async function voiceReadStatus(url){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{mode:'cors',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return await response.json();
  }catch(error){
    return jsonp(url);
  }finally{clearTimeout(timeout);}
}
function voiceAiRender(result){
  voicePlan=result.items||[];const preview=document.getElementById('voicePreview');preview.innerHTML='';
  const warnings=document.createElement('p');warnings.textContent=(result.warnings||[]).join(' ');warnings.className='voice-hint';preview.appendChild(warnings);
  voicePlan.forEach(item=>{
    const row=document.createElement('div');row.className='voice-review-row';
    row.innerHTML='<label>Día<input type="date" data-field="date" value="'+esc(item.date)+'"></label><label>Acción<textarea data-field="title" rows="2"></textarea></label><label>Trabajo realizado / contexto<textarea data-field="workNotes" rows="2"></textarea></label><div class="voice-fields"><label>Horas dedicadas<input data-field="actualHours" type="number" min="0" max="24" step="any"></label><label>Horas previstas<input data-field="estimatedHours" type="number" min="0" max="24" step="any"></label><label>Avance %<input data-field="progress" type="number" min="0" max="100" step="1"></label></div><small></small>';
    ['title','workNotes','actualHours','estimatedHours','progress'].forEach(field=>row.querySelector('[data-field="'+field+'"]').value=item[field]??'');
    row.querySelector('small').textContent='Del dictado: '+(item.sourceQuote||'');preview.appendChild(row);
  });
  document.getElementById('voiceSave').hidden=!voicePlan.length;
  voiceStatus(voicePlan.length?'Jornada organizada en '+voicePlan.length+' acciones. Revisa fechas, horas y avances; los campos vacíos no se han indicado.':'No se han identificado acciones. Amplía el relato y vuelve a organizar.');
}
voiceCommit=function(){
  if(voiceAiBusy||voiceListening||!voicePlan.length)return;
  if(!document.querySelector('#voicePreview [data-field]'))return voiceOriginalCommit();
  const p=person(document.getElementById('voiceOwner').value);if(!p)return;
  const entries=[...document.querySelectorAll('#voicePreview .voice-review-row')].map(row=>{
    const value=f=>row.querySelector('[data-field="'+f+'"]').value;
    const number=f=>value(f)===''?null:Number(value(f));
    return {date:value('date'),title:value('title').trim(),workNotes:value('workNotes').trim(),actualHours:number('actualHours'),estimatedHours:number('estimatedHours'),progress:number('progress')};
  });
  if(!entries.length||entries.some(x=>!x.title||!voiceAiValidDate(x.date)||['actualHours','estimatedHours','progress'].some(f=>x[f]!==null&&(!Number.isFinite(x[f])||x[f]<0||x[f]>(f==='progress'?100:24))))){voiceStatus('Revisa las fechas, las acciones y los valores numéricos antes de guardar.');return;}
  p.priorities=p.priorities||[];
  entries.forEach(x=>p.priorities.push({...x,id:uid(),progress:x.progress??0,done:x.progress===100,order:prioritiesForDay(p,x.date).length,created:Date.now(),source:'voice-ai'}));
  markDirty(p.id);save();renderPriorityBoard();voicePlan=[];voiceFinal='';document.getElementById('voiceText').value='';document.getElementById('voicePreview').innerHTML='';document.getElementById('voiceSave').hidden=true;voiceSaveDraft();
  voiceStatus('Guardadas '+entries.length+' acciones para '+p.name+'. Usa Publicar cuando quieras compartir el informe con Roman.');toast('Jornada organizada y guardada');
};
function voiceAiValidDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
