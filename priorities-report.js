/* Informe de lunes a lunes. No se deduce tiempo real a partir del avance. */
let priorityView='report';
let priorityScope='team';
let priorityReportReturnWeek=null;

function priorityReportDays(){
  const monday=mondayOf(parseId(state.ui.weekId));
  return Array.from({length:8},(_,i)=>dStr(addDays(monday,i)));
}
function priorityReportPeople(){return priorityScope==='team'?state.team:[curPerson()];}
function priorityReportMetrics(people,dates){
  const actions=people.flatMap(p=>(p.priorities||[]).filter(x=>dates.includes(x.date)));
  const tracked=actions.filter(x=>x.actualHours!=null&&x.actualHours!=='');
  return {count:actions.length,done:actions.filter(x=>priorityPct(x)===100).length,
    pct:actions.length?dayPriorityPct(actions):null,
    actual:tracked.reduce((sum,x)=>sum+Math.max(0,Number(x.actualHours)||0),0),tracked:tracked.length,
    grid:people.reduce((sum,p)=>sum+dates.reduce((n,ds)=>n+dayHours(p,parseId(ds)),0),0)};
}
function priorityReportGridActivities(p,ds){
  const date=parseId(ds),di=(date.getDay()+6)%7;
  const grid=p.grid[weekId(mondayOf(date))]||{},groups=new Map();
  Object.entries(grid).forEach(([key,slot])=>{
    if(!key.startsWith(di+'-')||!slot||!slot.p)return;
    const project=proj(slot.p,p);if(projFullDay(project))return;
    const group=groups.get(slot.p)||{name:project?project.name:'Proyecto sin nombre',hours:0,notes:new Set()};
    group.hours+=SLOT_HOURS;if(slot.n)group.notes.add(slot.n);groups.set(slot.p,group);
  });
  return [...groups.values()];
}
function priorityReportProgress(pct){
  if(pct==null)return '<span class="pr-muted">Sin prioridades</span>';
  return '<div class="pr-progress"><span class="pr-bar"><span style="width:'+pct+'%"></span></span><strong>'+pct+'%</strong></div>';
}
function priorityReportStat(label,value){return '<div class="prio-stat"><span class="k">'+label+'</span><span class="v">'+value+'</span></div>';}
function showPriorityReport(){
  if(priorityReportReturnWeek){state.ui.weekId=priorityReportReturnWeek;priorityReportReturnWeek=null;}
  priorityView='report';storeSet(state);render();
}
function setPriorityReportScope(value){priorityScope=value;renderPriorityBoard();}
function editPriorityReportDay(pid,ds){
  priorityReportReturnWeek=state.ui.weekId;
  state.ui.person=pid;state.ui.priorityDate=ds;priorityView='editor';
  // El lunes de cierre tiene su propia semana en el cuadrante.
  if(ds> dStr(addDays(parseId(state.ui.weekId),6)))state.ui.weekId=weekId(mondayOf(parseId(ds)));
  storeSet(state);render();
}
function renderPriorityBoard(){
  const host=document.getElementById('priorityBoard');if(!host)return;
  if(priorityView==='editor'){
    renderPriorityEditor();
    const back=document.createElement('button');back.className='btn pr-back';back.textContent='← Ver informe de lunes a lunes';back.onclick=showPriorityReport;
    host.prepend(back);
    const selected=priorityDateForWeek(),list=prioritiesForDay(curPerson(),selected);
    host.querySelectorAll('.prio-row').forEach((row,i)=>{
      const x=list[i],entry=document.createElement('div');entry.className='pr-entry';
      const duration=priorityDurationParts(x.actualHours),recorded=x.actualHours!=null&&x.actualHours!=='';
      entry.innerHTML='<div class="pr-time-input"><span>Tiempo dedicado</span><label><input data-unit="hours" type="number" min="0" step="1" value="'+(recorded?duration.hours:'')+'" placeholder="—" aria-label="Horas dedicadas a '+esc(x.title)+'"><span>h</span></label><label><input data-unit="minutes" type="number" min="0" max="59" step="1" value="'+(recorded?duration.minutes:'')+'" placeholder="—" aria-label="Minutos dedicados a '+esc(x.title)+'"><span>min</span></label></div>'+
        '<label class="pr-note-input">Trabajo realizado<input type="text" value="'+esc(x.workNotes||'')+'" placeholder="Qué has hecho o qué falta por cerrar" aria-label="Trabajo realizado en '+esc(x.title)+'"></label>';
      entry.querySelectorAll('[data-unit]').forEach(input=>input.onchange=()=>updatePriorityActualTime(x.id,entry));
      entry.querySelector('.pr-note-input input').onchange=e=>{const r=findPriority(x.id);if(r.x){r.x.workNotes=e.target.value.trim();priorityChanged(r.p);}};
      row.appendChild(entry);
    });
    return;
  }
  const people=priorityReportPeople(),dates=priorityReportDays(),metrics=priorityReportMetrics(people,dates);
  const range=priorityDayLabel(dates[0])+' → '+priorityDayLabel(dates[7]);
  let content='';
  dates.forEach((ds,i)=>{
    const dm=priorityReportMetrics(people,[ds]);let rows='',activities='';
    people.forEach(p=>{
      const list=prioritiesForDay(p,ds);
      list.forEach(x=>{
        const pct=priorityPct(x);
        rows+='<tr><td><strong>'+esc(p.name)+'</strong></td><td><strong>'+esc(x.title)+'</strong>'+(x.workNotes?'<p class="pr-work">'+esc(x.workNotes)+'</p>':'')+'</td><td>'+priorityReportProgress(pct)+'<span class="pr-state">'+(pct===100?'Hecha':pct>0?'En curso':'Pendiente')+'</span></td><td>'+(x.actualHours!=null&&x.actualHours!==''?fmtPrioDuration(x.actualHours):'<span class="pr-muted">Sin registrar</span>')+'</td><td>'+(x.estimatedHours!=null?fmtPrioDuration(x.estimatedHours):'<span class="pr-muted">Sin estimar</span>')+'</td><td class="pr-edit"><button class="btn" onclick="editPriorityReportDay(\''+p.id+'\',\''+ds+'\')">Editar</button></td></tr>';
      });
      const groups=priorityReportGridActivities(p,ds);
      if(groups.length)activities+='<div class="pr-grid-person"><strong>'+esc(p.name)+'</strong><div>'+groups.map(g=>'<span class="pr-grid-chip">'+esc(g.name)+' · '+fmtPrioDuration(g.hours)+(g.notes.size?'<span>'+[...g.notes].map(esc).join(' · ')+'</span>':'')+'</span>').join('')+'</div></div>';
    });
    content+='<section class="pr-day"><div class="pr-day-head"><div><h4>'+priorityDayLabel(ds)+(i===7?' · Lunes de cierre':'')+'</h4><span class="pr-muted">'+dm.done+' / '+dm.count+' acciones hechas · '+(dm.tracked?fmtPrioDuration(dm.actual)+' dedicado ('+dm.tracked+'/'+dm.count+' con tiempo registrado)':'Tiempo dedicado sin registrar')+'</span></div>'+priorityReportProgress(dm.pct)+'<button class="btn pr-edit" onclick="editPriorityReportDay(\''+curPerson().id+'\',\''+ds+'\')">+ Prioridad · '+esc(curPerson().name)+'</button></div>'+
      (rows?'<div class="pr-table-wrap"><table class="pr-table"><thead><tr><th>Persona</th><th>Acción / trabajo realizado</th><th>Avance</th><th>Dedicado</th><th>Estimado</th><th class="pr-edit"></th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="pr-empty">No hay prioridades registradas para este día.</p>')+
      (activities?'<details class="pr-grid" open><summary>Actividad del cuadrante · '+fmtPrioDuration(dm.grid)+'</summary>'+activities+'</details>':'<p class="pr-empty">Sin actividad registrada en el cuadrante.</p>')+'</section>';
  });
  host.innerHTML='<div class="prio-head"><div><div class="prio-kicker">Informe de acciones · '+(priorityScope==='team'?'Todo el equipo':esc(curPerson().name))+'</div><h3>Prioridades de lunes a lunes</h3><p>'+range+'</p></div><div class="pr-controls"><button class="btn'+(priorityScope==='team'?' primary':'')+'" onclick="setPriorityReportScope(\'team\')">Todo el equipo</button><button class="btn'+(priorityScope==='person'?' primary':'')+'" onclick="setPriorityReportScope(\'person\')">'+esc(curPerson().name)+'</button><button class="btn" onclick="printPriorityReport()">Imprimir / PDF</button></div></div>'+
    '<div class="pr-summary">'+priorityReportStat('Acciones hechas',metrics.done+' / '+metrics.count)+priorityReportStat('Avance medio',metrics.pct==null?'—':metrics.pct+'%')+priorityReportStat('Dedicado a prioridades',metrics.tracked?fmtPrioDuration(metrics.actual):'Sin registrar')+priorityReportStat('Horas en cuadrante',fmtPrioDuration(metrics.grid))+'</div>'+
    '<p class="pr-explanation">El avance es la media de los porcentajes de las acciones. El tiempo dedicado se registra por acción; las horas del cuadrante se muestran aparte y no se suman a ese tiempo. '+metrics.tracked+' de '+metrics.count+' acciones tienen tiempo registrado. El lunes de cierre también aparece al inicio del siguiente informe.</p>'+
    '<div class="pr-days">'+content+'</div>';
}
function updatePriorityActualTime(id,entry){
  const r=findPriority(id);if(!r.x)return;
  const h=entry.querySelector('[data-unit="hours"]').value,m=entry.querySelector('[data-unit="minutes"]').value;
  r.x.actualHours=h===''&&m===''?null:(Math.max(0,parseInt(h,10)||0)*60+Math.min(59,Math.max(0,parseInt(m,10)||0)))/60;
  priorityChanged(r.p);
}
function printPriorityReport(){
  priorityView='report';renderPriorityBoard();
  document.body.classList.add('print-priority-report');
  try{window.print();}finally{document.body.classList.remove('print-priority-report');}
}
