/* Publicación y recuperación protegidas. Se instala después de las funciones de la app. */
const SAFE_APPS_URL='https://script.google.com/macros/s/AKfycbyi_g5j2wYXzxd2qPML3x-kTJy3H4wWvi_9CKWH4aymy-X9d1dpaHkmel7_04UX4eXS9w/exec';
const SAFE_BASE_KEY='cuadrante_safe_base_v2',SAFE_PENDING_KEY='cuadrante_safe_pending_v2',SAFE_HISTORY_KEY='cuadrante_safe_history_v2';
const SAFE_DRAFT_KEY='cuadrante_safe_tab_draft_v2';
const SAFE_LEGACY_KEY='cuadrante_legacy_original_v3';
const SAFE_WORK_KEY='cuadrante_work_copy_v3';
const safeOriginalFetch=fetchRemote;
const safeOriginalStore=storeSet;
storeSet=function(doc){
  if(safeStoragePaused)return;
  safeOriginalStore(doc);
  // Borrador y base viajan juntos en una única escritura: otra pestaña no puede
  // emparejar una edición con la base de sincronización de alguien distinto.
  const bundle=JSON.stringify({version:3,doc,base:safeBase});
  try{sessionStorage.setItem(SAFE_WORK_KEY,bundle);sessionStorage.setItem(SAFE_DRAFT_KEY,JSON.stringify(doc));}catch(e){}
  try{localStorage.setItem(SAFE_WORK_KEY,bundle);}catch(e){memFallback=true;}
  if(memFallback)AppStability.status('El navegador no permite guardar de forma permanente. Descarga un backup desde Ajustes antes de cerrar esta página.',true);
};
const safeOriginalSaveUI=updateSaveUI;
updateSaveUI=function(){
  safeOriginalSaveUI();const pill=document.getElementById('saveStatus');if(!pill)return;
  pill.textContent=safeGet(SAFE_PENDING_KEY)?'⏳ Envío por confirmar':!safeBase?'● Copia pendiente de revisión':SafeSync.equal(SafeSync.publicDoc(state),safeBase)?'✓ Sin cambios pendientes':'● Cambios sin publicar';
};
let safeBase=null,safePublishing=false,safeConflictResolver=null,safeConflictData=null,safeBackupCandidate=null,safeStoragePaused=false,safeSyncing=false,safeLegacyScopeResolver=null;
function safeGet(key){try{const tabValue=(key===SAFE_BASE_KEY||key===SAFE_PENDING_KEY)?sessionStorage.getItem(key):null;return JSON.parse(tabValue||(key===SAFE_PENDING_KEY?'null':localStorage.getItem(key))||'null');}catch(e){return null;}}
function safeSet(key,value){const text=JSON.stringify(value);if(key===SAFE_PENDING_KEY){sessionStorage.setItem(key,text);return;}localStorage.setItem(key,text);if(key===SAFE_BASE_KEY)sessionStorage.setItem(key,text);}
function safeClearPending(){sessionStorage.removeItem(SAFE_PENDING_KEY);}
function safeSaveBase(doc){safeBase=SafeSync.clone(doc);try{safeSet(SAFE_BASE_KEY,safeBase);}catch(e){toast('No se pudo guardar el punto de sincronización en este navegador. Mantén abierta esta página.');}}
function safeSnapshot(reason){
  const record={at:Date.now(),reason,doc:SafeSync.publicDoc(state),base:safeBase};
  try{safeSet(SAFE_HISTORY_KEY,(safeGet(SAFE_HISTORY_KEY)||[]).concat([record]).slice(-3));}
  catch(e){try{safeSet(SAFE_HISTORY_KEY,[record]);}catch(e){exportJSON(true);}}
}
function safeArchiveLegacy(){
  const doc=SafeSync.publicDoc(state);doc.ui=SafeSync.clone(state.ui);
  const record={at:Date.now(),reason:'Copia anterior a la combinación inicial',doc};
  // La primera copia se conserva aparte de las tres copias rotativas habituales.
  let saved=false;
  for(const name of ['sessionStorage','localStorage']){try{const storage=globalThis[name];if(!storage.getItem(SAFE_LEGACY_KEY))storage.setItem(SAFE_LEGACY_KEY,JSON.stringify(record));saved=true;}catch(e){}}
  if(!saved)throw Error('No hay espacio para proteger tu copia original. Descarga un backup desde Ajustes antes de continuar.');
  safeSnapshot('Copia completa antes de incorporar trabajo antiguo');
}
function safeDownloadLegacy(){
  let record;for(const name of ['sessionStorage','localStorage']){try{record=JSON.parse(globalThis[name].getItem(SAFE_LEGACY_KEY)||'null');if(record)break;}catch(e){}}
  if(!record){toast('No se encuentra la copia original');return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(record.doc,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='cuadrante-antes-de-combinar-'+record.at+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function safeAskLegacyScope(){
  safeArchiveLegacy();
  return new Promise(resolve=>{
    modal('<div class="modal" style="max-width:580px"><header><h3>Incorporar mi trabajo sin tocar al equipo</h3><button class="btn ghost" onclick="closeModal()">✕</button></header><div class="body"><p>Esta copia antigua no permite saber qué cambió cada persona. Elige de quién quieres incorporar trabajo. <b>Las fichas y el trabajo de los demás se conservarán tal como están publicados.</b></p><label>Incorporar el trabajo de<select id="safeLegacyPerson">'+state.team.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===state.ui.person?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><p><label><input type="checkbox" id="safeLegacyShared"> También revisar notas, tareas y eventos de empresa</label></p><p class="hint">Se unirán los bloques y registros nuevos. Si dos versiones difieren en un dato, podrás revisar ese dato; no tendrás que sustituir a una persona entera. Lo que falte en esta copia no se borrará de lo publicado.</p><button class="btn" onclick="safeDownloadLegacy()">Descargar copia original protegida</button></div><footer><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="safeAcceptLegacyScope()">Revisar mis cambios</button></footer></div>');
    safeLegacyScopeResolver=resolve;
  });
}
function safeAcceptLegacyScope(){
  const scope={personId:document.getElementById('safeLegacyPerson').value,includeShared:document.getElementById('safeLegacyShared').checked};
  const resolve=safeLegacyScopeResolver;safeLegacyScopeResolver=null;closeModal();if(resolve)resolve(scope);
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
  state=AppStability.prepare(doc);state.ui=ui;state.meta=SafeSync.clone(remote&&remote.meta||previous.meta||{});
  state.meta.dirtyPeople=safeDirty(doc,safeBase);
  (state.team||[]).forEach(p=>Object.assign(p,privateValues[p.id]||{salary:0,rate:0}));
  migrate();save();switchTab(state.ui.tab||'cuadrante');
}
function safePathLabel(path){
  const grid=path.indexOf('grid');
  if(grid>=0&&path.length>grid+2){
    const personId=(path[1]||'').replace(/^@/,''),who=person(personId),week=path[grid+1],slot=path[grid+2].match(/^([0-6])-(\d+)$/);
    if(slot&&/^\d{4}-\d{2}-\d{2}$/.test(week)){const date=dStr(addDays(parseId(week),Number(slot[1]))),number=Number(slot[2]);return (who?who.name:personId)+' · '+date+' · '+String(Math.floor(number/2)).padStart(2,'0')+':'+(number%2?'30':'00');}
  }
  const names={team:'Equipo',grid:'Horario',projects:'Proyectos',priorities:'Prioridades',tasks:'Tareas',extraTasks:'Extraordinarias',recurring:'Recurrentes',objectives:'Objetivos',milestones:'Hitos',notes:'Notas',config:'Ajustes',title:'Título',text:'Texto',progress:'Avance (%)',done:'Completado',date:'Día',deadline:'Fecha límite',actualHours:'Horas dedicadas',estimatedHours:'Horas estimadas',workNotes:'Trabajo realizado',order:'Orden',created:'Fecha de creación',name:'Nombre',color:'Color',status:'Estado'};
  let node=state;
  return path.map(part=>{if(part.startsWith('@')){const id=part.slice(1);node=Array.isArray(node)?node.find(x=>x.id===id):null;return node?String(node.name||node.title||node.text||id)+(node.date?' · '+node.date:''):id;}node=node&&node[part];return names[part]||part;}).join(' → ');
}
function safePreview(value,missing){
  if(missing)return 'Eliminado';
  if(typeof value==='string')return value;
  if(typeof value==='boolean')return value?'Sí':'No';
  if(value&&typeof value==='object'&&'p' in value)return 'Proyecto: '+(projName(value.p)||value.p)+(value.n?'\nNota: '+value.n:'');
  if(value&&value.grid){const weeks=Object.keys(value.grid),blocks=weeks.reduce((n,w)=>n+Object.keys(value.grid[w]).length,0);return value.name+' · '+blocks+' bloques\nSemanas: '+weeks.sort().join(', ')+'\nProyectos: '+(value.projects||[]).map(p=>p.name).join(', ')+'\nPrioridades: '+(value.priorities||[]).map(p=>p.title).join('; ');}
  return String(JSON.stringify(value,null,2)).slice(0,900);
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
  if(!SafeSync.valid(backup))throw Error('Backup no válido');safeBackupCandidate=AppStability.prepare(safeNormalizeBackup(backup));
  const people=backup.team.filter(p=>person(p.id));if(!people.length)throw Error('No hay personas coincidentes en el backup');
  modal('<div class="modal" style="max-width:520px"><header><h3>Recuperar trabajo de una persona</h3><button class="btn ghost" onclick="closeModal()">✕</button></header><div class="body"><p>Se recuperan su horario, proyectos, prioridades y tareas. Se conserva el trabajo del resto del equipo y lo nuevo que no aparece en el backup.</p><p class="hint">Si el backup contiene otra versión del mismo bloque o tarea de la persona elegida, se recupera esa versión. Después podrás revisarla antes de publicar.</p><label>Persona<select id="safeRestorePerson">'+people.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===state.ui.person?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label></div><footer><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="safeRestoreBackup()">Recuperar esta persona</button></footer></div>');
}
function safeOpenHistory(){
  const history=safeGet(SAFE_HISTORY_KEY)||[];if(!history.length){toast('Todavía no hay copias locales de recuperación');return;}
  modal('<div class="modal" style="max-width:600px"><header><h3>Copias locales recientes</h3><button class="btn ghost" onclick="closeModal()">✕</button></header><div class="body">'+history.map((record,i)=>'<p>'+esc(new Date(record.at).toLocaleString('es-ES'))+' · '+esc(record.reason)+' <button class="btn" onclick="safeUseHistory('+i+')">Elegir persona</button></p>').join('')+'</div></div>');
}
function safeUseHistory(index){try{const record=(safeGet(SAFE_HISTORY_KEY)||[])[index];if(!record)throw Error('Copia no disponible');safeChooseBackup(record.doc);}catch(e){toast(e.message);}}
async function safeResolve(base,mine,theirs,scope){
  if(!base&&scope)mine=SafeSync.legacyScope(mine,theirs,scope.personId,scope.includeShared);
  const merger=base?choices=>SafeSync.merge(base,mine,theirs,choices):choices=>SafeSync.mergeUnknown(mine,theirs,choices);
  const proposed=merger({});if(!proposed.conflicts.length)return proposed.value;
  return new Promise(resolve=>{
    modal('<div class="modal" style="max-width:900px"><header><h3>Revisar versiones de trabajo</h3><button class="btn ghost" onclick="safeCancelConflict()">✕</button></header><div class="body">'+
      '<p>'+esc(base?'Dos copias cambiaron estos mismos datos. El resto del trabajo se combina automáticamente.':'Revisa solo los datos que difieren del trabajo elegido. Los demás compañeros se conservan. En las dudas está preseleccionado lo publicado; marca «Mi cambio» únicamente donde reconozcas tu edición.')+'</p><p class="hint">No se sustituye ninguna persona entera. Los registros nuevos se incorporan y lo publicado que no aparece en la copia antigua se conserva. Tu copia original sigue protegida.</p>'+
      proposed.conflicts.map((c,i)=>'<section style="border-top:1px solid var(--line);padding:12px 0"><h4>'+esc(safePathLabel(c.path))+'</h4><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><b>Mi cambio</b><pre style="white-space:pre-wrap;max-height:160px;overflow:auto;font-size:.78rem">'+esc(safePreview(c.mine,c.mineMissing))+'</pre></div><div><b>Ya publicado</b><pre style="white-space:pre-wrap;max-height:160px;overflow:auto;font-size:.78rem">'+esc(safePreview(c.theirs,c.theirsMissing))+'</pre></div></div><label>Para este dato <select id="safeChoice'+i+'">'+(base?'<option value="">Elige qué conservar…</option>':'')+'<option value="theirs">Conservar lo publicado</option><option value="mine">Incorporar mi cambio</option></select></label></section>').join('')+
      '</div><footer>'+(base?'':'<button class="btn" onclick="safeDownloadLegacy()">Descargar copia original</button>')+'<button class="btn" onclick="safeCancelConflict()">Cancelar</button><button class="btn primary" onclick="safeAcceptConflict()">Combinar y continuar</button></footer></div>');
    safeConflictResolver=resolve;safeConflictData={merger,conflicts:proposed.conflicts};
  });
}
function safeCancelConflict(){closeModal();if(safeConflictResolver)safeConflictResolver(null);safeConflictResolver=null;safeConflictData=null;}
function safeAcceptConflict(){
  const data=safeConflictData;if(!data)return;const choices={};
  for(let i=0;i<data.conflicts.length;i++){const value=document.getElementById('safeChoice'+i).value;if(!value){toast('Elige qué conservar en todas las diferencias');return;}choices[data.conflicts[i].key]=value;}
  const result=data.merger(choices);const resolve=safeConflictResolver;safeConflictResolver=null;safeConflictData=null;closeModal();resolve(result.value);
}
async function safeResolveLive(base,theirs){
  // La conexión o la revisión pueden tardar. No instalar una instantánea tomada
  // antes de las ediciones que la persona haya hecho mientras esperaba.
  const scope=base?null:await safeAskLegacyScope();if(!base&&!scope)return null;
  for(let attempt=0;attempt<5;attempt++){
    const mine=SafeSync.publicDoc(state),merged=await safeResolve(base,mine,theirs,scope);if(!merged)return null;
    if(SafeSync.equal(mine,SafeSync.publicDoc(state)))return merged;
    toast('La copia cambió durante la revisión. Comprobando de nuevo para conservar las últimas ediciones.');
  }
  throw Error('La copia sigue cambiando. Tus ediciones se conservan; termina de editar y vuelve a sincronizar.');
}
async function safeRebase(){
  if(safeStoragePaused||AppStability.isFatal())throw Error('Primero hay que recuperar la copia de trabajo. No se ha publicado nada.');
  const remote=await safeReadRemote(),theirs=SafeSync.publicDoc(remote.state);
  const merged=await safeResolveLive(safeBase,theirs);if(!merged)return false;
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
  if(safePublishing||safeSyncing){toast('Hay otra operación en curso. Tus cambios se conservan.');return;}safePublishing=true;const btn=document.getElementById('publishBtn');if(btn){btn.disabled=true;btn.textContent='⏳ Comprobando…';}
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
    const sent=SafeSync.publicDoc(envelope.state);
    safeSaveBase(sent);lastKnownRemoteAt=result.updatedAt||lastKnownRemoteAt;
    let refreshed=false;
    try{
      const remote=await safeReadRemote(),theirs=SafeSync.publicDoc(remote.state),merged=await safeResolveLive(sent,theirs);
      if(merged){safeSaveBase(theirs);safeInstall(merged,remote.state);lastKnownRemoteAt=(remote.state.meta||{}).updatedAt||lastKnownRemoteAt;refreshed=true;}
    }catch(e){state.meta.dirtyPeople=safeDirty(SafeSync.publicDoc(state),sent);storeSet(state);}
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
  if(safePublishing||safeSyncing){toast('Espera a que termine la operación en curso');return;}
  safeSyncing=true;const btn=document.getElementById('syncBtn');if(btn)btn.disabled=true;
  try{if(await safeRebase())toast('✓ Sincronizado. Los cambios locales se han conservado.');}catch(e){toast(e.message);}
  finally{safeSyncing=false;if(btn)btn.disabled=false;}
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
  let raw,local,bundle,tabBase=null;
  try{
    try{raw=sessionStorage.getItem(SAFE_DRAFT_KEY);bundle=JSON.parse(sessionStorage.getItem(SAFE_WORK_KEY)||'null');tabBase=JSON.parse(sessionStorage.getItem(SAFE_BASE_KEY)||'null');}catch(e){}
    if(!raw){try{raw=localStorage.getItem(KEY);bundle=JSON.parse(localStorage.getItem(SAFE_WORK_KEY)||'null');}catch(e){memFallback=true;}}
    if(bundle&&bundle.version===3&&JSON.stringify(bundle.doc)===raw){local=AppStability.prepare(bundle.doc);safeBase=bundle.base;}
    else{local=raw?AppStability.prepare(JSON.parse(raw)):storeGet();safeBase=tabBase;}
    // Un JSON dañado nunca se reemplaza silenciosamente por el ejemplo inicial.
    if(local)local=AppStability.prepare(local);
    if(safeBase&&!SafeSync.valid(safeBase))safeBase=null;
    safeStoragePaused=!local;
    state=local||AppStability.prepare(seed());migrate();loadPins();adoptAppsUrl();initializePriorityReport();initializeVoicePriorities();
    switchTab(state.ui.tab||'cuadrante');
    AppStability.status(local?'Tu copia está abierta. Comprobando novedades en segundo plano…':'Cargando la copia publicada. Lo mostrado todavía es el ejemplo inicial.');
    const sync=document.getElementById('syncBtn');if(sync)sync.title='Combina lo publicado con tus cambios locales; si hay un conflicto, permite revisar las dos versiones';
    // El archivo opcional no bloquea nunca la pantalla ni la conexión del equipo.
    Promise.resolve().then(()=>initFile()).catch(()=>{});
    const opening=SafeSync.publicDoc(state),baseAtStart=safeBase;
    let remote,authoritative=false;
    // Se prueba primero la copia pública rápida para dispositivos sin datos.
    // No establece una base autoritativa: publicar siempre volverá a leer el servidor.
    const published=local?null:await AppStability.bounded(safeOriginalFetch(),8000).catch(()=>null);
    if(published){remote=AppStability.prepare(published);}
    else{
      try{remote=AppStability.prepare((await safeReadRemote()).state);authoritative=true;}
      catch(e){if(local)AppStability.status('Sin conexión con el servidor. Puedes seguir trabajando en tu copia; no se ha sustituido ningún dato.',true);}
    }
    if(!remote){if(!local)throw Error('No hay copia local ni se pudo descargar la publicada');return;}
    if(safePublishing||safeSyncing||safeBase!==baseAtStart){AppStability.status('');return;} // Una sincronización manual más reciente tiene prioridad.
    const theirs=SafeSync.publicDoc(remote),mine=SafeSync.publicDoc(state);
    let merged;
    if(local){
      if(safeBase&&authoritative){const proposal=SafeSync.merge(safeBase,mine,theirs);if(!proposal.conflicts.length)merged=proposal.value;}
      else if(authoritative&&SafeSync.equal(mine,theirs))merged=mine;
    }else{
      // Conserva también lo escrito mientras llegaba la primera conexión.
      const proposal=SafeSync.merge(opening,mine,theirs);if(!proposal.conflicts.length)merged=proposal.value;
    }
    if(merged){safeStoragePaused=false;if(authoritative)safeSaveBase(theirs);safeInstall(merged,remote);AppStability.status(memFallback?'El almacenamiento está bloqueado. Descarga un backup antes de cerrar.':'',memFallback);}
    else AppStability.status('Tu copia local se conserva. Hay versiones pendientes de revisar; pulsa Sincronizar antes de publicar.',true);
    lastKnownRemoteAt=(remote.meta||{}).updatedAt||0;updateSaveUI();
  }catch(e){safeStoragePaused=true;AppStability.fail(e,raw);}
};
