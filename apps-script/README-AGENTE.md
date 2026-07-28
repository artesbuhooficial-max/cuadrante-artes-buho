# Instrucciones para un agente (Claude Cowork u otro) — Desplegar el Apps Script

Este documento es para que un agente con navegador (no para un humano leyendo por encima)
despliegue `Codigo.gs` como Google Apps Script Web App y lo conecte al Cuadrante de Artes
Búho. Sigue los pasos en orden. Cada paso indica quién debe ejecutarlo:

- 🤖 **Agente**: lo puedes hacer tú solo, sin intervención humana.
- 🧑 **Humano**: requiere login, 2FA, o un dato secreto que el humano debe escribir o
  proporcionar en el momento. No lo inventes, no lo pidas por chat/texto plano, no lo
  guardes en ningún archivo del repositorio.

## Qué se está montando y por qué

Ahora mismo, publicar el cuadrante usa un token personal de GitHub guardado en el propio
navegador de cada persona — eso expone los sueldos de todo el equipo en el archivo
público `data/cuadrante-data.json` y obliga a copiar credenciales sensibles entre
ordenadores. El objetivo es mover ese token a un único sitio seguro (un script de Google
que solo el dueño de la cuenta controla) para que:

1. Nadie necesite un token propio en su navegador para publicar.
2. Los sueldos dejen de subirse al archivo público.
3. Cualquier ordenador nuevo pueda publicar sin configuración manual (la URL del script
   se propaga sola una vez se publica una vez desde un dispositivo ya configurado).

## Paso 1 — Crear el proyecto de Apps Script 🤖 (con 🧑 si pide login)

1. Navega a `https://script.google.com/`.
2. Si pide iniciar sesión con una cuenta de Google, **detente y pide al humano que inicie
   sesión** con la cuenta de Google de la oficina (o la que quiera usar para esto). No
   intentes adivinar ni crear una cuenta nueva.
3. Clic en **Nuevo proyecto**.
4. Ponle de nombre `Cuadrante Artes Búho`.
5. Borra todo el contenido del editor (`Código.gs`).
6. Pega **exactamente** el contenido completo del archivo
   [`apps-script/Codigo.gs`](./Codigo.gs) de este repositorio. No lo modifiques.
7. Guarda con el icono de disquete (o Ctrl+S).

## Paso 2 — Configurar las Propiedades del script 🤖 + 🧑 (dos valores secretos)

1. En el panel izquierdo, clic en el icono de engranaje **⚙️ Configuración del proyecto**.
2. Baja hasta **Propiedades del script** → **Añadir propiedad del script**.
3. Añade estas seis propiedades (nombre exacto a la izquierda, valor a la derecha):

   | Propiedad | Valor | Quién lo da |
   |---|---|---|
   | `GITHUB_OWNER` | `artesbuhooficial-max` | 🤖 (valor fijo, ya lo sabes) |
   | `GITHUB_REPO` | `cuadrante-artes-buho` | 🤖 (valor fijo, ya lo sabes) |
   | `GITHUB_BRANCH` | `master` | 🤖 (valor fijo, ya lo sabes) |
   | `GITHUB_TOKEN` | un token de GitHub nuevo | 🧑 — ver Paso 2b |
   | `MASTER_KEY` | la clave maestra de Roman | 🧑 — pídesela al humano en este momento |
   | `PINS` | `{"u1":"1234","u2":"5678",...}` (opcional) | 🧑 — opcional, pregunta si la quiere |

4. Guarda las propiedades.

### Paso 2b — Generar el `GITHUB_TOKEN` 🧑 (requiere login en GitHub)

Esto **no lo debe rellenar el agente sin supervisión**: es una credencial de escritura
sobre el repositorio.

1. Pide al humano que vaya a `https://github.com/settings/personal-access-tokens/new`
   (o guíalo tú si tiene sesión iniciada de GitHub en el navegador).
2. Tipo: **Fine-grained token**.
3. **Repository access**: Only select repositories → `cuadrante-artes-buho`.
4. **Permissions → Repository permissions → Contents**: `Read and write`.
5. Generar token → copiarlo (empieza por `github_pat_` o `ghp_`).
6. Pegarlo como valor de `GITHUB_TOKEN` en las Propiedades del script del Paso 2.
7. **No escribas este token en ningún otro sitio**: ni en este repo, ni en el chat, ni en
   commits. Solo vive en las Propiedades del script de Google.

## Paso 3 — Desplegar como aplicación web 🤖 (con 🧑 en la pantalla de permisos)

1. Arriba a la derecha, clic en **Implementar → Nueva implementación**.
2. Clic en el engranaje ⚙️ junto a "Seleccionar tipo" → **Aplicación web**.
3. Rellena:
   - **Descripción**: `Publicación cuadrante`.
   - **Ejecutar como**: **Yo** (la cuenta que ha iniciado sesión).
   - **Quién tiene acceso**: **Cualquier usuario**.
4. Clic en **Implementar**.
5. Google pedirá **Autorizar acceso** y probablemente muestre un aviso de "Google no ha
   verificado esta aplicación" (normal, es un script propio del humano). **Este paso
   requiere que el humano lo confirme**: clic en el nombre de la cuenta → "Ir a Cuadrante
   Artes Búho (no seguro)" → **Permitir**. Si el agente puede hacer clic solo, hazlo, pero
   avisa al humano de que lo estás haciendo en su nombre con su propia cuenta.
6. Copia la **URL de la aplicación web** (termina en `/exec`). Guárdala para el paso 4.

## Paso 4 — Conectar la URL al cuadrante 🤖

1. Abre `https://artesbuhooficial-max.github.io/cuadrante-artes-buho/`.
2. Clic en **⚙ Ajustes**.
3. Pega la URL del Paso 3 en el campo **"URL del Web App de Apps Script"**.
4. Clic en **Guardar ajustes**.
5. Clic en **✓ Probar conexión** → debe aparecer el mensaje "✓ Conexión correcta con Apps
   Script". Si falla, revisa que la implementación del Paso 3 tenga **Quién tiene
   acceso: Cualquier usuario** y que la URL termine en `/exec` (no `/dev`).
6. Clic en **☁ Publicar** una vez.

## Paso 5 — Verificar (🤖, verificación automática)

1. Descarga `https://artesbuhooficial-max.github.io/cuadrante-artes-buho/data/cuadrante-data.json?t=<timestamp>`.
2. Comprueba:
   - `config.appsUrl` es igual a la URL del Paso 3.
   - Todos los objetos en `team[]` tienen `"salary":0` y `"rate":0`.
3. Si ambas condiciones se cumplen, el despliegue está correcto.

## Paso 6 — Limpieza final 🤖

1. Vuelve a **⚙ Ajustes** en el cuadrante.
2. Borra el contenido del campo **"Token de GitHub"** (ya no hace falta: el token vive
   solo en el script, nunca en el navegador).
3. Clic en **Guardar ajustes**.

## Si algo falla

- **"Conexión correcta" no aparece**: revisa el Paso 3.3 (Quién tiene acceso: Cualquier
  usuario) y que copiaste la URL `/exec`, no `/dev`.
- **Publicar da error de GitHub**: el `GITHUB_TOKEN` de las Propiedades del script no
  tiene permiso de escritura sobre el repo, o caducó — vuelve al Paso 2b.
- **Las claves/PIN no funcionan**: revisa `MASTER_KEY` y `PINS` en las Propiedades del
  script (Paso 2); se pueden cambiar ahí sin volver a desplegar nada.
