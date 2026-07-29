/**
 * Cuadrante Artes Búho — Web App de publicación privada (Google Apps Script)
 * ---------------------------------------------------------------------------
 * Qué hace:
 *  1) Publica los datos en GitHub SIN exponer el token (el token vive aquí,
 *     en las Propiedades del script, nunca en el navegador).
 *  2) Deja los SUELDOS fuera del archivo público: los guarda en el propio
 *     script y solo los devuelve a quien introduce el PIN correcto o la
 *     clave maestra (Roman).
 *
 * CONFIGURACIÓN (una sola vez):
 *   Configuración del proyecto  →  Propiedades del script  →  añade:
 *     GITHUB_TOKEN   ghp_xxx   (token con permiso Contents: Read & Write)
 *     GITHUB_OWNER   artesbuhooficial-max
 *     GITHUB_REPO    cuadrante-artes-buho
 *     GITHUB_BRANCH  master
 *     MASTER_KEY     (la clave maestra de Roman; ve todos los sueldos)
 *     PINS           (opcional) el PIN de cada persona para ver SOLO su sueldo.
 *                    Las claves son los IDs internos del equipo actual:
 *                      u1 David · u2 Miriam · u3 Manu · xasd2wb Daniel
 *                    (Roman es el master: usa MASTER_KEY, no necesita PIN)
 *                    {"u1":"1234","u2":"5678","u3":"0000","xasd2wb":"1111"}
 *
 * DESPLIEGUE:
 *   Implementar  →  Nueva implementación  →  Aplicación web
 *     Ejecutar como:  Yo
 *     Quién tiene acceso:  Cualquier usuario
 *   Copia la URL /exec y pégala en la app: Ajustes → URL del Web App.
 */

function _props(){ return PropertiesService.getScriptProperties(); }
function _get(k, d){ var v = _props().getProperty(k); return v == null ? d : v; }
function _json(k, d){ try { return JSON.parse(_get(k, '')) || d; } catch (e) { return d; } }
function _setJson(k, o){ _props().setProperty(k, JSON.stringify(o)); }

