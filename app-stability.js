/* Arranque visible, validación sin descartar trabajo y diagnóstico recuperable. */
var AppStability=(function(){
  let original=null,fatal=false;
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  function date(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
  function prepare(source){
    if(!object(source)||!Array.isArray(source.team)||!source.team.length)throw Error('La copia no contiene un equipo válido');
    const doc=JSON.parse(JSON.stringify(source)),today=new Date();
    function list(host,key){
      if(host[key]==null)host[key]=[];
      if(!Array.isArray(host[key]))throw Error('Formato incorrecto en «'+key+'»');
      const ids=new Set();host[key].forEach(x=>{if(!object(x)||typeof x.id!=='string'||!x.id||ids.has(x.id))throw Error('Registro incompleto o duplicado en «'+key+'»');ids.add(x.id);});
      return host[key];
    }
    list(doc,'team').forEach(p=>{
      p.name=String(p.name||'Sin nombre');p.role=String(p.role||'');
      if(p.grid==null)p.grid={};if(!object(p.grid))throw Error('Horario incorrecto de '+p.name);
      Object.entries(p.grid).forEach(([week,slots])=>{
        if(/^[0-6]-\d+$/.test(week))return; // El migrador conserva los backups antiguos.
        if(!object(slots))throw Error('Semana incompleta de '+p.name+': '+week);
      });
      list(p,'projects').forEach(x=>{x.name=String(x.name||'Sin nombre');});
      list(p,'priorities');
    });
    ['projects','tasks','recurring','extraTasks','objectives','milestones','notes','bigEvents'].forEach(k=>list(doc,k));
    doc.notes.forEach(n=>{if(n.date==null)n.date='';if(typeof n.date!=='string')throw Error('Fecha de nota incorrecta');});
    doc.recurring.forEach(r=>{if(r.done==null)r.done={};if(!object(r.done))throw Error('Marcas de tarea recurrente incorrectas');});
    doc.objectives.forEach(o=>{if(o.meeting){if(!object(o.meeting))throw Error('Reunión incorrecta');['highlights','milestones','actions'].forEach(k=>{if(o.meeting[k]!=null&&!Array.isArray(o.meeting[k]))throw Error('Lista de reunión incorrecta');});}});
    doc.config=object(doc.config)?doc.config:{};
    const c=doc.config,start=Number(c.startHour),end=Number(c.endHour);
    c.startHour=Number.isInteger(start)&&start>=0&&start<24?start:9;
    c.endHour=Number.isInteger(end)&&end>c.startHour&&end<=24?end:Math.max(22,c.startHour+1);
    c.currency=typeof c.currency==='string'?c.currency:'€';
    doc.meta=object(doc.meta)?doc.meta:{};doc.ui=object(doc.ui)?doc.ui:{};
    const u=doc.ui,ref={y:today.getFullYear(),m:today.getMonth()};
    if(!['cuadrante','mes','tareas','calendario','resumen','equipo','notas'].includes(u.tab))u.tab='cuadrante';
    if(!doc.team.some(p=>p.id===u.person))u.person=doc.team[0].id;
    if(!date(u.weekId))u.weekId=dStr(mondayOf(today));
    else u.weekId=dStr(mondayOf(parseId(u.weekId)));
    if(!date(u.priorityDate))u.priorityDate=dStr(today);
    ['monthRef','resRef'].forEach(k=>{const r=u[k];if(!object(r)||!Number.isInteger(r.y)||r.y<1900||r.y>2200||!Number.isInteger(r.m)||r.m<0||r.m>11)u[k]={...ref};});
    return doc;
  }
  function status(message,problem){
    const host=document.getElementById('appHealth');if(!host)return;
    host.hidden=!message;const label=document.getElementById('appHealthText');if(label)label.textContent=message;
    host.dataset.problem=problem?'true':'false';
  }
  function fail(error,raw){
    fatal=true;if(raw!=null)original=raw;
    status('No se ha podido abrir esta copia: '+String(error.message||error)+'. Tus datos no se han sustituido. Descarga la copia antes de reintentar.',true);
    const button=document.getElementById('appRecoveryDownload');if(button)button.hidden=original==null;
    const publish=document.getElementById('publishBtn');if(publish)publish.disabled=true;
  }
  function download(){
    if(original==null)return;
    const url=URL.createObjectURL(new Blob([typeof original==='string'?original:JSON.stringify(original,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='cuadrante-copia-recuperacion-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function bounded(task,ms,message){
    let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message||'La conexión tarda demasiado')),ms);})]);}finally{clearTimeout(timer);}
  }
  return {prepare,date,status,fail,download,bounded,isFatal:()=>fatal};
})();
if(typeof window.addEventListener==='function'){
  window.addEventListener('error',event=>{if(event.error)AppStability.status('Se ha interrumpido una acción. Tu copia sigue guardada; puedes descargar un backup desde Ajustes y reintentar.',true);});
  window.addEventListener('unhandledrejection',()=>AppStability.status('No se ha completado una operación. No cierres la página si tienes cambios pendientes; revisa la conexión y reintenta.',true));
}
