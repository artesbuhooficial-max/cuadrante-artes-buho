# Publicar con Google Apps Script (token oculto + sueldos privados)

Con esto, el **token de GitHub no aparece en la web** y los **sueldos no se publican** en el
archivo público: se guardan dentro del script y solo se ven con PIN o clave maestra.

Se hace **una sola vez**. Necesitas una cuenta de Google (vale la de la oficina).

---

## 1. Crear el proyecto de Apps Script

1. Entra en <https://script.google.com> → **Nuevo proyecto**.
2. Ponle nombre, p. ej. *Cuadrante Artes Búho*.
3. Borra el contenido de `Código.gs` y pega **todo** el contenido de
   [`Codigo.gs`](./Codigo.gs) (el archivo que está junto a este).
4. Guarda (💾).

## 2. Configurar el token y los datos (Propiedades del script)

1. ⚙️ **Configuración del proyecto** (icono de rueda a la izquierda).
2. Baja hasta **Propiedades del script** → **Añadir propiedad del script**.
3. Añade estas propiedades (una por fila):

   | Propiedad       | Valor                                             |
   |-----------------|---------------------------------------------------|
   | `GITHUB_TOKEN`  | tu token de GitHub (empieza por `ghp_…`)          |
   | `GITHUB_OWNER`  | `artesbuhooficial-max`                            |
   | `GITHUB_REPO`   | `cuadrante-artes-buho`                            |
   | `GITHUB_BRANCH` | `master`                                          |
   | `MASTER_KEY`    | la clave maestra de Roman (la que quieras)        |
   | `PINS`          | `{"u1":"1234","u2":"5678","u3":"0000"}` (opcional)|

   - El **token** de GitHub se crea en GitHub → *Settings → Developer settings →
     Personal access tokens → Fine-grained tokens*, con permiso **Contents: Read & Write**
     sobre el repositorio `cuadrante-artes-buho`.
   - `PINS` es el PIN de cada persona para ver **solo su** sueldo. Las claves
     (`u1`, `u2`, `u3`, `u4`…) son los IDs internos de cada persona. Si no lo pones,
     solo Roman (con `MASTER_KEY`) verá los sueldos.
   - Guarda.

## 3. Desplegar como aplicación web

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. En el engranaje ⚙️ elige **Aplicación web**.
3. Configura:
   - **Descripción**: lo que quieras.
   - **Ejecutar como**: **Yo** (tu cuenta).
   - **Quién tiene acceso**: **Cualquier usuario**.
4. **Implementar**. Acepta los permisos que pida Google (es tu propio script).
5. Copia la **URL de la aplicación web** (termina en `/exec`).

## 4. Conectar la app

1. Abre el cuadrante → ⚙ **Ajustes**.
2. Pega la URL en **URL del Web App de Apps Script**.
3. **Guardar ajustes** → pulsa **✓ Probar conexión** (debe decir "Conexión correcta").
4. Ya puedes borrar el **Token de GitHub** del navegador: en modo Apps Script no hace falta.

## Cómo funciona a partir de ahora

- **Publicar**: el botón ☁ Publicar envía los datos al script; el script quita los
  sueldos y sube el resto a GitHub con su token. El equipo lo ve al recargar (~1 min).
- **Ver sueldos**: cada persona introduce su PIN para ver el suyo; **Roman** introduce
  la **clave maestra** para ver el Resumen y los sueldos de todos.
- Los sueldos **nunca** quedan en el archivo público `data/cuadrante-data.json`.

## Cambiar PIN o clave maestra

Edita las propiedades `PINS` / `MASTER_KEY` en *Configuración del proyecto → Propiedades
del script*. No hace falta volver a desplegar. (Si cambias el **código**, vuelve a
**Implementar → Gestionar implementaciones → Editar → Nueva versión**.)

## Nota de seguridad

Esto oculta el token y los sueldos del archivo público. El nivel de protección de los
PIN es el razonable para uso interno de oficina (no es cifrado de grado bancario). No
compartas la `MASTER_KEY` ni el token.
