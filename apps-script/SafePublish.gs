/* Publicación v2: lectura autoritativa, tres versiones y escritura condicionada al SHA leído. */
function _safeGit(){
  var owner=_get('GITHUB_OWNER','artesbuhooficial-max'),repo=_get('GITHUB_REPO','cuadrante-artes-buho');
  var token=_get('GITHUB_TOKEN','');if(!token)throw Error('Falta el token de GitHub en el servidor');
  return {api:'https://api.github.com/repos/'+owner+'/'+repo+'/contents/data/cuadrante-data.json',branch:_get('GITHUB_BRANCH','master'),headers:{'Authorization':'token '+token,'Accept':'application/vnd.github+json','User-Agent':'cuadrante-safe-publish'}};
}
function _safeReadCurrent(){
  var git=_safeGit(),response=UrlFetchApp.fetch(git.api+'?ref='+encodeURIComponent(git.branch),{headers:git.headers,muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw Error('No se pudo leer la versión publicada. No se ha cambiado ningún dato.');
  var data=JSON.parse(response.getContentText());if(!data.sha||!data.content)throw Error('Respuesta de GitHub incompleta');
  var state=JSON.parse(Utilities.newBlob(Utilities.base64Decode(data.content.replace(/\s/g,''))).getDataAsString('UTF-8'));
  if(!SafeSync.valid(state))throw Error('La versión publicada no tiene un formato válido');
  return {state:state,sha:data.sha};
}
function _safeSyncRead(){
  try{var current=_safeReadCurrent(),state=SafeSync.clone(current.state);(state.team||[]).forEach(function(p){p.salary=0;p.rate=0;});return {ok:true,protocol:2,state:state,sha:current.sha};}
  catch(e){return {ok:false,error:String(e.message||e)};}
}
function _safeCommit(state,sha,id){
  var git=_safeGit(),response=UrlFetchApp.fetch(git.api,{method:'put',headers:git.headers,contentType:'application/json',muteHttpExceptions:true,
    payload:JSON.stringify({message:'Cuadrante protegido · '+new Date().toISOString()+' · '+id,content:Utilities.base64Encode(JSON.stringify(state,null,2),Utilities.Charset.UTF_8),branch:git.branch,sha:sha})});
  var code=response.getResponseCode();if(code===409)return {retry:true};
  if(code!==200&&code!==201)return {ok:false,error:'GitHub no confirmó la publicación (HTTP '+code+'). Tus cambios se conservan.'};
  var result=JSON.parse(response.getContentText());return {ok:true,sha:result.content.sha,commitSha:result.commit.sha,updatedAt:state.meta.updatedAt};
}
function _safePublish(body){
  var id=String(body.requestId||'');if(!/^[a-zA-Z0-9_-]{16,80}$/.test(id))return {ok:false,error:'ID de publicación inválido'};
  var key=_get('PUBLISH_KEY',''),result;
  if(!key||String(body.publishKey||'')!==key){result={ok:false,authError:true,error:'Clave de publicación incorrecta'};_savePublishStatus(id,result);return result;}
  var cached=CacheService.getScriptCache().get('publish_'+id);if(cached){var previous=JSON.parse(cached);if(previous.ok)return previous;}
  var lock=LockService.getScriptLock();if(!lock.tryLock(25000)){result={ok:false,error:'Otra publicación está en curso. Tus cambios se conservan; vuelve a intentarlo.'};_savePublishStatus(id,result);return result;}
  try{
    if(!SafeSync.valid(body.state)||!SafeSync.valid(body.base))throw Error('Recarga el cuadrante para activar la publicación protegida. Tus cambios se conservan.');
    var incoming=SafeSync.publicDoc(body.state),base=SafeSync.publicDoc(body.base);
    for(var attempt=0;attempt<3;attempt++){
      var current=_safeReadCurrent(),receipts=(current.state.meta&&current.state.meta.publishReceipts)||[];
      if(receipts.some(function(x){return x.id===id;})){result={ok:true,sha:current.sha,updatedAt:current.state.meta.updatedAt,alreadyCommitted:true};break;}
      var merge=SafeSync.merge(base,incoming,SafeSync.publicDoc(current.state));
      if(merge.conflicts.length){result={ok:false,code:'CONFLICT',conflicts:merge.conflicts.slice(0,100).map(function(c){return c.path;}),error:'Otra persona cambió algunos de los mismos datos. Revisa las dos versiones antes de publicar.'};break;}
      var state=merge.value;if(!SafeSync.valid(state))throw Error('La propuesta de publicación no es válida');
      state.ui=current.state.ui||body.state.ui||{};
      state.meta=Object.assign({},current.state.meta||{},{updatedAt:Math.max(Date.now(),((current.state.meta||{}).updatedAt||0)+1),safePublishVersion:2,dirtyPeople:[],publishReceipts:receipts.concat([{id:id,at:Date.now()}]).slice(-64)});
      result=_safeCommit(state,current.sha,id);
      if(result.retry)continue;
      if(result.ok){
        // ECON conserva su almacén privado; nunca viaja a la versión pública.
        var econ=_json('ECON',{});(body.state.team||[]).forEach(function(p){if(p.salary||p.rate)econ[p.id]={salary:p.salary||0,rate:p.rate||0};});
        try{_setJson('ECON',econ);}catch(e){result.econWarning=true;}
        try{_backupToDrive(JSON.stringify(state,null,2));}catch(e){result.backupWarning=true;}
      }
      break;
    }
    if(result&&result.retry)result={ok:false,code:'RETRY',error:'El archivo cambió durante la publicación. Tus cambios se conservan; vuelve a intentarlo.'};
  }catch(e){result={ok:false,error:String(e.message||e).slice(0,300)};}
  finally{lock.releaseLock();}
  _savePublishStatus(id,result);return result;
}

/* Comprobación manual del despliegue; lee GitHub pero no publica ni altera el trabajo. */
function testSafePublish(){
  var current=_safeReadCurrent();
  var base={team:[{id:'test-a',name:'A',grid:{},projects:[],priorities:[]},{id:'test-b',name:'B',grid:{},projects:[],priorities:[]}],tasks:[]};
  var a=SafeSync.clone(base),b=SafeSync.clone(base);a.team[0].grid.w={slot:{n:'A'}};b.team[1].grid.w={slot:{n:'B'}};
  var first=SafeSync.merge(base,a,base),second=SafeSync.merge(base,b,first.value);
  if(second.conflicts.length||second.value.team[0].grid.w.slot.n!=='A'||second.value.team[1].grid.w.slot.n!=='B')throw Error('Falló la combinación entre personas');
  b=SafeSync.clone(base);b.team[0].grid.w={slot:{n:'Otro'}};
  if(!SafeSync.merge(base,a,b).conflicts.length)throw Error('No se detectó el conflicto');
  var invalid=_safePublish({requestId:Utilities.getUuid().replace(/-/g,''),publishKey:_get('PUBLISH_KEY',''),state:base});
  if(invalid.ok)throw Error('Se permitió publicar sin versión de partida');
  console.log(JSON.stringify({ok:true,protocol:2,readGitHub:true,members:current.state.team.length,concurrentPeople:true,sameCellConflict:true,missingBaseBlocked:true,noWorkPublished:true}));
}
