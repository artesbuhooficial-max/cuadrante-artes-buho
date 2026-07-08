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
 *     PINS           {"u1":"1234","u2":"5678","u3":"0000"}   (opcional)
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
    var pub = JSON.parse(JSON.stringify(state));
    (pub.team || []).forEach(function(m){ m.salary = 0; m.rate = 0; });

    // 3) Commit del archivo público en GitHub.
    return _out(_commit('data/cuadrante-data.json', JSON.stringify(pub, null, 2)));
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

/* ---- Commit a GitHub usando el token guardado en Propiedades del script ---- */
function _commit(path, content){
  var owner  = _get('GITHUB_OWNER', 'artesbuhooficial-max');
  var repo   = _get('GITHUB_REPO', 'cuadrante-artes-buho');
  var branch = _get('GITHUB_BRANCH', 'master');
  var token  = _get('GITHUB_TOKEN', '');
  if (!token) return { ok: false, error: 'Falta GITHUB_TOKEN en Propiedades del script' };

  var api = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path;
  var headers = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cuadrante-appscript'
  };

  // SHA actual (si existe) para poder sobrescribir
  var sha = null;
  var getR = UrlFetchApp.fetch(api + '?ref=' + branch, { headers: headers, muteHttpExceptions: true });
  if (getR.getResponseCode() === 200){
    try { sha = JSON.parse(getR.getContentText()).sha; } catch (e) {}
  }

  var payload = {
    message: 'Cuadrante actualizado · ' + new Date().toISOString(),
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: branch
  };
  if (sha) payload.sha = sha;

  var putR = UrlFetchApp.fetch(api, {
    method: 'put',
    headers: headers,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = putR.getResponseCode();
  if (code === 200 || code === 201) return { ok: true };
  return { ok: false, error: 'GitHub ' + code + ': ' + putR.getContentText().slice(0, 200) };
}
