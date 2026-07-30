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
 *     ANTHROPIC_API_KEY  sk-ant-...  (opcional: activa el asistente de
 *                        Visión Global — icono flotante que interpreta el
 *                        cuadrante con Claude. Créala en console.anthropic.com)
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

  if (action === 'ask'){
    return _out(_askClaude(p.q || '', p.view || '', p.ctx || ''), cb);
  }

  return _out({ ok: false, error: 'Acción desconocida' }, cb);
}

/* ---- Asistente de Visión Global: interpreta el cuadrante con Claude ---- */
function _askClaude(question, view, ctx){
  question = String(question || '').trim();
  if (!question) return { ok: false, error: 'Falta la pregunta' };
  if (question.length > 800) return { ok: false, error: 'Pregunta demasiado larga (máx. 800 caracteres)' };

  var apiKey = _get('ANTHROPIC_API_KEY', '');
  if (!apiKey) return { ok: false, error: 'Falta ANTHROPIC_API_KEY en las Propiedades del script' };

  // 1) Traer el cuadrante público tal cual lo ve cualquier visitante
  //    (ya sin sueldos ni precios/hora — publishToGitHub/publishViaAppsScript los quita antes de commitear).
  var owner = _get('GITHUB_OWNER', 'artesbuhooficial-max');
  var repo = _get('GITHUB_REPO', 'cuadrante-artes-buho');
  var branch = _get('GITHUB_BRANCH', 'master');
  var dataUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/data/cuadrante-data.json';
  var dataR = UrlFetchApp.fetch(dataUrl, { muteHttpExceptions: true });
  if (dataR.getResponseCode() !== 200){
    return { ok: false, error: 'No se pudo leer el cuadrante publicado (' + dataR.getResponseCode() + ')' };
  }
  var cuadranteJson = dataR.getContentText();

  // 1b) Contexto ya calculado por Visión Global (mapa de calor, capacidades por
  //     persona, etc.): cosas que la propia app calcula en el navegador a partir
  //     de ajustes locales que NO viajan en el JSON público. Sin esto, Claude no
  //     podía explicar ni recalcular visualizaciones como el mapa de calor.
  ctx = String(ctx || '');
  if (ctx.length > 6000) ctx = ctx.slice(0, 6000);

  // 2) Preguntar a Claude, restringido EXCLUSIVAMENTE a estos datos.
  var system = 'Eres Romeo 🦉, el búho asistente de "Visión Global" del cuadrante de horas de Artes Búho. ' +
    'Hablas de forma afable y con gracia, cercano y con un puntito de humor — pero SIEMPRE centrado en ' +
    'responder exactamente lo que te preguntan, sin irte por las ramas ni alargarte. Empieza SIEMPRE tu ' +
    'respuesta, textualmente y tal cual, con "Hola, quiriditos búhos..." y a continuación responde a la ' +
    'pregunta con esos datos. Respondes EXCLUSIVAMENTE a partir de los datos que se te adjuntan: el JSON ' +
    'del cuadrante (equipo, proyectos, horas asignadas por bloques de 30 min, objetivos) y, si se incluye, ' +
    'un CONTEXTO ADICIONAL ya calculado por la propia app (p. ej. el mapa de calor con sus porcentajes ' +
    'y colores, o las capacidades semanales configuradas por persona) — trátalo con la misma fiabilidad ' +
    'que el JSON, ya que lo genera la aplicación, no el usuario. No uses conocimiento externo ni inventes ' +
    'datos que no estén en ninguno de los dos. Si la pregunta no se puede responder con estos datos, dilo ' +
    'con claridad (sin perder tu forma de ser). Responde siempre en español, en 2-4 frases, con chispa pero al grano.';

  var userContent = 'DATOS DEL CUADRANTE (JSON, ya publicado, sin datos económicos):\n' + cuadranteJson +
    (ctx ? '\n\nCONTEXTO ADICIONAL YA CALCULADO POR LA APP (coincide con lo que el usuario ve en pantalla ahora mismo):\n' + ctx : '') +
    (view ? '\n\nLa persona está mirando ahora mismo la pestaña "' + view + '" de Visión Global.' : '') +
    '\n\nPREGUNTA: ' + question;

  var payload = {
    model: 'claude-sonnet-5',
    max_tokens: 500,
    thinking: { type: 'disabled' },
    system: system,
    messages: [{ role: 'user', content: userContent }]
  };

  var aiR = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = aiR.getResponseCode();
  if (code !== 200){
    return { ok: false, error: 'Claude API ' + code + ': ' + aiR.getContentText().slice(0, 200) };
  }
  var data = JSON.parse(aiR.getContentText());
  if (data.stop_reason === 'refusal'){
    return { ok: false, error: 'No se pudo generar una respuesta a esta pregunta.' };
  }
  var answer = '';
  for (var i = 0; i < (data.content || []).length; i++){
    if (data.content[i].type === 'text') answer += data.content[i].text;
  }
  return { ok: true, answer: answer.trim() };
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
    // fusiona con los PIN ya guardados: solo se tocan las personas incluidas en el envío,
    // el resto conserva su PIN tal cual (evita borrar PINs de otros por accidente).
    var pins = _json('PINS', {});
    var incoming = body.pins || {};
    Object.keys(incoming).forEach(function(id){ pins[id] = incoming[id]; });
    _setJson('PINS', pins);
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
