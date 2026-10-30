# Dictado organizado con OpenAI

El micrófono usa la transcripción del navegador (Google en Chrome). Al detenerlo, `voice-ai.js` envía únicamente el relato y las tres fechas de referencia a Apps Script. El usuario revisa y edita la propuesta antes de guardarla en prioridades; al guardarla se sincroniza si el autoguardado está conectado.

Instalar `VoiceAI.gs` junto a `Codigo.gs` y actualizar la implementación existente, conservando su URL y permisos. En Apps Script → Configuración del proyecto → Propiedades del script, añadir `OPENAI_API_KEY` (clave de https://platform.openai.com/api-keys con permiso para crear respuestas) y opcionalmente `OPENAI_MODEL` (por defecto `gpt-4.1-mini`). La API tiene facturación propia; no se utiliza un token de sesión de ChatGPT ni el token de GitHub. No pegar la clave en conversaciones, GitHub ni en el navegador del cuadrante. Cambiar una propiedad no requiere otra implementación.

Se conservan `GITHUB_TOKEN`, `PUBLISH_KEY`, `MASTER_KEY`, `PINS` y `ECON`. `ANTHROPIC_API_KEY` y `VOICE_AI_MODEL` dejan de utilizarse, sin conexión alternativa a Anthropic. `ping` muestra proveedor, modelo y si hay clave configurada, sin revelarla. El asistente Romeo de Visión Global comparte la conexión con OpenAI y mantiene su contrato `answer`.

No se adjuntan datos de equipo, sueldos ni costes al servicio de dictado; si el usuario dicta información sensible, esa información formará parte del relato enviado. La petición usa `store:false`; esto no equivale a una garantía de ausencia de retención por parte del proveedor.

El POST requiere la clave compartida de oficina y viaja con cuerpo text/plain (no por URL). El resultado se consulta mediante un identificador aleatorio de 128 bits; caduca en caché a los cinco minutos. La clave de OpenAI permanece en el servidor. El acceso compartido de publicación puede recordarse por navegador mediante el mecanismo de autoguardado existente; no se exporta en las copias. No se registran transcripciones en logs.

La IA devuelve fecha, título, notas, tiempo real, tiempo previsto, avance y una cita literal de respaldo. Los datos desconocidos son null; antes de guardar se validan fechas, rangos y citas. No crea bloques de horario ni distribuye horas compartidas sin evidencia. Un relato repetido en otra sesión puede crear acciones repetidas: revisar antes de guardar.

Los errores distinguen clave ausente o inválida, saldo/límites, permisos, saturación y respuesta incompleta. Un fallo de OpenAI no invalida la clave de publicación ni borra el relato.

Formato basado en la [documentación oficial de salidas estructuradas](https://developers.openai.com/api/docs/guides/structured-outputs) y el [modelo GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

Pruebas simuladas: `node tests/voice-ai.test.cjs`, `node tests/voice-ai-client.test.cjs`, `node tests/voice-priorities.test.cjs`, `node tests/priorities-report.test.cjs`. La prueba real requiere configurar la clave y saldo; `testVoiceAI()` utiliza un relato ficticio sin publicar cambios.
