/* Pruebas aisladas del autoguardado real. Se intercepta TODA la red. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),S=require('../safe-sync.js');
const root=path.join(__dirname,'..'),published=JSON.parse(fs.readFileSync(path.join(root,'data/cuadrante-data.json'),'utf8'));
const KEY='cuadrante_artesbuho_v2',WORK='cuadrante_work_copy_v3',PREFIX='cuadrante_shared_outbox_v1_',ACCESS='cuadrante_publish_access_v1';
const files=['index.html','priorities-report.js','priorities-report.css','voice-priorities.js','voice-priorities.css','voice-ai.js','safe-sync.js','app-stability.js','publication-safe.js','autosave-shared.js'];
let browser,contexts=[],externalWrites=0;const times=new WeakMap();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){const end=Date.now()+12000;while(Date.now()<end){if(await predicate())return;await sleep(30);}throw Error('Tiempo agotado: '+label);}
function simulator(){return {doc:S.clone(published),posts:[],results:new Map(),offline:false,lost:false,hold:null,commits:0};}
async function setup(sim,options={}){
  const context=await browser.newContext(options.storageState?{storageState:options.storageState}:{});contexts.push(context);const errors=[];
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='cuadrante.test'&&req.method()==='GET'){
      if(url.pathname==='/data/cuadrante-data.json')return route.fulfill({json:sim.doc});
      const file=url.pathname.slice(1)||'index.html';if(files.includes(file))return route.fulfill({body:fs.readFileSync(path.join(root,file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
    }
    if(url.hostname==='script.google.com'){
      if(sim.offline)return route.abort();
      if(req.method()==='POST'){
        const body=JSON.parse(req.postData());sim.posts.push(body);if(sim.hold)await sim.hold;
        let result=sim.results.get(body.requestId);
        if(!result||!result.ok){
          if(body.publishKey!=='clave-ficticia-prueba')result={ok:false,authError:true,error:'Clave incorrecta'};
          else{
            const proposal=S.merge(body.base,S.publicDoc(body.state),S.publicDoc(sim.doc));
            if(proposal.conflicts.length)result={ok:false,code:'CONFLICT'};
            else{sim.doc={...proposal.value,ui:sim.doc.ui,meta:{updatedAt:Date.now(),publishReceipts:(sim.doc.meta.publishReceipts||[]).concat([{id:body.requestId,at:Date.now()}]).slice(-64)}};sim.commits++;result={ok:true,updatedAt:sim.doc.meta.updatedAt};}
          }
          sim.results.set(body.requestId,result);
        }
        if(sim.lost){sim.lost=false;return route.abort();}
        return route.fulfill({body:''});
      }
      const result=url.searchParams.get('action')==='publishStatus'?sim.results.get(url.searchParams.get('id'))||{pending:true}:{ok:true,protocol:2,state:sim.doc};
      const cb=url.searchParams.get('callback');return route.fulfill(cb?{body:cb+'('+JSON.stringify(result)+')',contentType:'text/javascript'}:{json:result});
    }
    if(req.method()!=='GET')externalWrites++;
    return route.abort();
  });
  const page=await context.newPage();
  await page.addInitScript(({doc,base,unknown,blocked,remembered,blockedAccess})=>{
    if(!localStorage.getItem('cuadrante_artesbuho_v2')){
      localStorage.setItem('cuadrante_artesbuho_v2',JSON.stringify(doc));
      if(!unknown)localStorage.setItem('cuadrante_work_copy_v3',JSON.stringify({version:3,doc,base}));
      if(remembered)localStorage.setItem('cuadrante_publish_access_v1',remembered);
    }
    if(blocked){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('cuadrante_shared_outbox_v1_'))throw Error('QuotaExceededError');return set.call(this,k,v);};}
    if(blockedAccess){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='cuadrante_publish_access_v1')throw Error('Access denied');return set.call(this,k,v);};}
  },{doc:options.local||sim.doc,base:S.publicDoc(sim.doc),unknown:options.unknown,blocked:options.blocked,remembered:options.remembered,blockedAccess:options.blockedAccess});
  await page.goto('https://cuadrante.test/');await ready(page);
  return {context,page,errors};
}
async function ready(page){await until(()=>page.evaluate(()=>typeof SharedAutosave!=='undefined'&&SharedAutosave.status().initialized&&!safeStoragePaused),'arranque de autoguardado');}
async function idle(page){await until(()=>page.evaluate(()=>!safePublishing&&!SharedAutosave.status().running),'fin de publicación');}
async function tick(page){const time=(times.get(page)||Date.now())+60000;times.set(page,time);await page.clock.setFixedTime(new Date(time));}
async function edit(page,id,personIndex=0){await page.evaluate(({id,personIndex})=>{state.tasks.push({id,owner:state.team[personIndex].id,text:'Trabajo '+id});save();},{id,personIndex});}
async function send(page){await sleep(30);await until(()=>page.evaluate(()=>!SharedAutosave.status().reading&&!SharedAutosave.status().running),'conexión libre');await tick(page);await page.evaluate(()=>SharedAutosave.flush());await idle(page);}
async function authorize(page){await page.evaluate(()=>SharedAutosave.rememberKey('clave-ficticia-prueba'));}
function has(sim,id){return sim.doc.tasks.some(x=>x.id===id);}
async function main(){
  browser=await chromium.launch({channel:'chrome',headless:true});
  let sim=simulator(),t=await setup(sim);
  assert.equal(await t.page.evaluate(()=>!!document.querySelector('#gridTable').closest('.grid-card').nextElementSibling.matches('#priorityBoard')),true);
  await edit(t.page,'auto-primero');await t.page.waitForSelector('#publishKeyInput');
  await t.page.locator('#publishKeyInput').fill('clave-ficticia-prueba');await t.page.getByRole('button',{name:'Conectar',exact:true}).click();
  await until(()=>has(sim,'auto-primero'),'primer guardado con clave');await idle(t.page);assert.equal(sim.posts.length,1);
  assert.equal(await t.page.evaluate(key=>localStorage.getItem(key),ACCESS),'clave-ficticia-prueba');
  assert.equal(await t.page.evaluate(()=>JSON.stringify({doc:state,base:safeBase,pending:safeGet(SAFE_PENDING_KEY),history:safeGet(SAFE_HISTORY_KEY),copies:SharedAutosave.records()}).includes('clave-ficticia-prueba')),false,'La clave recordada no entra en datos, backups ni diarios');
  await t.page.evaluate(()=>{state.ui.person=state.team[1].id;save();});await send(t.page);assert.equal(sim.posts.length,1,'Cambiar de persona no publica');
  await edit(t.page,'auto-segundo');await edit(t.page,'auto-tercero');await t.page.evaluate(()=>{state.team[0].salary=999;state.team[0].rate=99;});
  await send(t.page);assert.equal(sim.posts.length,2);assert.ok(has(sim,'auto-segundo')&&has(sim,'auto-tercero'));
  assert.ok(sim.posts.at(-1).state.team.every(p=>p.salary===0&&p.rate===0),'El autoguardado no envía importes privados');
  const persisted=await t.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('cuadrante_shared_outbox_v1_')).map(k=>localStorage.getItem(k)).join(''));
  assert.ok(!persisted.includes('clave-ficticia-prueba')&&!persisted.includes('publishKey'));
  console.log('OK autoguardado: clave una vez, cambios agrupados, navegación sin publicar, importes privados excluidos y prioridades debajo del horario.');

  // Edición durante una petición en vuelo: confirmación del primer estado no borra la posterior.
  let release;sim.hold=new Promise(resolve=>release=resolve);await edit(t.page,'en-vuelo');await tick(t.page);
  const sending=t.page.evaluate(()=>SharedAutosave.flush());await until(()=>sim.posts.some(x=>x.state.tasks.some(y=>y.id==='en-vuelo')),'petición retenida');
  await edit(t.page,'posterior');release();sim.hold=null;await sending;await idle(t.page);
  assert.equal(await t.page.evaluate(()=>state.tasks.some(x=>x.id==='posterior')),true);await send(t.page);assert.ok(has(sim,'posterior'));
  // Resultado perdido: el servidor ya guardó, se reenvía el mismo ID y no duplica.
  sim.lost=true;await edit(t.page,'respuesta-perdida');await send(t.page);const lostId=sim.posts.at(-1).requestId,commits=sim.commits;
  assert.equal(await t.page.evaluate(()=>!!safeGet(SAFE_PENDING_KEY)),true);await send(t.page);
  assert.equal(sim.posts.at(-1).requestId,lostId);assert.equal(sim.commits,commits);assert.equal(await t.page.evaluate(()=>!!safeGet(SAFE_PENDING_KEY)),false);
  console.log('OK autoguardado: conserva ediciones durante el envío y reintenta el mismo envío sin duplicar si se pierde la respuesta.');

  // La falta de red no lanza POST ni borra cambios. Vuelve a enviar al recuperar conexión.
  await t.context.setOffline(true);sim.offline=true;const before=sim.posts.length;await edit(t.page,'sin-red');await t.page.evaluate(()=>SharedAutosave.flush());
  assert.equal(sim.posts.length,before);assert.ok(await t.page.evaluate(()=>SharedAutosave.records().some(r=>r.doc.tasks.some(x=>x.id==='sin-red'))));
  sim.offline=false;await t.context.setOffline(false);await send(t.page);assert.ok(has(sim,'sin-red'));
  assert.deepEqual(t.errors,[]);const rememberedState=await t.context.storageState();await t.context.close();
  console.log('OK autoguardado: copia duradera sin conexión y reanudación posterior.');

  sim.doc.tasks.push({id:'novedad-al-reabrir',owner:sim.doc.team[1].id,text:'Publicado por compañero'});
  t=await setup(sim,{storageState:rememberedState});
  assert.equal(await t.page.evaluate(()=>_publishKey==='clave-ficticia-prueba'),true);
  assert.equal(await t.page.evaluate(()=>state.tasks.some(x=>x.id==='novedad-al-reabrir')),true);
  await edit(t.page,'automático-al-reabrir');await until(()=>has(sim,'automático-al-reabrir'),'guardado sin pedir clave ni pulsar botones después de reabrir');await idle(t.page);
  assert.equal(await t.page.locator('#publishKeyInput').count(),0);
  const beforeForget=await t.page.evaluate(()=>JSON.stringify(SafeSync.publicDoc(state)));
  await t.page.evaluate(()=>openSettings());await t.page.getByRole('button',{name:'Olvidar clave de este dispositivo',exact:true}).click();
  assert.equal(await t.page.evaluate(key=>localStorage.getItem(key),ACCESS),null);assert.equal(await t.page.evaluate(()=>_publishKey),'');
  assert.equal(await t.page.evaluate(()=>JSON.stringify(SafeSync.publicDoc(state))),beforeForget);
  await t.page.evaluate(()=>closeModal());assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK acceso recordado: reabre con sincronización y guardado totalmente automáticos, sin diálogo; olvidar la clave no borra trabajo.');

  // Dos dispositivos parten de la misma base y guardan personas y celdas distintas.
  sim=simulator();let a=await setup(sim),b=await setup(sim);await authorize(a.page);await authorize(b.page);
  await edit(a.page,'dispositivo-A',0);await edit(b.page,'dispositivo-B',1);await Promise.all([send(a.page),send(b.page)]);
  assert.ok(has(sim,'dispositivo-A')&&has(sim,'dispositivo-B'));await a.page.evaluate(()=>SharedAutosave.refresh());await b.page.evaluate(()=>SharedAutosave.refresh());
  assert.equal(await a.page.evaluate(()=>state.tasks.some(x=>x.id==='dispositivo-B')),true);
  const week='2026-10-12';await a.page.evaluate(week=>{const p=state.team[0];p.grid[week]=p.grid[week]||{};p.grid[week]['5-42']={p:p.projects[0].id,n:'A'};save();},week);
  await b.page.evaluate(week=>{const p=state.team[0];p.grid[week]=p.grid[week]||{};p.grid[week]['6-42']={p:p.projects[0].id,n:'B'};save();},week);
  await Promise.all([send(a.page),send(b.page)]);assert.equal(sim.doc.team[0].grid[week]['5-42'].n,'A');assert.equal(sim.doc.team[0].grid[week]['6-42'].n,'B');
  await a.page.evaluate(()=>SharedAutosave.refresh());await b.page.evaluate(()=>SharedAutosave.refresh());
  await a.page.evaluate(week=>{state.team[0].grid[week]['5-42'].n='A cambia';save();},week);
  await b.page.evaluate(week=>{state.team[0].grid[week]['5-42'].n='B cambia';save();},week);
  await send(a.page);await send(b.page);assert.equal(sim.doc.team[0].grid[week]['5-42'].n,'A cambia');
  assert.equal(await b.page.evaluate(()=>SharedAutosave.status().review),true);
  assert.ok(await b.page.evaluate(()=>SharedAutosave.records().some(r=>r.kind==='blocked'&&r.doc.team[0].grid['2026-10-12']['5-42'].n==='B cambia')));
  await b.page.locator('#saveStatus').click();await b.page.waitForSelector('#safeChoice0');
  await b.page.locator('#safeChoice0').selectOption('theirs');await b.page.getByRole('button',{name:'Combinar y continuar',exact:true}).click();await idle(b.page);
  assert.equal(await b.page.evaluate(()=>SharedAutosave.status().review||!!SharedAutosave.status().recovery),false);
  assert.ok(await b.page.evaluate(()=>SharedAutosave.records().some(r=>r.kind==='archive'&&r.doc.team[0].grid['2026-10-12']['5-42'].n==='B cambia')));
  await edit(b.page,'después-de-revisar');await send(b.page);assert.ok(has(sim,'después-de-revisar'));
  assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);await a.context.close();await b.context.close();
  console.log('OK autoguardado: dos dispositivos, personas distintas y celdas distintas sin pérdida; la misma celda exige revisión y conserva ambas versiones.');

  // Dos pestañas no deben apropiarse de los borradores activos de la otra.
  sim=simulator();t=await setup(sim);await edit(t.page,'pestaña-A');
  const second=await t.context.newPage();await second.goto('https://cuadrante.test/');await ready(second);
  assert.notEqual(await t.page.evaluate(()=>SharedAutosave.status().tabId),await second.evaluate(()=>SharedAutosave.status().tabId));
  await authorize(t.page);await edit(second,'pestaña-B');await send(t.page);await until(()=>second.evaluate(()=>_publishKey==='clave-ficticia-prueba'),'clave disponible en otra pestaña');await send(second);assert.ok(has(sim,'pestaña-A')&&has(sim,'pestaña-B'));
  // Cerrar una pestaña offline y continuar con la otra preserva el diario huérfano.
  await t.context.setOffline(true);sim.offline=true;await edit(t.page,'cerrado-sin-red');await t.page.close();
  sim.offline=false;await t.context.setOffline(false);await second.evaluate(()=>SharedAutosave.recover());await send(second);
  assert.ok(has(sim,'cerrado-sin-red'));await second.evaluate(()=>safeOpenHistory());assert.ok(await second.locator('#modalHost').getByText(/Autoguardado recuperado/).count());
  await second.evaluate(()=>closeModal());assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK autoguardado: pestañas independientes y recuperación de una pestaña cerrada sin red; copia recuperada descargable.');

  // Una respuesta perdida más una edición posterior sobreviven incluso sin sessionStorage.
  sim=simulator();t=await setup(sim);await authorize(t.page);sim.lost=true;await edit(t.page,'antes-de-cerrar');await send(t.page);
  const orphanId=sim.posts.at(-1).requestId,orphanCommits=sim.commits;await edit(t.page,'después-del-envío');await t.page.close();
  const reopened=await t.context.newPage();await reopened.goto('https://cuadrante.test/');await ready(reopened);await authorize(reopened);await send(reopened);
  assert.equal(sim.posts.at(-1).requestId,orphanId);assert.equal(sim.commits,orphanCommits);
  assert.equal(await reopened.evaluate(()=>state.tasks.some(x=>x.id==='después-del-envío')),true);await send(reopened);assert.ok(has(sim,'después-del-envío'));
  assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK autoguardado: cerrar y volver a abrir sin sesión recupera el mismo envío y también lo editado después.');

  sim=simulator();t=await setup(sim,{remembered:'incorrecta-ficticia'});await edit(t.page,'clave-equivocada');await send(t.page);
  assert.equal(has(sim,'clave-equivocada'),false);assert.equal(await t.page.evaluate(()=>_publishKey),'');
  assert.equal(await t.page.evaluate(key=>localStorage.getItem(key),ACCESS),null);
  const authId=sim.posts.at(-1).requestId;await t.page.locator('#saveStatus').click();await t.page.waitForSelector('#publishKeyInput');
  await t.page.locator('#publishKeyInput').fill('clave-ficticia-prueba');await t.page.getByRole('button',{name:'Conectar',exact:true}).click();
  await until(()=>has(sim,'clave-equivocada'),'reintento con clave correcta');await idle(t.page);assert.equal(sim.posts.at(-1).requestId,authId);
  assert.equal(await t.page.evaluate(key=>localStorage.getItem(key),ACCESS),'clave-ficticia-prueba');
  assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK autoguardado: una clave incorrecta no pierde el borrador y permite reintentar el mismo envío con la correcta.');

  // Fuera de la ventana de caché, un recibo confirma sin ejecutar otra vez la petición.
  sim=simulator();t=await setup(sim);await authorize(t.page);sim.lost=true;await edit(t.page,'recibo-antiguo');await send(t.page);
  const receiptPosts=sim.posts.length;
  await t.page.evaluate(()=>{const p=safeGet(SAFE_PENDING_KEY);p.createdAt=Date.now()-300000;safeSet(SAFE_PENDING_KEY,p);});
  await send(t.page);assert.equal(sim.posts.length,receiptPosts);assert.equal(await t.page.evaluate(()=>!!safeGet(SAFE_PENDING_KEY)),false);
  assert.deepEqual(t.errors,[]);await t.context.close();
  // Si ya no existe recibo, no volver a borrar lo que un compañero restauró después.
  sim=simulator();const protectedWeek='2026-10-12',protectedCell={p:sim.doc.team[1].projects[0].id,n:'Trabajo restaurado por el compañero'};
  sim.doc.team[1].grid[protectedWeek]=sim.doc.team[1].grid[protectedWeek]||{};sim.doc.team[1].grid[protectedWeek]['4-40']=S.clone(protectedCell);
  t=await setup(sim);await authorize(t.page);sim.lost=true;
  await t.page.evaluate(week=>{delete state.team[1].grid[week]['4-40'];state.tasks.push({id:'antiguo-propio',owner:state.team[0].id,text:'Propio'});save();},protectedWeek);await send(t.page);
  sim.doc.team[1].grid[protectedWeek]['4-40']=S.clone(protectedCell);sim.doc.meta.publishReceipts=[];sim.results.clear();const stalePosts=sim.posts.length;
  await t.page.evaluate(()=>{const p=safeGet(SAFE_PENDING_KEY);delete p.createdAt;safeSet(SAFE_PENDING_KEY,p);});await send(t.page);
  assert.equal(sim.posts.length,stalePosts);assert.equal(await t.page.evaluate(()=>SharedAutosave.status().review),true);
  await t.page.locator('#saveStatus').click();await t.page.waitForSelector('#safeLegacyPerson');
  await t.page.locator('#safeLegacyPerson').selectOption(sim.doc.team[0].id);await t.page.getByRole('button',{name:'Revisar mis cambios',exact:true}).click();await idle(t.page);
  assert.deepEqual(sim.doc.team[1].grid[protectedWeek]['4-40'],protectedCell);assert.equal(sim.posts.length,stalePosts);
  assert.ok(await t.page.evaluate(()=>SharedAutosave.records().some(r=>r.kind==='archive'&&!r.doc.team[1].grid['2026-10-12']['4-40'])));
  assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK autoguardado: los recibos antiguos evitan reenvíos; sin recibo se exige revisión por persona y nunca se reaplica un borrado antiguo del compañero.');

  sim=simulator();t=await setup(sim,{blocked:true});await authorize(t.page);await edit(t.page,'sin-espacio');await send(t.page);
  assert.equal(sim.posts.length,0,'Sin diario duradero no debe publicarse');assert.equal(await t.page.evaluate(()=>SharedAutosave.status().storageError),true);
  assert.equal(await t.page.evaluate(()=>state.tasks.some(x=>x.id==='sin-espacio')),true);await t.context.close();
  sim=simulator();const old=S.clone(sim.doc);old.tasks.push({id:'copia-antigua',owner:old.team[0].id,text:'Pendiente antiguo'});
  t=await setup(sim,{local:old,unknown:true});await authorize(t.page);await t.page.evaluate(()=>SharedAutosave.flush());
  assert.equal(sim.posts.length,0,'No publicar una copia antigua sin revisar su procedencia');assert.equal(await t.page.evaluate(()=>safeBase),null);
  assert.deepEqual(t.errors,[]);await t.context.close();assert.equal(externalWrites,0);
  console.log('OK autoguardado: bloqueo seguro sin espacio y copias antiguas sin base nunca se publican sin revisión. Cero escrituras externas.');

  sim=simulator();t=await setup(sim,{blockedAccess:true});await authorize(t.page);await edit(t.page,'clave-no-recordable');await send(t.page);
  assert.ok(has(sim,'clave-no-recordable'));assert.equal(await t.page.evaluate(key=>localStorage.getItem(key),ACCESS),null);
  assert.equal(await t.page.evaluate(()=>SharedAutosave.status().storageError),false);assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK acceso recordado: si solo se bloquea recordar la clave, el guardado sigue funcionando en la sesión sin borrar nada.');

  // Olvidar mientras termina un envío no debe volver a guardar la clave al recibir el éxito.
  sim=simulator();t=await setup(sim);await authorize(t.page);
  let releaseForget;sim.hold=new Promise(resolve=>releaseForget=resolve);await edit(t.page,'envío-antes-de-olvidar');await tick(t.page);
  const forgetSending=t.page.evaluate(()=>SharedAutosave.flush());await until(()=>sim.posts.length===1,'envío antes de olvidar');
  await t.page.evaluate(()=>SharedAutosave.forgetKey({silent:true}));releaseForget();sim.hold=null;await forgetSending;await idle(t.page);
  assert.equal(await t.page.evaluate(key=>localStorage.getItem(key),ACCESS),null);assert.equal(await t.page.evaluate(()=>_publishKey),'');
  assert.ok(has(sim,'envío-antes-de-olvidar'));assert.deepEqual(t.errors,[]);await t.context.close();
  console.log('OK acceso recordado: olvidar durante una petición no reactiva la clave al llegar su respuesta.');

  sim=simulator();t=await setup(sim);
  await t.page.evaluate(()=>openSettings());sim.doc.tasks.push({id:'novedad-del-equipo',owner:sim.doc.team[1].id,text:'No interrumpir el formulario'});
  await t.page.evaluate(()=>SharedAutosave.refresh());assert.equal(await t.page.evaluate(()=>state.tasks.some(x=>x.id==='novedad-del-equipo')),false);
  await t.page.evaluate(()=>closeModal());await t.page.evaluate(()=>SharedAutosave.refresh());assert.equal(await t.page.evaluate(()=>state.tasks.some(x=>x.id==='novedad-del-equipo')),true);
  await t.page.setViewportSize({width:390,height:844});
  assert.equal(await t.page.evaluate(()=>{const r=document.getElementById('saveStatus').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),true,'Indicador utilizable en móvil');
  await t.page.setViewportSize({width:1500,height:1100});
  await t.page.evaluate(()=>{state.ui.person=state.team.find(p=>/david/i.test(p.name)).id;state.ui.weekId='2026-10-12';switchTab('cuadrante');scrollTo(0,scrollY+document.getElementById('priorityBoard').getBoundingClientRect().top-400);});
  await t.page.screenshot({path:path.join(root,'..','autoguardado-prioridades-20261020.png')});
  assert.deepEqual(t.errors,[]);await t.context.close();assert.equal(externalWrites,0);
  console.log('OK autoguardado: novedades sin sustituir formularios abiertos, indicador móvil y captura de comprobación.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const context of contexts)await context.close().catch(()=>{});if(browser)await browser.close();});
