# Dictado organizado con IA

El micrófono usa la transcripción del navegador (Google en Chrome). Al detenerlo, `voice-ai.js` envía únicamente el relato y las tres fechas de referencia a Apps Script. El usuario revisa y edita la propuesta antes de guardarla en prioridades; Publicar sigue siendo una acción independiente.

Instalar `VoiceAI.gs` junto a `Codigo.gs` y actualizar la implementación existente, conservando su URL. Usa las propiedades privadas ya existentes `PUBLISH_KEY` y `ANTHROPIC_API_KEY`. `VOICE_AI_MODEL` es opcional (por defecto `claude-sonnet-4-6`). No se adjuntan datos de equipo, sueldos ni costes al servicio de IA; si el usuario dicta información sensible, esa información formará parte del relato enviado.

El POST requiere la clave compartida de oficina y viaja con cuerpo text/plain (no por URL). El resultado se consulta mediante un identificador aleatorio de 128 bits; caduca en caché a los cinco minutos. No se guardan claves en localStorage ni se registran transcripciones en logs.

La IA devuelve fecha, título, notas, tiempo real, tiempo previsto, avance y una cita literal de respaldo. Los datos desconocidos son null; antes de guardar se validan fechas, rangos y citas. No crea bloques de horario ni distribuye horas compartidas sin evidencia. Un relato repetido en otra sesión puede crear acciones repetidas: revisar antes de guardar.

Formato basado en la [documentación oficial de salidas estructuradas](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Pruebas: `node tests/voice-ai.test.cjs`, `node tests/voice-priorities.test.cjs`, `node tests/priorities-report.test.cjs`.
