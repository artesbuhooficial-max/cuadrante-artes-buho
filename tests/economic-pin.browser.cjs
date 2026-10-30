/* App completa con servidor simulado; no se envían claves ni datos reales. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright'),S=require('../safe-sync.js');
const root=path.join(__dirname,'..'),published=JSON.parse(fs.readFileSync(path.join(root,'data/cuadrante-data.json'),'utf8'));
let browser;
async function main(){
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext(),page=await context.newPage(),errors=[],posts=[],pins={u1:'viejo',u2:'intacto'};
  const before=JSON.stringify(published),peer=published.team.find(p=>p.id!=='u1');page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==='cuadrante.test'){
      const file=url.pathname.slice(1)||'index.html';if(file==='data/cuadrante-data.json')return route.fulfill({json:published});
      if(/^[a-z-]+\.(js|html|css)$/.test(file)&&fs.existsSync(path.join(root,file)))return route.fulfill({body:fs.readFileSync(path.join(root,file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
    }
    if(url.hostname==='script.google.com'){
      if(request.method()==='POST'){
        const body=JSON.parse(request.postData());posts.push(body);assert.equal(body.action,'setpins');
        if(body.master==='master-ficticio')Object.assign(pins,body.pins);return route.fulfill({body:''});
      }
      const action=url.searchParams.get('action'),pid=url.searchParams.get('pid');let result={ok:true,protocol:2,state:published,sha:'test-sha'};
      if(action==='unlock')result=pins[pid]===url.searchParams.get('pin')?{ok:true,econ:{[pid]:{rate:20,salary:0}}}:{ok:false,error:'Clave incorrecta'};
      const cb=url.searchParams.get('callback');return route.fulfill(cb?{body:cb+'('+JSON.stringify(result)+')',contentType:'text/javascript'}:{json:result});
    }
    if(url.pathname.endsWith('/data/cuadrante-data.json'))return route.fulfill({json:published});return route.abort();
  });
  await page.addInitScript(({doc,base})=>{localStorage.setItem('cuadrante_artesbuho_v2',JSON.stringify(doc));localStorage.setItem('cuadrante_work_copy_v3',JSON.stringify({version:3,doc,base}));},{doc:published,base:S.publicDoc(published)});
  await page.goto('https://cuadrante.test/?economicPin=u1',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'PIN económico de David',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>state.ui.tab),'mes');assert.equal(await page.evaluate(()=>state.ui.person),'u1');
  await page.getByLabel('Nuevo PIN (4 a 12 dígitos)',{exact:true}).fill('123456');await page.getByLabel('Repite el PIN',{exact:true}).fill('123456');await page.getByLabel('Clave maestra de Román',{exact:true}).fill('master-ficticio');
  await page.getByRole('button',{name:'Guardar mi PIN',exact:true}).click();await page.waitForFunction(()=>!isLocked('u1'));
  assert.equal(await page.evaluate(pid=>isLocked(pid),peer.id),true);assert.equal(await page.evaluate(()=>isMasterUnlocked()),false);
  assert.equal(pins.u2,'intacto');assert.deepEqual(posts,[{action:'setpins',master:'master-ficticio',pins:{u1:'123456'}}]);assert.equal(JSON.stringify(published),before);assert.deepEqual(errors,[]);
  assert.equal(await page.locator('#econPinMaster').count(),0);assert.equal(await page.evaluate(()=>person('u1').rate),20);
  console.log('OK navegador PIN: enlace directo a David, formulario completo, tarifa privada propia, PIN ajeno intacto y ningún envío de publicación.');await context.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
