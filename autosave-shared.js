/* Autoguardado compartido: conserva el formato, los datos y el servidor publish2. */
var SharedAutosave=(function(){
  const PREFIX='cuadrante_shared_outbox_v1_',TAB_KEY='cuadrante_shared_tab_v1';
  const DELAY=2500,MIN_SEND=10000,POLL=45000,LEASE=90000,EXPIRE=240000;
  let tabId='',started=false,initialized=false,booting=false,applying=0,running=false,reading=false,recovering=false;
  let timer=null,pollTimer=null,heartbeat=null,lastSend=0,retryAt=0,failures=0;
  let observed=null,observedBase=null,userChanged=false,attemptedAuth=false,review=false,recovery=null,error='',storageError=false,confirmedAt=0;
  const originalStore=storeSet,originalSaveUI=updateSaveUI,originalInstall=safeInstall;
  const originalSet=safeSet,originalClear=safeClearPending,originalBoot=boot,originalPublish=publishViaAppsScript;
  const clone=x=>SafeSync.clone(x),pub=x=>SafeSync.publicDoc(x),same=(a,b)=>SafeSync.equal(a,b);
  function uid(){return crypto.randomUUID().replace(/-/g,'');}
  function online(){return typeof navigator==='undefined'||navigator.onLine!==false;}
  function visible(){return document.visibilityState!=='hidden';}
  function dirty(){return !!(safeBase&&!same(pub(state),safeBase));}
  function pending(){return safeGet(SAFE_PENDING_KEY);}
  function get(id){try{return JSON.parse(localStorage.getItem(PREFIX+id)||'null');}catch(e){return null;}}
  function put(record){localStorage.setItem(PREFIX+record.id,JSON.stringify(record));}
  function records(){
    const found=[];try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key||!key.startsWith(PREFIX))continue;try{const r=JSON.parse(localStorage.getItem(key)||'null');if(r&&r.version===1&&r.doc&&SafeSync.valid(r.doc))found.push(r);}catch(e){/* La copia ilegible se conserva; no oculta las demás. */}}}catch(e){}
    return found.sort((a,b)=>(a.at||0)-(b.at||0));
  }
  function record(kind,id,envelope){
    const old=get(id);return {version:1,id,kind,ownerTab:tabId,at:old&&old.at||Date.now(),seenAt:Date.now(),doc:clone(state),base:clone(safeBase),...(envelope?{envelope:{action:'publish2',requestId:envelope.requestId,createdAt:envelope.createdAt,state:pub(envelope.state),base:pub(envelope.base)}}:{})};
  }
  function warnStorage(){storageError=true;AppStability.status('El navegador no permite proteger todos los cambios pendientes. Descarga un backup desde Ajustes antes de cerrar. No se enviarán cambios sin una copia segura.',true);}
  function persistDraft(){
    if(!started||booting||safeStoragePaused||AppStability.isFatal())return false;
    try{
      const p=pending();if(p){const old=get(p.requestId);if(!old||old.ownerTab===tabId)put({...record('pending',p.requestId,p),kind:old&&old.kind==='blocked'?'blocked':'pending'});}
      if(!safeBase||dirty())put(record('draft','draft-'+tabId));
      else localStorage.removeItem(PREFIX+'draft-'+tabId);
      storageError=false;return true;
    }catch(e){warnStorage();return false;}
  }
  function safeToInteract(){
    const host=document.getElementById('modalHost'),active=document.activeElement;
    return visible()&&!(host&&host.firstChild)&&!(active&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))&&
      !(typeof voiceListening!=='undefined'&&voiceListening)&&!(typeof voiceAiBusy!=='undefined'&&voiceAiBusy);
  }
  function show(){
    originalSaveUI();if(!started)return;const pill=document.getElementById('saveStatus');if(!pill)return;
    let text;
    if(storageError)text='⚠ Copia local incompleta · descargar backup';
    else if(review||recovery)text='⚠ Cambios conservados · revisar';
    else if(safePublishing||running)text='☁ Guardando en el servidor…';
    else if(!online())text='● Sin conexión · guardado en este dispositivo';
    else if(error)text='● Guardado local · reintentando conexión';
    else if((dirty()||pending())&&attemptedAuth&&!_publishKey)text='● Guardado local · pulsa para introducir la clave';
    else if(!safeBase)text='● Revisión inicial · activar autoguardado';
    else if((dirty()||pending())&&!_publishKey)text='● Guardado local · activar autoguardado';
    else if(dirty()||pending())text='☁ Cambios guardados localmente · envío pendiente';
    else if(confirmedAt)text='✓ Guardado en el servidor · '+new Date(confirmedAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    else text='✓ Sin cambios pendientes';
    pill.textContent=text; pill.title='Autoguardado compartido. Pulsa para conectar, reintentar o revisar. La clave compartida se solicita una vez por sesión y no se almacena.';
    pill.className='save-pill '+(storageError||review||recovery||error||dirty()||pending()?'dirty':safeBase?'ok':'');
    pill.setAttribute('aria-live','polite');
    pill.setAttribute('role','button');pill.setAttribute('tabindex','0');pill.style.cursor='pointer';pill.onclick=connect;
    pill.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();connect();}};
    const button=document.getElementById('publishBtn');if(button)button.title='El autoguardado envía los cambios automáticamente. Este botón conserva la publicación manual y la revisión de versiones.';
  }
  function arm(delay=DELAY){
    clearTimeout(timer);if(!started||booting)return;
    timer=setTimeout(()=>{timer=null;flush().catch(e=>failed(e.message));},Math.max(delay,retryAt-Date.now(),lastSend+MIN_SEND-Date.now(),0));
  }
  function failed(message){error=String(message||'Conexión pendiente');failures++;retryAt=Date.now()+Math.min(300000,5000*Math.pow(2,Math.min(failures,6)));show();arm();}
  function handle(result){
    if(!result)return;
    if(result.ok){error='';failures=0;retryAt=0;review=false;confirmedAt=result.updatedAt||Date.now();persistDraft();}
    else if(result.code==='CONFLICT'||result.code==='REVIEW'){review=true;error='';}
    else if(result.code==='AUTH'){_publishKey='';attemptedAuth=true;error='';}
    else if(result.code==='RETRY')failed(result.error);
    show();
  }
  async function owner(){
    let previous;try{previous=sessionStorage.getItem(TAB_KEY);}catch(e){}
    tabId=previous||uid();
    if(typeof navigator!=='undefined'&&navigator.locks){
      const claim=()=>new Promise(resolve=>{
        navigator.locks.request('cuadrante-tab-'+tabId,{ifAvailable:true},lock=>{
          resolve(!!lock);if(!lock)return;
          return new Promise(release=>window.addEventListener('pagehide',release,{once:true}));
        }).catch(()=>resolve(false));
      });
      if(!await claim()){tabId=uid();try{sessionStorage.removeItem(SAFE_PENDING_KEY);}catch(e){}await claim();}
    }else{
      // Sin Web Locks no se reutiliza un identificador que puede estar en otra pestaña.
      tabId=uid();const p=pending();if(p&&get(p.requestId)){try{sessionStorage.removeItem(SAFE_PENDING_KEY);}catch(e){}}
    }
    try{sessionStorage.setItem(TAB_KEY,tabId);}catch(e){}
  }
  async function withOwner(record,work){
    if(record.ownerTab===tabId)return work();
    if(typeof navigator!=='undefined'&&navigator.locks){
      return navigator.locks.request('cuadrante-tab-'+record.ownerTab,{ifAvailable:true},lock=>lock?work():false);
    }
    if(Date.now()-(record.seenAt||record.at||0)<LEASE)return false;
    return work();
  }
  function archive(record){put({...record,kind:'archive',adoptedBy:tabId,adoptedAt:Date.now()});}
  async function recoverOne(record,interactive){
    return withOwner(record,async()=>{
      const latest=get(record.id);if(!latest||latest.kind==='archive')return false;
      if(latest.ownerTab!==record.ownerTab)return false;
      if(latest.envelope&&latest.kind==='pending'&&pending()&&pending().requestId!==latest.envelope.requestId)return false;
      const base=latest.base||latest.envelope&&latest.envelope.base;
      if(!safeBase){recovery=latest.id;show();return false;}
      const mine=pub(latest.doc),current=pub(state),proposal=SafeSync.merge(base,mine,current);
      let merged=proposal.value;
      if(!base){
        recovery=latest.id;show();if(!interactive)return false;
        const scope=await safeAskLegacyScope();if(!scope)return false;
        merged=await safeResolve(null,mine,pub(state),scope);if(!merged)return false;
      }else if(proposal.conflicts.length){
        recovery=latest.id;show();if(!interactive)return false;
        merged=await safeResolve(base,mine,current);if(!merged)return false;
      }
      if(!same(merged,current)){
        safeSnapshot('Antes de recuperar un autoguardado pendiente');safeInstall(merged,state);
      }
      if(!persistDraft())return false;
      if(latest.envelope&&latest.kind==='pending'){
        safeSet(SAFE_PENDING_KEY,latest.envelope);
      }else archive(latest);
      recovery=null;return true;
    });
  }
  async function recover(interactive=false){
    if(!started||safePublishing||safeSyncing||recovering||!safeToInteract())return;
    recovering=true;
    try{
    if(recovery){const r=get(recovery);if(!r||r.kind==='archive')recovery=null;}
    const p=pending();
    const list=records().filter(r=>r.kind!=='archive'&&(r.kind!=='blocked'||interactive)).sort((a,b)=>Number(b.id===(p&&p.requestId))-Number(a.id===(p&&p.requestId)));
    for(const r of list){
      if(r.id==='draft-'+tabId||p&&r.id===p.requestId){
        // El borrador de la pestaña actual es más reciente que una instantánea previa.
        if(same(pub(r.doc),pub(state)))continue;
      }
      if(await recoverOne(r,interactive)){if(pending())break;}
      if(recovery)break;
    }
    }finally{recovering=false;}
  }
  async function refresh(){
    if(!started||booting||reading||running||safePublishing||safeSyncing||!online()||!safeToInteract()||safeStoragePaused||AppStability.isFatal())return;
    reading=true;const baseAtStart=safeBase;
    try{
      const remote=await safeReadRemote(),theirs=pub(remote.state),mine=pub(state);
      // No instalar nada sobre un formulario abierto ni una operación más reciente.
      if(running||safePublishing||safeSyncing||safeBase!==baseAtStart||!safeToInteract())return;
      if(!safeBase){
        if(same(mine,theirs)){safeSaveBase(theirs);originalStore(state);confirmedAt=Date.now();}
        return;
      }
      const proposal=SafeSync.merge(safeBase,mine,theirs);
      if(proposal.conflicts.length){review=true;return;}
      safeSaveBase(theirs);
      if(!same(proposal.value,mine))safeInstall(proposal.value,remote.state);else originalStore(state);
      if(same(pub(state),theirs))confirmedAt=Date.now();persistDraft();
    }catch(e){if(dirty()||pending())error=e.message;}
    finally{reading=false;show();}
  }
  async function connect(){
    if(running||safePublishing||safeSyncing)return;
    if(!safeToInteract()){toast('Cierra el formulario actual antes de activar o revisar el autoguardado.');return;}
    attemptedAuth=true;running=true;retryAt=0;
    try{
      // Una copia antigua necesita primero la misma revisión acotada que Publicar.
      // Nunca se le inventa una base que pueda convertir ausencias en borrados.
      if(!safeBase&&!(await safeRebase()))return;
      await recover(true);if(recovery){toast('La copia recuperable sigue protegida en Ajustes → Copias locales recientes.');return;}
      if(!_publishKey){const key=await askPublishKey({title:'Activar autoguardado compartido',button:'Conectar',hint:'Introduce la clave compartida de publicación de la oficina. Se usa solo durante esta sesión y no se guarda en el navegador.'});if(!key)return;_publishKey=key;}
      const result=await publishViaAppsScript();
      if(result&&result.ok){review=false;userChanged=false;}
    }catch(e){failed(e.message);}
    finally{running=false;show();if(dirty()||pending())arm();}
  }
  async function flush(){
    if(!started||booting||running||safePublishing||safeSyncing||reading||!online()||!visible()||safeStoragePaused||AppStability.isFatal())return;
    if(Date.now()<retryAt||Date.now()<lastSend+MIN_SEND){arm();return;}
    await recover();if(review||recovery||storageError){show();return;}
    if(!dirty()&&!pending()&&safeBase)return;
    if(!safeBase||!_publishKey){
      show();if(userChanged&&!attemptedAuth&&safeToInteract())await connect();return;
    }
    running=true;lastSend=Date.now();show();
    try{await publishViaAppsScript({automatic:true});}
    catch(e){failed(e.message);}
    finally{running=false;show();if((dirty()||pending())&&!review&&_publishKey&&!storageError)arm();}
  }
  function changed(){
    if(!started||booting||applying)return;
    const current=pub(state),dataChanged=!same(current,observed);if(!dataChanged&&observedBase===safeBase)return;
    observed=current;observedBase=safeBase;if(dataChanged)userChanged=true;persistDraft();show();if(dataChanged||dirty()||pending())arm();
  }
  storeSet=function(doc){originalStore(doc);if(started&&!booting&&!applying)changed();};
  updateSaveUI=show;
  safeInstall=function(doc,remote){applying++;try{return originalInstall(doc,remote);}finally{applying--;if(started){observed=pub(state);observedBase=safeBase;persistDraft();show();}}};
  safeSet=function(key,value){
    if(key===SAFE_PENDING_KEY&&started){
      // Escritura duradera antes del POST, sin ninguna clave en el sobre guardado.
      try{put(record('pending',value.requestId,value));}catch(e){warnStorage();throw Error('No se pudo proteger el envío. Descarga un backup antes de publicar.');}
    }
    return originalSet(key,value);
  };
  safeClearPending=function(){
    const p=pending(),r=p&&get(p.requestId);
    originalClear();
    if(r&&r.ownerTab===tabId&&r.kind==='pending'){
      try{
        const bundle=JSON.parse(localStorage.getItem(SAFE_WORK_KEY)||'null');
        if(bundle&&same(bundle.base,safeBase)&&same(pub(bundle.doc),pub(state)))localStorage.removeItem(PREFIX+r.id);
      }catch(e){warnStorage();}
    }
  };
  async function checkOldPending(options){
    const p=pending();if(!p||safePublishing||safeSyncing)return null;
    const age=Date.now()-p.createdAt;
    if(Number.isFinite(age)&&age>=-60000&&age<EXPIRE)return null;
    // El servidor recuerda recibos recientes, no una lista infinita. Fuera de
    // esa ventana no se reejecuta a ciegas una petición antigua (p. ej. borrar).
    safeSyncing=true;show();
    try{
      const remote=await safeReadRemote(),theirs=pub(remote.state);
      if((remote.state.meta&&remote.state.meta.publishReceipts||[]).some(r=>r.id===p.requestId)){
        safeSaveBase(pub(p.state));originalStore(state);persistDraft();safeClearPending();
        return {ok:true,updatedAt:remote.state.meta.updatedAt,requestId:p.requestId,alreadyCommitted:true};
      }
      blockPending('unconfirmed-old');
      if(options.automatic)return {ok:false,code:'REVIEW'};
      toast('Este envío antiguo no se puede confirmar. Revisa solo tu trabajo; lo del resto se conservará.');
      const merged=await safeResolveLive(null,theirs);if(!merged)return {ok:false,code:'REVIEW'};
      safeSnapshot('Antes de revisar un envío antiguo sin confirmar');
      const r=get(p.requestId);if(r)archive({...r,doc:clone(state)});
      originalClear(); // La copia archivada no se borra al retirar el envío.
      safeSaveBase(theirs);safeInstall(merged,remote.state);review=false;recovery=null;
      return null;
    }finally{safeSyncing=false;show();}
  }
  publishViaAppsScript=async function(options={}){
    let result;
    try{result=await checkOldPending(options)||await originalPublish(options);}
    catch(e){result={ok:false,code:'RETRY',error:e.message};}
    if(result&&!result.unchanged&&!['BUSY','CANCELLED','SETUP'].includes(result.code))lastSend=Date.now();
    handle(result);
    if(!options.automatic&&result&&result.ok){
      review=false;error='';
      // Una revisión explícita ya terminada no vuelve a atascarse con su copia
      // anterior: se archiva íntegra y sigue siendo descargable desde Ajustes.
      try{for(const r of records())if(r.kind==='blocked'&&r.ownerTab===tabId)archive(r);}catch(e){warnStorage();}
      await recover();
    }
    return result;
  };
  boot=async function(){
    await owner();booting=true;const work=originalBoot();booting=false;started=true;observed=pub(state);observedBase=safeBase;show();
    await work;
    if(!AppStability.isFatal()){
      await refresh();await recover();show();
      startTimers();
      if(pending())arm();
    }
    initialized=true;
  };
  function startTimers(){
    clearInterval(pollTimer);clearInterval(heartbeat);
    pollTimer=setInterval(()=>{refresh().then(()=>recover()).then(()=>{if(dirty()||pending())arm();}).catch(()=>{});},POLL);
    heartbeat=setInterval(()=>{persistDraft();if(dirty()||pending())arm();},15000);
  }
  function flushInput(){
    const active=document.activeElement;if(active&&/^(INPUT|TEXTAREA)$/.test(active.tagName)&&active.type!=='password')active.blur();
    persistDraft();
  }
  function blockPending(reason){const p=pending();if(!p)return;const r=get(p.requestId);if(r)put({...r,kind:'blocked',reason,doc:clone(state),seenAt:Date.now()});review=true;}
  function afterPublish(){if(started){observed=pub(state);observedBase=safeBase;persistDraft();show();if(dirty()||pending())arm();}}
  function recoveryCopies(){return records().map(r=>({id:r.id,at:r.at,reason:'Autoguardado '+(r.kind==='archive'?'recuperado':r.kind==='blocked'?'en revisión':'pendiente'),doc:r.doc,base:r.base}));}
  function useCopy(id){const r=get(id);if(r)safeChooseBackup(r.doc);else toast('Copia no disponible');}
  function downloadCopy(id){
    const r=get(id);if(!r){toast('Copia no disponible');return;}
    const url=URL.createObjectURL(new Blob([JSON.stringify(r.doc,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='cuadrante-autoguardado-'+r.at+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(typeof window.addEventListener==='function'){
    window.addEventListener('online',()=>{retryAt=0;error='';refresh().finally(()=>arm(0));});
    window.addEventListener('offline',show);
    window.addEventListener('focus',()=>{refresh().finally(()=>arm());});
    window.addEventListener('pagehide',()=>{flushInput();clearTimeout(timer);clearInterval(pollTimer);clearInterval(heartbeat);started=false;});
    window.addEventListener('pageshow',e=>{if(e.persisted)owner().then(()=>{started=true;startTimers();return refresh();}).then(()=>arm(0)).catch(e=>failed(e.message));});
    window.addEventListener('beforeunload',e=>{if(started&&(dirty()||pending())){persistDraft();e.preventDefault();e.returnValue='';}});
    document.addEventListener('visibilitychange',()=>{if(!visible()){flushInput();if(_publishKey)flush();}else refresh().finally(()=>arm(0));});
  }
  return {flush,refresh,connect,recover,afterPublish,blockPending,recoveryCopies,useCopy,downloadCopy,records,
    status:()=>({started,initialized,booting,reading,tabId,running,review,recovery,error,storageError,confirmedAt})};
})();
