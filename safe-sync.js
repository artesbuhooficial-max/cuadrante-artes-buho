/* Motor compartido por navegador y Apps Script: fusión de tres versiones. */
var SafeSync=(function(){
  var missing={missing:true};
  function clone(x){return x===undefined?undefined:JSON.parse(JSON.stringify(x));}
  function object(x){return x&&typeof x==='object'&&!Array.isArray(x)&&x!==missing;}
  function keys(x){return Object.keys(x||{}).filter(function(k){return ['__proto__','prototype','constructor'].indexOf(k)<0;});}
  function stable(x){
    if(x===missing)return '~missing';
    if(Array.isArray(x))return '['+x.map(stable).join(',')+']';
    if(object(x))return '{'+keys(x).sort().map(function(k){return JSON.stringify(k)+':'+stable(x[k]);}).join(',')+'}';
    return JSON.stringify(x);
  }
  function equal(a,b){return stable(a)===stable(b);}
  function publicDoc(state){
    var doc=clone(state);delete doc.meta;delete doc.ui;
    (doc.team||[]).forEach(function(p){p.salary=0;p.rate=0;});return doc;
  }
  function indexed(list){
    if(!Array.isArray(list))return null;var map=Object.create(null);
    for(var i=0;i<list.length;i++){var x=list[i];if(!object(x)||typeof x.id!=='string'||!x.id||map[x.id])return null;map[x.id]=x;}
    return map;
  }
  function merge(base,mine,theirs,choices){
    var conflicts=[];choices=choices||{};
    function walk(b,l,r,path){
      if(equal(l,r))return l;
      if(b===missing&&l===missing)return r;
      if(b===missing&&r===missing)return l;
      if(b!==missing&&equal(l,b))return r;
      if(b!==missing&&equal(r,b))return l;
      var cell=path.length>=3&&path[path.length-3]==='grid';
      if(!cell&&object(l)&&object(r)&&(object(b)||b===missing)){
        var priority=path[path.length-2]==='priorities'&&typeof l.progress==='number'&&typeof r.progress==='number';
        var out={},all=keys(r).concat(keys(l),b===missing?[]:keys(b));
        Array.from(new Set(all)).forEach(function(k){
          if(priority&&k==='done')return;
          var v=walk(b!==missing&&Object.prototype.hasOwnProperty.call(b,k)?b[k]:missing,Object.prototype.hasOwnProperty.call(l,k)?l[k]:missing,Object.prototype.hasOwnProperty.call(r,k)?r[k]:missing,path.concat(k));
          if(v!==missing)out[k]=v;
        });if(priority)out.done=out.progress===100;return out;
      }
      var bi=indexed(b),li=indexed(l),ri=indexed(r);
      if(li&&ri&&(bi||b===missing)){
        var ids=Array.from(new Set(r.map(function(x){return x.id;}).concat(l.map(function(x){return x.id;}),bi?b.map(function(x){return x.id;}):[]))),items=[];
        ids.forEach(function(id){var v=walk(bi&&bi[id]||missing,li[id]||missing,ri[id]||missing,path.concat('@'+id));if(v!==missing)items.push(v);});return items;
      }
      // Sin versión de partida, una copia antigua nunca gana silenciosamente.
      var key=JSON.stringify(path),choice=choices[key];
      if(choice==='mine')return l;if(choice==='theirs')return r;
      conflicts.push({key:key,path:path,mine:l===missing?null:clone(l),theirs:r===missing?null:clone(r),mineMissing:l===missing,theirsMissing:r===missing});
      return r;
    }
    return {value:clone(walk(base==null?missing:base,mine,theirs,[])),conflicts:conflicts};
  }
  function mergeUnknown(mine,theirs,choices){
    var conflicts=[];choices=choices||{};
    function walk(l,r,path){
      // Sin base no se puede inferir un borrado a partir de una ausencia antigua.
      if(l===missing||l==null&&r!==missing)return r;
      if(r===missing)return l;
      if(equal(l,r))return r;
      var cell=path.length>=3&&path[path.length-3]==='grid';
      if(!cell&&object(l)&&object(r)){
        var priority=path[path.length-2]==='priorities'&&typeof l.progress==='number'&&typeof r.progress==='number';
        var out={};Array.from(new Set(keys(r).concat(keys(l)))).forEach(function(k){
          if(priority&&k==='done')return;
          var value=walk(Object.prototype.hasOwnProperty.call(l,k)?l[k]:missing,Object.prototype.hasOwnProperty.call(r,k)?r[k]:missing,path.concat(k));
          if(value!==missing)out[k]=value;
        });if(priority)out.done=out.progress===100;return out;
      }
      var li=indexed(l),ri=indexed(r);
      if(li&&ri){return Array.from(new Set(r.map(function(x){return x.id;}).concat(l.map(function(x){return x.id;})))).map(function(id){return walk(li[id]||missing,ri[id]||missing,path.concat('@'+id));});}
      var key=JSON.stringify(path),choice=choices[key];
      if(choice==='mine')return l;if(choice==='theirs')return r;
      conflicts.push({key:key,path:path,mine:clone(l),theirs:clone(r),mineMissing:false,theirsMissing:false});return r;
    }
    return {value:clone(walk(mine,theirs,[])),conflicts:conflicts};
  }
  function legacyScope(mine,theirs,id,includeShared){
    var out=clone(theirs),source=(mine.team||[]).find(function(p){return p.id===id;}),target=(out.team||[]).find(function(p){return p.id===id;});
    if(!source||!target)throw Error('La persona elegida debe existir en ambas copias');
    // No importar nombres, sueldos ni fichas ajenas de una copia sin base fiable.
    ['grid','projects','priorities'].forEach(function(k){target[k]=clone(source[k]||(k==='grid'?{}:[]));});
    ['tasks','recurring','extraTasks','objectives','milestones','notes'].forEach(function(k){
      function owner(x){return k==='milestones'?(x.ownerId||x.owner):x.owner;}
      function selected(x){return owner(x)===id||includeShared&&owner(x)==='empresa';}
      var recovered=(mine[k]||[]).filter(selected);
      recovered.forEach(function(x){var published=(theirs[k]||[]).find(function(y){return y.id===x.id;});if(published&&owner(published)!==owner(x))throw Error('El registro «'+(x.title||x.text||x.id)+'» pertenece a otra persona en lo publicado. No se ha cambiado.');});
      out[k]=(theirs[k]||[]).filter(function(x){return !selected(x);}).concat(clone(recovered));
    });
    if(includeShared)out.bigEvents=clone(mine.bigEvents||[]);
    return out;
  }
  function restorePerson(current,backup,id){
    var out=clone(current),target=(out.team||[]).find(function(p){return p.id===id;}),source=(backup.team||[]).find(function(p){return p.id===id;});
    if(!target||!source)throw Error('La persona elegida no está en ambas copias');
    target.grid=target.grid||{};
    keys(source.grid).forEach(function(week){target.grid[week]=target.grid[week]||{};keys(source.grid[week]).forEach(function(slot){target.grid[week][slot]=clone(source.grid[week][slot]);});});
    function overlay(existing,recovered){var map=indexed(existing||[]),incoming=indexed(recovered||[]);if(!map||!incoming)throw Error('Lista de trabajo inválida');var ids=Object.keys(map);Object.keys(incoming).forEach(function(k){if(!map[k])ids.push(k);map[k]=clone(incoming[k]);});return ids.map(function(k){return map[k];});}
    ['projects','priorities'].forEach(function(k){target[k]=overlay(target[k],source[k]);});
    ['tasks','recurring','extraTasks','objectives','milestones','notes'].forEach(function(k){
      function owner(x){return k==='milestones'?(x.ownerId||x.owner):x.owner;}
      var owned=(backup[k]||[]).filter(function(x){return owner(x)===id;});if(owned.length){
      owned.forEach(function(x){var existing=(out[k]||[]).find(function(y){return y.id===x.id;});if(existing&&owner(existing)!==id)throw Error('Un registro del backup coincide con el de otra persona. No se ha restaurado.');});
      out[k]=overlay(out[k],owned);
    }});
    return out;
  }
  function valid(doc){return object(doc)&&Array.isArray(doc.team)&&doc.team.length>0&&!!indexed(doc.team)&&doc.team.every(function(p){return object(p.grid||{})&&!!indexed(p.projects||[])&&!!indexed(p.priorities||[]);});}
  return {clone:clone,equal:equal,publicDoc:publicDoc,merge:merge,mergeUnknown:mergeUnknown,legacyScope:legacyScope,restorePerson:restorePerson,valid:valid};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SafeSync;
