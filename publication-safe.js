/* Publicación y recuperación protegidas. Se instala después de las funciones de la app. */
const SAFE_APPS_URL='https://script.google.com/macros/s/AKfycbyi_g5j2wYXzxd2qPML3x-kTJy3H4wWvi_9CKWH4aymy-X9d1dpaHkmel7_04UX4eXS9w/exec';
const SAFE_BASE_KEY='cuadrante_safe_base_v2',SAFE_PENDING_KEY='cuadrante_safe_pending_v2',SAFE_HISTORY_KEY='cuadrante_safe_history_v2';
const SAFE_DRAFT_KEY='cuadrante_safe_tab_draft_v2';
const safeOriginalFetch=fetchRemote;
const safeOriginalStore=storeSet;
storeSet=function(doc){safeOriginalStore(doc);try{sessionStorage.setItem(SAFE_DRAFT_KEY,JSON.stringify(doc));}catch(e){}};
let safeBase=null,safePublishing=false,safeConflictResolver=null,safeConflictData=null,safeBackupCandidate=null;
function safeGet(key){try{const tabValue=(key===SAFE_BASE_KEY||key===SAFE_PENDING_KEY)?sessionStorage.getItem(key):null;return JSON.parse(tabValue||(key===SAFE_PENDING_KEY?'null':localStorage.getItem(key))||'null');}catch(e){return null;}}
function safeSet(key,value){const text=JSON.stringify(value);if(key===SAFE_PENDING_KEY){sessionStorage.setItem(key,text);return;}localStorage.setItem(key,text);if(key===SAFE_BASE_KEY)sessionStorage.setItem(key,text);}
function safeClearPending(){sessionStorage.removeItem(SAFE_PENDING_KEY);}
function safeSaveBase(doc){safeBase=SafeSync.clone(doc);try{safeSet(SAFE_BASE_KEY,safeBase);}catch(e){toast('No se pudo guardar el punto de sincronización en este navegador. Mantén abierta esta página.');}}
function safeSnapshot(reason){
  const record={at:Date.now(),reason,doc:SafeSync.publicDoc(state),base:safeBase};
  try{safeSet(SAFE_HISTORY_KEY,(safeGet(SAFE_HISTORY_KEY)||[]).concat([record]).slice(-3));}
  catch(e){try{safeSet(SAFE_HISTORY_KEY,[record]);}catch(e){exportJSON(true);}}
}
async function safeJSON(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{const response=await fetch(url,{mode:'cors',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}
  catch(e){return await jsonp(url);}finally{clearTimeout(timer);}
}
async function safeReadRemote(){
  const result=await safeJSON(SAFE_APPS_URL+'?action=sync&t='+Date.now());
  if(!result||!result.ok||result.protocol!==2||!SafeSync.valid(result.state))throw Error(result&&result.error||'El servidor aún no ofrece publicación protegida. Tus cambios se conservan.');
  return result;
}
function safeDirty(doc,base){return (doc.team||[]).filter(p=>!SafeSync.equal(p,(base&&base.team||[]).find(x=>x.id===p.id))).map(p=>p.id);}
function safeInstall(doc,remote){
  const previous=state,ui=SafeSync.clone(previous.ui),privateValues={};
  (previous.team||[]).forEach(p=>privateValues[p.id]={salary:p.salary||0,rate:p.rate||0});
  state=SafeSync.clone(doc);state.ui=ui;state.meta=SafeSync.clone(remote&&remote.meta||previous.meta||{});
  state.meta.dirtyPeople=safeDirty(doc,safeBase);
  (state.team||[]).forEach(p=>Object.assign(p,privateValues[p.id]||{salary:0,rate:0}));
  migrate();save();switchTab(state.ui.tab||'cuadrante');render();
}
function safePathLabel(path){
  const grid=path.indexOf('grid');
  if(grid>=0&&path.length>grid+2){
    const personId=(path[1]||'').replace(/^@/,''),who=person(personId),week=path[grid+1],slot=path[grid+2].match(/^([0-6])-(\d+)$/);
    if(slot&&/^\d{4}-\d{2}-\d{2}$/.test(week)){const date=dStr(addDays(parseId(week),Number(slot[1]))),number=Number(slot[2]);return (who?who.name:personId)+' · '+date+' · '+String(Math.floor(number/2)).padStart(2,'0')+':'+(number%2?'30':'00');}
  }
  const names={team:'Equipo',grid:'Horario',projects:'Proyectos',priorities:'Prioridades',tasks:'Tareas',extraTasks:'Extraordinarias',recurring:'Recurrentes',objectives:'Objetivos',milestones:'Hitos',notes:'Notas',config:'Ajustes'};
  return path.map(part=>{if(part.startsWith('@')){const id=part.slice(1);const p=(state.team||[]).find(p=>p.id===id);return p?p.name:id;}return names[part]||part;}).join(' → ');
}
function safePreview(value,missing){
  if(missing)return 'Eliminado';
  if(value&&value.grid){const weeks=Object.keys(value.grid),blocks=weeks.reduce((n,w)=>n+Object.keys(value.grid[w]).length,0);return value.name+' · '+blocks+' bloques\nSemanas: '+weeks.sort().join(', ')+'\nProyectos: '+(value.projects||[]).map(p=>p.name).join(', ')+'\nPrioridades: '+(value.priorities||[]).map(p=>p.title).join('; ');}
  return JSON.stringify(value,null,2).slice(0,900);
}
function safeNormalizeBackup(source){
  const backup=SafeSync.clone(source);
  for(const p of backup.team||[]){
    p.grid=p.grid||{};const flat=Object.keys(p.grid).filter(k=>/^[0-6]-\d+$/.test(k));
    if(flat.length){const week=backup.ui&&backup.ui.weekId;if(!/^\d{4}-\d{2}-\d{2}$/.test(week||''))throw Error('El backup antiguo no indica la semana de sus bloques. No se ha restaurado.');p.grid[week]=p.grid[week]||{};flat.forEach(k=>{p.grid[week][k]=p.grid[k];delete p.grid[k];});}
    if(!backup.config||backup.config.granularity!=='half'){
      for(const week of Object.keys(p.grid)){const slots={};for(const key of Object.keys(p.grid[week])){const match=key.match(/^([0-6])-(\d+)$/);if(match){const slot=Number(match[2])*2;slots[match[1]+'-'+slot]=p.grid[week][key];slots[match[1]+'-'+(slot+1)]=SafeSync.clone(p.grid[week][key]);}else slots[key]=p.grid[week][key];}p.grid[week]=slots;}
    }
    if(!p.projects||!p.projects.length)p.projects=SafeSync.clone(backup.projects||[]);
  }
  return backup;
}
function safeChooseBackup(backup){
  if(!SafeSync.valid(backup))throw Error('Backup no válido');safeBackupCandidate=safeNormalizeBackup(backup);
  const people=backup.team.filter(p=>person(p.id));if(!people.length)throw Error('No hay personas coincidentes en el backup');
  modal('<div class="modal" style="max-width:520px"><header><h3>Recuperar trabajo de una persona</h3><button class="btn ghost" onclick="closeModal()">✕</button></header><div class="body"><p>Se recuperan su horario, proyectos, prioridades y tareas. Se conserva el trabajo del resto del equipo y lo nuevo que no aparece en el backup.</p><p class="hint">Si el backup contiene otra versión del mismo bloque o tarea de la persona elegida, se recupera esa versión. Después podrás revisarla antes de publicar.</p><label>Persona<select id="safeRestorePerson">'+people.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===state.ui.person?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label></div><footer><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="safeRestoreBackup()">Recuperar esta persona</button></footer></div>');
}
function safeOpenHistory(){
  const history=safeGet(SAFE_HISTORY_KEY)||[];if(!history.length){toast('Todavía no hay copias locales de recuperación');return;}
  modal('<div class="modal" style="max-width:600px"><header><h3>Copias locales recientes</h3><button class="btn ghost" onclick="closeModal()">✕</button></header><div class="body">'+history.map((record,i)=>'<p>'+esc(new Date(record.at).toLocaleString('es-ES'))+' · '+esc(record.reason)+' <button class="btn" onclick="safeUseHistory('+i+')">Elegir persona</button></p>').join('')+'</div></div>');
}
function safeUseHistory(index){try{const record=(safeGet(SAFE_HISTORY_KEY)||[])[index];if(!record)throw Error('Copia no disponible');safeChooseBackup(record.doc);}catch(e){toast(e.message);}}
async function safeResolve(base,mine,theirs){
  const merger=base?choices=>SafeSync.merge(base,mine,theirs,choices):choices=>SafeSync.mergeUnknown(mine,theirs,choices);
  const proposed=merger({});if(!proposed.conflicts.length)return proposed.value;
  return new Promise(resolve=>{
    safeConflictResolver=resolve;safeConflictData={merger,conflicts:proposed.conflicts};
    modal('<div class="modal" style="max-width:900px"><header><h3>Revisar versiones de trabajo</h3><button class="btn ghost" onclick="safeCancelConflict()">✕</button></header><div class="body">'+
      '<p>'+esc(base?'Se han cambiado los mismos datos en dos copias. Elige qué conservar en cada caso.':'Esta copia es anterior a la nueva protección. Revisa qué trabajo local quieres recuperar antes de publicarlo.')+'</p><p class="hint">Tus cambios siguen guardados. Las diferencias compatibles se combinan automáticamente.</p>'+
      proposed.conflicts.map((c,i)=>'<section style="border-top:1px solid var(--line);padding:12px 0"><h4>'+esc(safePathLabel(c.path))+'</h4><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><b>Mi copia</b><pre style="white-space:pre-wrap;max-height:160px;overflow:auto;font-size:.72rem">'+esc(safePreview(c.mine,c.mineMissing))+'</pre></div><div><b>Publicado</b><pre style="white-space:pre-wrap;max-height:160px;overflow:auto;font-size:.72rem">'+esc(safePreview(c.theirs,c.theirsMissing))+'</pre></div></div><label>Conservar <select id="safeChoice'+i+'"><option value="">Elige una versión…</option><option value="theirs">Lo publicado</option><option value="mine">Mi copia</option></select></label></section>').join('')+
      '</div><footer><button class="btn" onclick="safeCancelConflict()">Cancelar</button><button class="btn primary" onclick="safeAcceptConflict()">Aplicar selección</button></footer></div>');
  });
}
function safeCancelConflict(){closeModal();if(safeConflictResolver)safeConflictResolver(null);safeConflictResolver=null;safeConflictData=null;}
function safeAcceptConflict(){
  const data=safeConflictData;if(!data)return;const choices={};
  for(let i=0;i<data.conflicts.length;i++){const value=document.getElementById('safeChoice'+i).value;if(!value){toast('Elige qué conservar en todas las diferencias');return;}choices[data.conflicts[i].key]=value;}
  const result=data.merger(choices);const resolve=safeConflictResolver;safeConflictResolver=null;safeConflictData=null;closeModal();resolve(result.value);
}
async function safeRebase(){
  const remote=await safeReadRemote(),mine=SafeSync.publicDoc(state),theirs=SafeSync.publicDoc(remote.state);
  const merged=await safeResolve(safeBase,mine,theirs);if(!merged)return false;
  safeSnapshot('Antes de combinar con lo publicado');safeSaveBase(theirs);lastKnownRemoteAt=(remote.state.meta||{}).updatedAt||0;safeInstall(merged,remote.state);return true;
}
async function safeWaitPublish(id){
  const deadline=Date.now()+120000;let errors=0;
  while(Date.now()<deadline){
    try{const result=await safeJSON(SAFE_APPS_URL+'?action=publishStatus&id='+encodeURIComponent(id)+'&t='+Date.now());if(result&&!result.pending)return result;errors=0;}
    catch(e){if(++errors>=4)throw Error('No se pudo confirmar el resultado. La próxima publicación comprobará este mismo envío.');}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw Error('El servidor aún no confirma la publicación. El envío se conserva para comprobarlo al reintentar.');
}
publishViaAppsScript=async function(){
  if(safePublishing)return;safePublishing=true;const btn=document.getElementById('publishBtn');if(btn){btn.disabled=true;btn.textContent='⏳ Comprobando…';}
  try{
    let envelope=safeGet(SAFE_PENDING_KEY);
    if(!envelope){
      if(!(await safeRebase()))return;
      if(SafeSync.equal(SafeSync.publicDoc(state),safeBase)){toast('Todo el trabajo está ya publicado');return;}
      safeSnapshot('Antes de publicar');
      envelope={action:'publish2',requestId:crypto.randomUUID().replace(/-/g,''),state:SafeSync.clone(state),base:SafeSync.clone(safeBase)};
      // Si no se puede conservar el envío, se bloquea antes de mandarlo.
      safeSet(SAFE_PENDING_KEY,envelope);
    }
    const key=await askPublishKey();if(!key)return;
    if(btn)btn.textContent='⏳ Publicando…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{await fetch(SAFE_APPS_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},signal:controller.signal,body:JSON.stringify({...envelope,publishKey:key})});}
    finally{clearTimeout(timer);}
    const result=await safeWaitPublish(envelope.requestId);
    if(!result.ok){
      if(result.authError)_publishKey='';
      if(result.code==='CONFLICT'){
        safeClearPending();toast('Hay cambios simultáneos que revisar');await safeRebase();return;
      }
      throw Error(result.error||'El servidor no confirmó la publicación');
    }
    _publishKey=key;
    // Un éxito confirmado se registra antes de refrescar; una caída posterior no repite el envío.
    safeClearPending();
    const sent=SafeSync.publicDoc(envelope.state),mineNow=SafeSync.publicDoc(state);
    safeSaveBase(sent);lastKnownRemoteAt=result.updatedAt||lastKnownRemoteAt;
    let refreshed=false;
    try{
      const remote=await safeReadRemote(),theirs=SafeSync.publicDoc(remote.state),merged=await safeResolve(sent,mineNow,theirs);
      if(merged){safeSaveBase(theirs);safeInstall(merged,remote.state);lastKnownRemoteAt=(remote.state.meta||{}).updatedAt||lastKnownRemoteAt;refreshed=true;}
    }catch(e){state.meta.dirtyPeople=safeDirty(mineNow,sent);storeSet(state);}
    let message=refreshed?'✓ Publicado y confirmado. El trabajo del equipo se ha combinado.':'✓ Publicado y confirmado. Tus cambios posteriores siguen guardados; puedes sincronizar para refrescar.';
    if(result.backupWarning)message+=' No se confirmó la copia de Drive; queda el historial de GitHub y la copia local.';
    if(result.econWarning)message+=' No se confirmó la actualización de los datos económicos.';
    toast(message);
    updateSaveUI();
  }catch(e){toast('Publicación pendiente: '+e.message);}
  finally{safePublishing=false;if(btn){btn.disabled=false;btn.textContent='☁ Publicar';}}
};
publishToGitHub=function(){return publishViaAppsScript();};
guardStalePublish=function(){return safeRebase();};
pullRemote=async function(){
  if(safePublishing){toast('Espera a que termine la publicación');return;}
  try{if(await safeRebase())toast('✓ Sincronizado. Los cambios locales se han conservado.');}catch(e){toast(e.message);}
};
importJSON=function(){
  const input=document.createElement('input');input.type='file';input.accept='.json';
  input.onchange=()=>{const file=input.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{
    try{safeChooseBackup(JSON.parse(reader.result));
    }catch(e){toast(e.message||'Archivo no válido');}
  };reader.readAsText(file);};input.click();
};
async function safeRestoreBackup(){
  const id=document.getElementById('safeRestorePerson').value,backup=safeBackupCandidate;closeModal();
  try{if(!(await safeRebase()))return;safeSnapshot('Antes de recuperar '+person(id).name);const recovered=SafeSync.restorePerson(SafeSync.publicDoc(state),backup,id);safeInstall(recovered,state);markDirty(id);save();safeBackupCandidate=null;toast('Recuperado el trabajo de '+person(id).name+'. Revisa y publica cuando esté listo.');}
  catch(e){toast('No se ha restaurado: '+e.message);}
}
boot=async function(){
  let tabDraft;try{tabDraft=JSON.parse(sessionStorage.getItem(SAFE_DRAFT_KEY)||'null');}catch(e){}
  const local=tabDraft||storeGet();safeBase=safeGet(SAFE_BASE_KEY);let remote,authoritative=false;
  try{remote=(await safeReadRemote()).state;authoritative=true;}catch(e){remote=await safeOriginalFetch();}
  state=local||remote||seed();let notice='';
  if(remote){
    const theirs=SafeSync.publicDoc(remote);
    if(!local){safeSaveBase(theirs);}
    else if(safeBase&&authoritative){
      const merged=SafeSync.merge(safeBase,SafeSync.publicDoc(local),theirs);
      if(!merged.conflicts.length){const ui=state.ui,econ={};state.team.forEach(p=>econ[p.id]={salary:p.salary,rate:p.rate});state=merged.value;state.ui=ui;state.meta=remote.meta;state.team.forEach(p=>Object.assign(p,econ[p.id]||{}));safeSaveBase(theirs);}
      else notice='Hay versiones simultáneas pendientes de revisar. Tu trabajo local se conserva.';
    }else if(authoritative&&SafeSync.equal(SafeSync.publicDoc(local),theirs))safeSaveBase(theirs);
    else notice='Tu copia anterior se conserva. Al publicar podrás elegir qué trabajo recuperar.';
    lastKnownRemoteAt=(remote.meta||{}).updatedAt||0;
  }
  migrate();loadPins();adoptAppsUrl();initializePriorityReport();initializeVoicePriorities();storeSet(state);await initFile();switchTab(state.ui.tab||'cuadrante');render();if(notice)toast(notice);
};