function _out(obj, callback){
  var body = JSON.stringify(obj);
  if (callback){
    return ContentService.createTextOutput(callback + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/* ---- Lecturas (JSONP): ping y unlock ---- */
function doGet(e){
  var p = (e && e.parameter) || {};
  var cb = p.callback || '';
  var action = p.action || 'ping';

  if (action === 'ping'){
    return _out({ ok: true, msg: 'Cuadrante Web App activo' }, cb);
  }

  if (action === 'unlock'){
    var econ = _json('ECON', {});
    var pins = _json('PINS', {});
    var master = _get('MASTER_KEY', '');
    // Clave maestra → devuelve TODOS los sueldos
    if (p.master && master && p.master === master){
      return _out({ ok: true, master: true, econ: econ }, cb);
    }
    // PIN de una persona → devuelve solo su sueldo
    if (p.pid && pins[p.pid] != null && String(pins[p.pid]) === String(p.pin)){
      var one = {};
      one[p.pid] = econ[p.pid] || { salary: 0, rate: 0 };
      return _out({ ok: true, econ: one }, cb);
    }
    return _out({ ok: false, error: 'Clave incorrecta' }, cb);
  }

  return _out({ ok: false, error: 'Acción desconocida' }, cb);
}

/* ---- Escrituras: publish y setpins ---- */
function doPost(e){
  var body = {};
  try { body = JSON.parse(e.postData.contents); }
  catch (err){ return _out({ ok: false, error: 'JSON inválido' }); }

  var action = body.action || 'publish';

  if (action === 'publish'){
    var state = body.state || {};
    // base = última versión publicada que había visto ese navegador. Sirve para
    // aplicar SOLO sus cambios sobre el archivo real y no pisar lo de los demás.
    var base = body.base || null;

    // 1) Capturar sueldos hacia el almacén privado (solo si vienen con valor,
    //    para que un usuario bloqueado (sueldos a 0) no pise los guardados).
    var econ = _json('ECON', {});
    (state.team || []).forEach(function(m){
      if (m && (m.salary || m.rate)){
        econ[m.id] = { salary: m.salary || 0, rate: m.rate || 0 };
      }
    });
    _setJson('ECON', econ);

    // 2) Construir la versión PÚBLICA sin sueldos ni precios/hora.
    var pub = _stripMoney(state);

    // 3) Commit del archivo público en GitHub, fusionando contra lo que haya
    //    en ese instante. El bloqueo serializa dos publicaciones simultáneas
    //    (p. ej. Miriam y Manu a la vez) para que ninguna se pierda.
    var lock = LockService.getScriptLock();
    try { lock.waitLock(30000); }
    catch (e){ return _out({ ok: false, error: 'Hay otra publicación en curso, inténtalo de nuevo' }); }
    try {
      return _out(_publishMerged(PUBLIC_PATH, pub, base ? _stripMoney(base) : null));
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'setpins'){
    var master = _get('MASTER_KEY', '');
    if (!master || body.master !== master){
      return _out({ ok: false, error: 'Clave maestra incorrecta' });
    }
    _setJson('PINS', body.pins || {});
    return _out({ ok: true });
  }

  return _out({ ok: false, error: 'Acción desconocida' });
}

/* ---- Publicación fusionada: leer → fusionar → escribir con sha ---- */
var PUBLIC_PATH = 'data/cuadrante-data.json';

function _stripMoney(state){
  var pub = JSON.parse(JSON.stringify(state || {}));
  (pub.team || []).forEach(function(m){ m.salary = 0; m.rate = 0; });
  return pub;
}

// Hasta 3 intentos: si alguien escribe entre la lectura y la escritura, GitHub
// devuelve 409/422 (el sha ya no coincide) y se repite el ciclo con lo nuevo.
function _publishMerged(path, mine, base){
  var last = { ok: false, error: 'No se pudo publicar' };
  for (var i = 0; i < 3; i++){
    var cur = _read(path);
    var merged = (base && cur.json) ? _mergeState(base, mine, cur.json) : mine;
    // INVARIANTE: el archivo público nunca lleva sueldos, pase lo que pase en la
    // fusión. Sin esto, un sueldo que ya estuviera publicado sobreviviría: para
    // quien publica no ha cambiado (0 en su copia y 0 en su base), así que la
    // fusión daba por bueno el valor antiguo del archivo.
    merged = _stripMoney(merged);
    merged.meta = { updatedAt: new Date().getTime() };
    var r = _commit(path, JSON.stringify(merged, null, 2), cur.sha);
    if (r.ok || (r.status !== 409 && r.status !== 422)) return r;
    last = r;
    Utilities.sleep(400 * (i + 1));
  }
  return last;
}

/* ---- Lectura del archivo publicado (contenido + sha) ---- */
function _read(path){
  var g = _ghCfg();
  if (!g.token) return { json: null, sha: null };
  var r = UrlFetchApp.fetch(_api(g, path) + '?ref=' + g.branch + '&t=' + new Date().getTime(),
    { headers: g.headers, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { json: null, sha: null };
  var d = {};
  try { d = JSON.parse(r.getContentText()); } catch (e) { return { json: null, sha: null }; }
  var json = null;
  try {
    var b64 = String(d.content || '').replace(/\s/g, '');
    json = JSON.parse(Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString('UTF-8'));
  } catch (e) {}
  return { json: json, sha: d.sha || null };
}

function _ghCfg(){
  var token = _get('GITHUB_TOKEN', '');
  return {
    owner: _get('GITHUB_OWNER', 'artesbuhooficial-max'),
    repo: _get('GITHUB_REPO', 'cuadrante-artes-buho'),
    branch: _get('GITHUB_BRANCH', 'master'),
    token: token,
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cuadrante-appscript'
    }
  };
}
function _api(g, path){ return 'https://api.github.com/repos/' + g.owner + '/' + g.repo + '/contents/' + path; }

/* ---- Commit a GitHub usando el token guardado en Propiedades del script ---- */
function _commit(path, content, sha){
  var g = _ghCfg();
  if (!g.token) return { ok: false, error: 'Falta GITHUB_TOKEN en Propiedades del script' };

  var payload = {
    message: 'Cuadrante actualizado · ' + new Date().toISOString(),
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: g.branch
  };
  if (sha) payload.sha = sha;

  var putR = UrlFetchApp.fetch(_api(g, path), {
    method: 'put',
    headers: g.headers,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = putR.getResponseCode();
  if (code === 200 || code === 201) return { ok: true };
  return { ok: false, status: code, error: 'GitHub ' + code + ': ' + putR.getContentText().slice(0, 200) };
}

/* ===========================================================================
   FUSIÓN A TRES BANDAS (misma lógica que index.html)
   base   = última versión publicada que vio quien está publicando
   mine   = lo que envía ese navegador
   theirs = lo que hay publicado ahora mismo en GitHub
   Resultado: lo publicado + SOLO los cambios de quien publica. Así, si Miriam
   publica y luego publica Manu, los cambios de Miriam siguen ahí.
   =========================================================================== */
function _clone(o){ return (o == null) ? o : JSON.parse(JSON.stringify(o)); }
function _same(a, b){
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}
function _has(o, k){ return !!o && Object.prototype.hasOwnProperty.call(o, k); }
function _isObj(o){ return !!o && typeof o === 'object' && !(o instanceof Array); }
function _pick(b, m, t){ return _same(m, t) ? _clone(m) : (_same(m, b) ? _clone(t) : _clone(m)); }
function _mergeAny(b, m, t){
  return (_isObj(m) && _isObj(t)) ? _mergeMap(_isObj(b) ? b : {}, m, t, _mergeAny) : _pick(b, m, t);
}
function _mergeMap(base, mine, theirs, mergeVal){
  base = _isObj(base) ? base : {};
  mine = _isObj(mine) ? mine : {};
  theirs = _isObj(theirs) ? theirs : {};
  mergeVal = mergeVal || _mergeAny;
  var out = _clone(theirs);
  var keys = Object.keys(base);
  Object.keys(mine).forEach(function(k){ if (keys.indexOf(k) < 0) keys.push(k); });
  keys.forEach(function(k){
    var inB = _has(base, k), inM = _has(mine, k), inT = _has(theirs, k);
    if (!inM){ delete out[k]; return; }                       // borrado por quien publica
    if (!inB){ out[k] = inT ? mergeVal(undefined, mine[k], theirs[k]) : _clone(mine[k]); return; }
    if (_same(base[k], mine[k])) return;                      // no lo ha tocado → manda lo publicado
    out[k] = inT ? mergeVal(base[k], mine[k], theirs[k]) : _clone(mine[k]);
  });
  return out;
}
function _mergeMapSafe(b, m, t, fn){
  if (!_isObj(m)) return _clone(t) || {};
  if (!_isObj(t)) return _clone(m);
  return _mergeMap(b, m, t, fn);
}
function _listKey(x, i){ return (x && x.id != null) ? String(x.id) : ('#' + i); }
function _byId(list){
  var m = {};
  ((list instanceof Array) ? list : []).forEach(function(x, i){
    var k = _listKey(x, i); if (!_has(m, k)) m[k] = x;
  });
  return m;
}
function _mergeList(base, mine, theirs, mergeItem){
  if (!(mine instanceof Array)) return _clone(theirs) || [];
  if (!(theirs instanceof Array)) return _clone(mine);
  var merged = _mergeMap(_byId(base), _byId(mine), _byId(theirs), mergeItem || _mergeAny);
  var out = [], seen = {};
  var push = function(list){
    ((list instanceof Array) ? list : []).forEach(function(x, i){
      var k = _listKey(x, i);
      if (_has(merged, k) && !seen[k]){ seen[k] = 1; out.push(merged[k]); }
    });
  };
  push(theirs); push(mine);
  Object.keys(merged).forEach(function(k){ if (!seen[k]){ seen[k] = 1; out.push(merged[k]); } });
  return out;
}
function _without(o, skip){
  var r = {};
  Object.keys(o || {}).forEach(function(k){ if (!skip[k]) r[k] = o[k]; });
  return r;
}
var _MEMBER_SKIP = { grid: 1, projects: 1 };
function _mergeMember(b, m, t){
  if (!_isObj(m)) return _clone(t);
  if (!_isObj(t)) return _clone(m);
  b = _isObj(b) ? b : {};
  var out = _mergeMap(_without(b, _MEMBER_SKIP), _without(m, _MEMBER_SKIP), _without(t, _MEMBER_SKIP), _mergeAny);
  // el cuadrante se fusiona bloque a bloque (semana → celda)
  out.grid = _mergeMapSafe(b.grid, m.grid, t.grid, function(bb, mm, tt){
    return _mergeMapSafe(bb, mm, tt, _pick);
  });
  out.projects = _mergeList(b.projects, m.projects, t.projects);
  return _dropOrphanCells(out);
}
// Si alguien borra un proyecto mientras otra persona asigna bloques con él, la
// fusión podría dejar bloques apuntando a un proyecto inexistente: no se ven en la
// rejilla pero sí suman horas y coste. Se aplica la misma regla que al borrar un
// proyecto a mano ("se vaciarán los bloques que lo usen"). Si la lista de proyectos
// quedara vacía no se toca nada, para no arrasar un cuadrante entero.
function _dropOrphanCells(member){
  var ids = {};
  (member.projects || []).forEach(function(p){ if (p && p.id != null) ids[String(p.id)] = 1; });
  if (!Object.keys(ids).length) return member;
  Object.keys(member.grid || {}).forEach(function(wk){
    var w = member.grid[wk];
    if (!_isObj(w)) return;
    Object.keys(w).forEach(function(k){
      if (w[k] && w[k].p != null && !ids[String(w[k].p)]) delete w[k];
    });
  });
  return member;
}
var _SYNC_LISTS = ['objectives', 'notes', 'tasks', 'recurring', 'extraTasks', 'milestones', 'projects'];
function _mergeState(base, mine, theirs){
  if (!_isObj(theirs)) return _clone(mine);
  if (!_isObj(mine)) return _clone(theirs);
  base = _isObj(base) ? base : {};
  var out = _clone(theirs);
  out.config = _mergeMapSafe(base.config, mine.config, theirs.config, _mergeAny);
  out.team = _mergeList(base.team, mine.team, theirs.team, _mergeMember);
  _SYNC_LISTS.forEach(function(k){ out[k] = _mergeList(base[k], mine[k], theirs[k]); });
  out.ui = _clone(mine.ui || theirs.ui);
  return out;
}
