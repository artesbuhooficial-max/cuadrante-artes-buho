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
        var out={},all=keys(r).concat(keys(l),b===missing?[]:keys(b));
        Array.from(new Set(all)).forEach(function(k){
          var v=walk(b!==missing&&Object.prototype.hasOwnProperty.call(b,k)?b[k]:missing,Object.prototype.hasOwnProperty.call(l,k)?l[k]:missing,Object.prototype.hasOwnProperty.call(r,k)?r[k]:missing,path.concat(k));
          if(v!==missing)out[k]=v;
        });return out;
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
    var out=clone(theirs),conflicts=[];choices=choices||{};
    var sections=Array.from(new Set(keys(mine).concat(keys(theirs))));
    sections.forEach(function(section){
      if(equal(mine[section],theirs[section]))return;
      if(indexed(mine[section])&&indexed(theirs[section])){
        var local=indexed(mine[section]),remote=indexed(theirs[section]);
        var ids=Array.from(new Set(Object.keys(remote).concat(Object.keys(local))));out[section]=[];
        ids.forEach(function(id){var l=local[id],r=remote[id],path=[section,'@'+id],key=JSON.stringify(path);
          if(!l){out[section].push(clone(r));return;}
          if(!equal(l,r)&&!choices[key])conflicts.push({key:key,path:path,mine:l||null,theirs:r||null,mineMissing:!l,theirsMissing:!r});
          var chosen=choices[key]==='mine'?l:r;if(chosen)out[section].push(clone(chosen));
        });
      }else{
        var path=[section],key=JSON.stringify(path);
        if(!choices[key])conflicts.push({key:key,path:path,mine:mine[section]===undefined?null:clone(mine[section]),theirs:theirs[section]===undefined?null:clone(theirs[section]),mineMissing:mine[section]===undefined,theirsMissing:theirs[section]===undefined});
        if(choices[key]==='mine'){if(mine[section]===undefined)delete out[section];else out[section]=clone(mine[section]);}
      }
    });return {value:out,conflicts:conflicts};
  }
  function restorePerson(current,backup,id){
    var out=clone(current),target=(out.team||[]).find(function(p){return p.id===id;}),source=(backup.team||[]).find(function(p){return p.id===id;});
    if(!target||!source)throw Error('La persona elegida no está en ambas copias');
    target.grid=target.grid||{};
    keys(source.grid).forEach(function(week){target.grid[week]=target.grid[week]||{};keys(source.grid[week]).forEach(function(slot){target.grid[week][slot]=clone(source.grid[week][slot]);});});
    function overlay(existing,recovered){var map=indexed(existing||[]),incoming=indexed(recovered||[]);if(!map||!incoming)throw Error('Lista de trabajo inválida');var ids=Object.keys(map);Object.keys(incoming).forEach(function(k){if(!map[k])ids.push(k);map[k]=clone(incoming[k]);});return ids.map(function(k){return map[k];});}
    ['projects','priorities'].forEach(function(k){target[k]=overlay(target[k],source[k]);});
    ['tasks','recurring','extraTasks','objectives','milestones','notes'].forEach(function(k){var owned=(backup[k]||[]).filter(function(x){return x.owner===id;});if(owned.length){
      owned.forEach(function(x){var existing=(out[k]||[]).find(function(y){return y.id===x.id;});if(existing&&existing.owner!==id)throw Error('Un registro del backup coincide con el de otra persona. No se ha restaurado.');});
      out[k]=overlay(out[k],owned);
    }});
    return out;
  }
  function valid(doc){return object(doc)&&Array.isArray(doc.team)&&doc.team.length>0&&!!indexed(doc.team)&&doc.team.every(function(p){return object(p.grid||{})&&!!indexed(p.projects||[])&&!!indexed(p.priorities||[]);});}
  return {clone:clone,equal:equal,publicDoc:publicDoc,merge:merge,mergeUnknown:mergeUnknown,restorePerson:restorePerson,valid:valid};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SafeSync;
