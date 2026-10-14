# Publicación protegida y recuperación por persona

`safe-sync.js` es el motor puro compartido entre navegador y Apps Script. Instalar su contenido también en Apps Script junto con `SafePublish.gs` y las rutas añadidas en `Codigo.gs`. La web carga `publication-safe.js` antes de iniciar la app.

La publicación v2 compara una base vista por el navegador, su edición local y el estado actual obtenido de GitHub Contents API. Combina cambios compatibles por campo, celda e identificador. Si dos cambios afectan al mismo dato, no escribe y pide una selección explícita. La escritura usa exactamente el SHA de la lectura utilizada para la fusión; un conflicto HTTP 409 exige releer y recalcular, nunca reutilizar el contenido anterior con un SHA nuevo.

Las peticiones antiguas `publish` se bloquean con un aviso de recarga. La ruta directa del navegador con token queda sustituida por Apps Script. Si falla la lectura actual o falta la base, se bloquea antes de escribir. Se necesita actualizar la implementación de Apps Script conservando su URL y después publicar los archivos de la web. No se cambian permisos ni claves.

El navegador conserva la base, tres puntos recientes de recuperación local y el envío pendiente. Cada pestaña conserva además su propio borrador y su envío en sessionStorage para que otra pestaña no los sustituya. La clave de publicación se mantiene solo en memoria, fuera del envío guardado. Un reintento reutiliza el identificador; el servidor reconoce éxitos en caché y en las últimas 64 confirmaciones del JSON publicado. GitHub conserva además cada versión en el historial del archivo. Una sincronización y una recarga combinan cambios pendientes en vez de sustituirlos.

El importador permite seleccionar una persona y recupera sus bloques, proyectos, prioridades y registros con `owner` coincidente. No importa ni la selección de persona ni las marcas de modificación del backup. Lo nuevo que no figura en la copia se conserva; un mismo bloque o tarea se recupera del backup para la persona seleccionada y se puede revisar antes de publicar.

Las copias locales anteriores al nuevo sistema no tienen una base fiable. Al publicar se pide revisar las diferencias por persona y sección para no suponer que todos los datos antiguos son cambios intencionados.

Verificación: `node tests/safe-publication.test.cjs` y `node tests/safe-client.test.cjs`. `testSafePublish()` en el editor comprueba la lectura real de GitHub y los casos de protección sin publicar trabajo.
