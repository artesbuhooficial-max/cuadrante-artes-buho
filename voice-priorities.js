/* Dictado en español con revisión explícita antes de añadir prioridades. */
const VOICE_DRAFT_KEY='cuadrante_voice_draft_v1';
let voiceCapture=null,voiceListening=false,voiceFinal='',voiceSeen=new Set(),voicePlan=[];
function voiceParseDays(text,defaultDate,startDate){
  const start=mondayOf(parseId(startDate)),names=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  const pattern=/(?:^|[.;\n]\s*|\s+)(?:(?:para|el|este)\s+)?(pr[oó]ximo\s+lunes|lunes\s+(?:siguiente|de\s+cierre)|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b\s*[,.:;-]?\s*/gi;
  const matches=[...text.matchAll(pattern)],items=[];
  const add=(date,value)=>{value=value.trim().replace(/^[,;:.\s]+|[;\s]+$/g,'');if(value)items.push({date,text:value});};
  if(!matches.length){add(defaultDate,text);return items;}
  add(defaultDate,text.slice(0,matches[0].index));
  matches.forEach((match,i)=>{
    const word=match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const index=/proximo|siguiente|cierre/.test(word)?7:names.indexOf(word);
    add(dStr(addDays(start,index)),text.slice(match.index+match[0].length,matches[i+1]?.index??text.length));
  });
  return items;
}
function voiceSaveDraft(){
  const text=document.getElementById('voiceText');if(!text)return;
  try{localStorage.setItem(VOICE_DRAFT_KEY,JSON.stringify({text:text.value,date:document.getElementById('voiceDate').value,owner:document.getElementById('voiceOwner').value}));}catch(e){}
}
function initializeVoicePriorities(){
  if(document.getElementById('voiceFloat'))return;
  const button=document.createElement('button');button.id='voiceFloat';button.className='voice-float';button.type='button';button.textContent='🎙';
  button.setAttribute('aria-label','Dictar prioridades por día');button.setAttribute('aria-expanded','false');button.title='Dictar prioridades por día';button.onclick=voiceOpen;document.body.appendChild(button);
  const panel=document.createElement('section');panel.id='voicePanel';panel.className='voice-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Dictado de prioridades');document.body.appendChild(panel);
  panel.addEventListener('keydown',e=>{if(e.key==='Escape')voiceClose();});
  window.addEventListener('pagehide',()=>{if(voiceCapture)voiceCapture.abort();});
}
function voiceStatus(text){const el=document.getElementById('voiceStatus');if(el)el.textContent=text;}
function voiceOpen(){
  const panel=document.getElementById('voicePanel');if(!panel.hidden){voiceClose();return;}
  let draft={};try{draft=JSON.parse(localStorage.getItem(VOICE_DRAFT_KEY)||'{}');}catch(e){}
  const dates=priorityReportDays(),today=dStr(new Date()),owner=person(draft.owner)?draft.owner:curPerson().id,date=draft.date||(dates.includes(today)?today:dates[0]);
  panel.innerHTML='<header><h3>🎙 Dictar prioridades</h3><button class="btn ghost" id="voiceClose" aria-label="Cerrar dictado">✕</button></header><div class="voice-body">'+
    '<div class="voice-fields"><label>Persona<select id="voiceOwner">'+state.team.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===owner?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><label>Día por defecto<input id="voiceDate" type="date" value="'+esc(date)+'"></label></div>'+
    '<p class="voice-hint">Di «el lunes… el martes…» para repartir acciones en la semana visible. «Próximo lunes» es el lunes de cierre. Sin un día mencionado, se usa la fecha elegida arriba.</p>'+
    '<div class="voice-buttons"><button class="btn primary" id="voiceStart">🎙 Empezar</button><button class="btn" id="voiceStop" disabled>■ Detener</button></div><p id="voiceStatus" role="status" aria-live="polite">Listo para dictar.</p>'+
    '<label>Transcripción<textarea id="voiceText" rows="5" placeholder="También puedes escribir aquí…"></textarea></label><p id="voiceInterim" class="voice-interim"></p>'+
    '<p class="voice-hint">En Chrome, el audio puede enviarse a Google para transcribirlo. Solo se escucha al pulsar Empezar. El borrador de texto se conserva en este navegador.</p>'+
    '<button class="btn" id="voiceReview">Revisar días y acciones</button><div id="voicePreview"></div><button class="btn primary" id="voiceSave" hidden>Añadir prioridades</button></div>';
  panel.hidden=false;document.getElementById('voiceFloat').setAttribute('aria-expanded','true');document.getElementById('voiceText').value=draft.text||'';voicePlan=[];
  document.getElementById('voiceClose').onclick=voiceClose;document.getElementById('voiceStart').onclick=voiceStart;document.getElementById('voiceStop').onclick=voiceStop;
  document.getElementById('voiceReview').onclick=voiceReview;document.getElementById('voiceSave').onclick=voiceCommit;
  ['voiceText','voiceDate','voiceOwner'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{voicePlan=[];document.getElementById('voicePreview').innerHTML='';document.getElementById('voiceSave').hidden=true;voiceSaveDraft();}));
  if(!(window.SpeechRecognition||window.webkitSpeechRecognition)){document.getElementById('voiceStart').disabled=true;voiceStatus('Este navegador no ofrece dictado. Prueba Chrome o escribe aquí.');}
  document.getElementById('voiceClose').focus();
}
function voiceSetCapture(active){
  voiceListening=active;document.getElementById('voiceFloat').classList.toggle('listening',active);
  const start=document.getElementById('voiceStart');if(!start)return;
  start.disabled=active;document.getElementById('voiceStop').disabled=!active;
  ['voiceText','voiceDate','voiceOwner','voiceReview','voiceSave'].forEach(id=>document.getElementById(id).disabled=active);
}
function voiceStart(){
  if(voiceListening)return;
  const Engine=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Engine)return;
  voiceFinal=document.getElementById('voiceText').value;voiceSeen=new Set();voicePlan=[];
  document.getElementById('voicePreview').innerHTML='';document.getElementById('voiceSave').hidden=true;
  const capture=voiceCapture=new Engine();let error=false;
  capture.lang='es-ES';capture.continuous=true;capture.interimResults=true;
  voiceSetCapture(true);voiceStatus('Solicitando el micrófono…');
  capture.onstart=()=>{if(capture===voiceCapture)voiceStatus('Escuchando… pulsa Detener cuando termines.');};
  capture.onresult=e=>{
    if(capture!==voiceCapture)return;let interim='';
    for(let i=0;i<e.results.length;i++){
      const result=e.results[i],text=result[0].transcript.trim();
      if(result.isFinal&&!voiceSeen.has(i)){voiceSeen.add(i);voiceFinal+=(voiceFinal?' ':'')+text;}
      else if(!result.isFinal)interim+=(interim?' ':'')+text;
    }
    document.getElementById('voiceText').value=voiceFinal;document.getElementById('voiceInterim').textContent=interim;voiceSaveDraft();
  };
  capture.onerror=e=>{
    if(capture!==voiceCapture)return;error=true;
    const messages={'not-allowed':'Permiso de micrófono denegado. Habilítalo en el navegador o escribe aquí.','audio-capture':'No se encuentra un micrófono disponible.','network':'No se pudo conectar al servicio de transcripción.','no-speech':'No se ha detectado voz. Pulsa Empezar para intentarlo otra vez.'};
    voiceStatus(messages[e.error]||'El dictado se ha interrumpido. El texto recibido se conserva.');
  };
  capture.onend=()=>{if(capture!==voiceCapture)return;voiceSetCapture(false);document.getElementById('voiceInterim').textContent='';voiceSaveDraft();if(!error)voiceStatus('Dictado detenido. Revisa el texto y los días antes de añadir.');};
  try{capture.start();}catch(e){voiceSetCapture(false);voiceStatus('No se pudo iniciar el dictado. Inténtalo de nuevo.');}
}
function voiceStop(){if(voiceCapture&&voiceListening){voiceStatus('Terminando transcripción…');voiceCapture.stop();}}
function voiceClose(){
  voiceSaveDraft();const capture=voiceCapture;voiceCapture=null;if(capture)capture.abort();voiceSetCapture(false);document.getElementById('voicePanel').hidden=true;
  const button=document.getElementById('voiceFloat');button.setAttribute('aria-expanded','false');button.focus();
}
function voiceReview(){
  if(voiceListening)return;
  const date=document.getElementById('voiceDate').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){voiceStatus('Elige el día por defecto.');return;}
  voicePlan=voiceParseDays(document.getElementById('voiceText').value,date,state.ui.weekId);
  const preview=document.getElementById('voicePreview');preview.innerHTML='';
  voicePlan.forEach((item,i)=>{const row=document.createElement('div');row.className='voice-review-row';row.innerHTML='<label>Día<input type="date" value="'+esc(item.date)+'" aria-label="Día de la acción '+(i+1)+'"></label><label>Acción<textarea rows="2" aria-label="Acción '+(i+1)+'"></textarea></label>';row.querySelector('textarea').value=item.text;preview.appendChild(row);});
  document.getElementById('voiceSave').hidden=!voicePlan.length;voiceStatus(voicePlan.length?'Revisa estas '+voicePlan.length+' acciones antes de guardarlas.':'No hay texto para añadir.');
}
function voiceCommit(){
  if(voiceListening||!voicePlan.length)return;
  const p=person(document.getElementById('voiceOwner').value);if(!p)return;
  const entries=[...document.querySelectorAll('#voicePreview .voice-review-row')].map(row=>({date:row.querySelector('input').value,title:row.querySelector('textarea').value.trim()}));
  if(!entries.length||entries.some(x=>!x.title||!/^\d{4}-\d{2}-\d{2}$/.test(x.date))){voiceStatus('Cada acción necesita una fecha y un texto.');return;}
  p.priorities=p.priorities||[];
  entries.forEach(x=>p.priorities.push({id:uid(),date:x.date,title:x.title,progress:0,done:false,estimatedHours:null,actualHours:null,order:prioritiesForDay(p,x.date).length,created:Date.now(),source:'voice'}));
  markDirty(p.id);save();renderPriorityBoard();voicePlan=[];voiceFinal='';document.getElementById('voiceText').value='';document.getElementById('voicePreview').innerHTML='';document.getElementById('voiceSave').hidden=true;voiceSaveDraft();
  voiceStatus('Añadidas '+entries.length+' prioridades a '+p.name+'. Usa Publicar para compartirlas con Roman.');toast('Prioridades del dictado guardadas');
}
