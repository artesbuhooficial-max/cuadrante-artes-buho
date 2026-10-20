/* Navegador aislado: ningún cambio se manda a Google ni GitHub. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),S=require('../safe-sync.js');
const published=JSON.parse(fs.readFileSync(path.join(root,'data/cuadrante-data.json'),'utf8'));
const KEY='cuadrante_artesbuho_v2',BASE='cuadrante_safe_base_v2';
const files=['index.html','vision-global.html','priorities-report.js','priorities-report.css','voice-priorities.js','voice-priorities.css','voice-ai.js','safe-sync.js','app-stability.js','publication-safe.js','autosave-shared.js'];
let browser,writes=0;
async function setup(options={}){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='POST'&&url.hostname==='script.google.com'&&options.simulator){
      const body=JSON.parse(request.postData());options.simulator.posts.push(body);
      const merged=S.merge(body.base,S.publicDoc(body.state),S.publicDoc(options.simulator.doc));
      assert.equal(merged.conflicts.length,0);options.simulator.doc={...merged.value,meta:{updatedAt:Date.now()}};
      options.simulator.result={ok:true,updatedAt:options.simulator.doc.meta.updatedAt};return route.fulfill({body:''});
    }
    if(request.method()!=='GET'){writes++;return route.abort();}
    if(url.hostname==='cuadrante.test'){
      if(url.pathname==='/data/cuadrante-data.json')return options.offline?route.abort():route.fulfill({json:options.remote||published});
      const file=url.pathname.slice(1)||'index.html';
      if(files.includes(file))return route.fulfill({body:fs.readFileSync(path.join(root,file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
    }
    if(url.hostname==='script.google.com'){
      if(options.gate)await options.gate;
      if(options.offline)return route.abort();
      const result=url.searchParams.get('action')==='publishStatus'&&options.simulator?options.simulator.result:{ok:true,protocol:2,state:options.simulator?options.simulator.doc:options.remote||published};
      const callback=url.searchParams.get('callback');return route.fulfill(callback?{body:callback+'('+JSON.stringify(result)+')',contentType:'text/javascript'}:{json:result});
    }
    if(url.pathname.endsWith('/data/cuadrante-data.json'))return options.offline?route.abort():route.fulfill({json:published});
    return route.abort();
  });
  await page.addInitScript(({local,base,blockedIDB,blockedStorage,globalRaw})=>{
    if(local!==undefined)localStorage.setItem('cuadrante_artesbuho_v2',typeof local==='string'?local:JSON.stringify(local));
    if(base)localStorage.setItem('cuadrante_safe_base_v2',JSON.stringify(base));
    if(base&&local&&typeof local==='object')localStorage.setItem('cuadrante_work_copy_v3',JSON.stringify({version:3,doc:local,base}));
    if(globalRaw)localStorage.setItem('ab_vision_global_v2',globalRaw);
    if(blockedIDB)indexedDB.open=()=>({});
    if(blockedStorage){Storage.prototype.getItem=()=>{throw Error('Storage denied')};Storage.prototype.setItem=()=>{throw Error('Storage denied')};}
  },{local:options.local,base:options.base,blockedIDB:options.blockedIDB,blockedStorage:options.blockedStorage,globalRaw:options.globalRaw});
  const start=Date.now();await page.goto('https://cuadrante.test/'+(options.global?'vision-global.html':'index.html'),{waitUntil:'domcontentloaded'});
  return {context,page,errors,start};
}
async function main(){
  browser=await chromium.launch({channel:'chrome',headless:true});
  let release;const gate=new Promise(resolve=>release=resolve),remote=S.clone(published);
  const peer=remote.team.find(p=>p.id!==published.team[0].id);peer.priorities.push({id:'test-peer',date:'2026-10-14',title:'Prueba aislada',progress:0});
  let t=await setup({local:published,base:S.publicDoc(published),gate,remote,blockedIDB:true});
  await t.page.waitForSelector('#gridTable td',{timeout:3000});assert.ok(Date.now()-t.start<3000,'La red y el archivo bloqueados no deben retrasar la pintura');
  await t.page.evaluate(()=>{state.tasks.push({id:'test-during-boot',owner:state.team[0].id,text:'Edición durante conexión'});save();});
  release();await t.page.waitForFunction(()=>state.team.some(p=>p.priorities.some(x=>x.id==='test-peer')));
  assert.equal(await t.page.evaluate(()=>state.tasks.some(x=>x.id==='test-during-boot')),true);
  for(const tab of ['mes','tareas','calendario','resumen','equipo','notas','cuadrante']){
    await t.page.locator('.tabs [data-tab="'+tab+'"]').click();assert.equal(await t.page.locator('#view-'+tab).isVisible(),true);
  }
  await t.page.evaluate(()=>{switchTab('tareas');['todo','recur','extra','hitos'].forEach(s=>switchTaskSub(s));});
  await t.page.evaluate(()=>{state.team.forEach(p=>{state.ui.person=p.id;switchTab('cuadrante');switchTab('mes');switchTab('calendario');});state.ui.monthRef={y:2026,m:11};calMove(1);calMove(-1);});
  assert.deepEqual(await t.page.evaluate(()=>state.ui.monthRef),{y:2026,m:11});
  await t.page.evaluate(()=>{window.keyResult=askPublishKey();closeModal();});
  assert.equal(await t.page.evaluate(()=>window.keyResult),'');
  await t.page.evaluate(()=>{const b=SafeSync.publicDoc(state),a=SafeSync.clone(b),c=SafeSync.clone(b);a.team[0].name='A';c.team[0].name='B';window.conflictResult=safeResolve(b,a,c);});
  assert.equal(await t.page.locator('#modalHost select').count()>0,true);
  await t.page.evaluate(()=>closeModal());assert.equal(await t.page.evaluate(()=>window.conflictResult),null);
  await t.page.evaluate(()=>{openSettings();closeModal();voiceOpen();voiceClose();});
  assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK navegador: pintura inmediata con red/IndexedDB bloqueados, ediciones durante arranque, 7 pestañas, 4 tipos de tareas, todos los miembros, cambio de año, cierre de diálogos y voz.');
  t=await setup({local:'{"team":',offline:true});
  assert.match(await t.page.locator('#appHealthText').innerText(),/no se han sustituido/i);
  assert.equal(await t.page.evaluate(()=>localStorage.getItem('cuadrante_artesbuho_v2')),'{"team":');
  assert.equal(await t.page.locator('#appRecoveryDownload').isVisible(),true);assert.deepEqual(t.errors,[]);await t.context.close();
  const broken=S.clone(published);broken.ui={tab:'missing',weekId:'bad',monthRef:{y:2026,m:999},resRef:null};broken.config.startHour=-1;broken.config.endHour=1e12;
  t=await setup({local:broken,offline:true});await t.page.waitForSelector('#gridTable td',{timeout:3000});
  assert.equal(await t.page.evaluate(()=>state.config.endHour<=24),true);assert.deepEqual(t.errors,[]);await t.context.close();
  t=await setup({blockedStorage:true});await t.page.waitForSelector('#gridTable td');await t.page.waitForFunction(()=>!safeStoragePaused);assert.deepEqual(t.errors,[]);await t.context.close();
  t=await setup({});await t.page.waitForFunction(()=>!safeStoragePaused);assert.equal(await t.page.evaluate(()=>state.team.length),published.team.length);assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK navegador: copia corrupta recuperable, preferencias inválidas, horas acotadas, almacenamiento denegado y primer acceso sin datos locales.');
  t=await setup({global:true});await t.page.waitForFunction(()=>cuad&&cuad.team.length>0);
  await t.page.evaluate(()=>['global','proyectos','personas','paralelo','previsiones','conflictos'].forEach(v=>go(v)));
  assert.deepEqual(t.errors,[]);await t.context.close();assert.equal(writes,0);
  t=await setup({global:true,blockedStorage:true});await t.page.waitForFunction(()=>cuad&&cuad.team.length>0);assert.deepEqual(t.errors,[]);await t.context.close();
  t=await setup({global:true,globalRaw:'{"forecasts":null}'});await t.page.waitForFunction(()=>cuad&&cuad.team.length>0);assert.equal(await t.page.getByText('Descargar copia original',{exact:true}).isVisible(),true);assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK navegador: seis vistas de Visión Global. Ninguna publicación ni escritura externa durante las pruebas.');
  const latest=S.clone(published),ancient=S.clone(published),owner=latest.team[0],other=latest.team[1],week='2026-10-12',project=owner.projects[0].id;
  owner.grid[week]={'0-18':{p:project,n:'Nota ya publicada'},'3-20':{p:project,n:'Conservar bloque remoto'}};
  ancient.team[0].grid[week]={'0-18':{p:project,n:'Mi nota corregida'},'2-20':{p:project,n:'Mi bloque nuevo'}};
  ancient.team[1].grid={};other.grid[week]={'1-22':{p:other.projects[0].id,n:'Trabajo reciente del compañero'}};
  latest.tasks.push({id:'qa-remote-only',owner:owner.id,text:'Tarea publicada que no puede borrarse'});
  ancient.tasks.push({id:'qa-local-only',owner:owner.id,text:'Mi tarea nueva'});
  const simulator={doc:latest,posts:[],result:null};t=await setup({local:ancient,simulator});
  await t.page.waitForSelector('#gridTable td');await t.page.locator('#publishBtn').click();
  await t.page.waitForSelector('#safeLegacyPerson');await t.page.locator('#safeLegacyPerson').selectOption(owner.id);
  await t.page.getByRole('button',{name:'Revisar mis cambios',exact:true}).click();await t.page.waitForSelector('#safeChoice0');
  assert.equal(await t.page.evaluate(()=>safeConflictData.conflicts.some(c=>c.path[0]==='team'&&c.path[1]==='@'+state.team[1].id)),false);
  const slotIndex=await t.page.evaluate(()=>safeConflictData.conflicts.findIndex(c=>c.path.at(-1)==='0-18'));
  assert.ok(slotIndex>=0);await t.page.locator('#safeChoice'+slotIndex).selectOption('mine');
  await t.page.getByRole('button',{name:'Combinar y continuar',exact:true}).click();await t.page.waitForSelector('#publishKeyInput');
  await t.page.locator('#publishKeyInput').fill('clave-ficticia-solo-prueba');await t.page.getByRole('button',{name:'Publicar',exact:true}).click();
  await t.page.waitForFunction(()=>!safePublishing);assert.equal(simulator.posts.length,1);
  assert.deepEqual(simulator.doc.team[1],other);assert.equal(simulator.doc.team[0].grid[week]['0-18'].n,'Mi nota corregida');
  assert.ok(simulator.doc.team[0].grid[week]['2-20']);assert.ok(simulator.doc.team[0].grid[week]['3-20']);
  assert.ok(simulator.doc.tasks.some(x=>x.id==='qa-local-only'));assert.ok(simulator.doc.tasks.some(x=>x.id==='qa-remote-only'));
  assert.equal(await t.page.evaluate(()=>!!sessionStorage.getItem('cuadrante_legacy_original_v3')),true);
  // Una vez establecida la base, la siguiente publicación es automática para
  // cambios compatibles y vuelve a respetar novedades llegadas de un compañero.
  simulator.doc.team[1].grid[week]['4-22']={p:other.projects[0].id,n:'Nuevo del compañero entre publicaciones'};
  await t.page.evaluate(()=>{state.tasks.push({id:'qa-second-publish',owner:state.team[0].id,text:'Segundo cambio propio'});save();});
  await t.page.locator('#publishBtn').click();await t.page.waitForFunction(()=>!safePublishing);
  assert.equal(simulator.posts.length,2);assert.ok(simulator.doc.tasks.some(x=>x.id==='qa-second-publish'));
  assert.equal(simulator.doc.team[1].grid[week]['4-22'].n,'Nuevo del compañero entre publicaciones');
  assert.equal(await t.page.locator('#safeLegacyPerson').count(),0);
  await t.page.evaluate(()=>safeOpenHistory());assert.equal(await t.page.getByRole('button',{name:'Descargar copia original protegida',exact:true}).isVisible(),true);
  await t.page.evaluate(()=>closeModal());
  assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK navegador: publicación antigua simulada de principio a fin; compañero idéntico, corrección propia, bloques nuevos y remotos conservados, tareas unidas y copia original protegida.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
