# Cuadrante de Oficina · Artes Búho

Aplicación web de una sola página para gestionar las **horas de oficina del equipo** con precio pautado, los **proyectos** asignados a cada bloque horario, los **objetivos en vista calendario** y una **visión mensual** del coste por días → semanas → mes completo.

Identidad corporativa de Artes Búho (azul cobalto + dorado sobre crema). No requiere build ni dependencias: es HTML + CSS + JS en un único `index.html`.

## Qué incluye

- **Cuadrante por semanas reales.** Cada semana (lunes a domingo) tiene su propia rejilla, con las fechas reales y la etiqueta de a qué semana del mes corresponde (regla del jueves ISO: la semana del 29 jun–5 jul es la *Semana 1 de julio*). Navega entre semanas con ‹ ›.
- **Por persona.** Pulsa David / Miriam / Manu para ver y editar el cuadrante de cada uno. Salario y precio/hora editables; horas y coste se recalculan solos.
- **Proyectos por bloque.** Clic en un bloque para asignarle un proyecto y una nota del momento concreto.
- **Mes · horas y coste.** Total de horas y coste del mes, desglose por semanas y un calendario con las horas/coste de cada día (intensidad por carga). Conmutable entre *Persona* y *Empresa* (equipo completo).
- **Calendario de objetivos.** Objetivos por persona o de empresa (en dorado), **vinculables a un proyecto**, con fecha límite y estado pendiente / en curso / hecho.
- **Tareas.** Pestaña con cuatro secciones: **To-Do** (con proyecto y deadline), **Recurrentes** (diaria/semanal/mensual), **Extraordinarias** (dejando constancia de quién las manda) e **Hitos** de proyecto con fecha límite. Los vencimientos se resaltan en rojo.
- **Cajón de tareas en el cuadrante.** Bajo la rejilla semanal hay una fila 📋 con una casilla por día: las tareas, hitos y **recurrentes** de ese día aparecen ahí como chips. Se marcan como hechas con un clic (la recurrente se marca solo esa semana, sin borrarse) y desde `+ tarea` se crea una nueva sin salir del cuadrante.
- **Resumen de empresa (privado).** Tabla mensual con salario, €/hora, horas, coste y delta por persona. **Solo lo ve Roman (master)** con su clave maestra; cada persona ve únicamente sus propios datos económicos. En la vista *Mes · Empresa*, el coste del equipo también queda reservado al master.

## Guardado

- **Automático en el navegador** (localStorage) en cada cambio.
- **Guardado en el proyecto:** el botón `💾 Guardar en proyecto` escribe directamente el archivo `data/cuadrante-data.json` de este repositorio (mediante la File System Access API de Chrome/Edge). Actívalo una vez, deja `Auto: ON` y cada cambio se guarda solo en ese archivo. Después solo tienes que hacer commit.
- **Backup manual:** en `⚙ Ajustes` puedes descargar/restaurar un `.json` (útil en Firefox/Safari, que no soportan el guardado directo a archivo).

Al abrir la app, se compara la copia local (localStorage) con la publicada (`data/cuadrante-data.json`) y se adopta **la más reciente** (marca de tiempo `meta.updatedAt`). Así, cuando alguien pulsa **Publicar**, el resto ve sus cambios al recargar. Si no aparecen, usa **Ajustes → ↻ Traer cambios publicados** para forzar la última versión del repositorio.

> Nota de privacidad: los datos económicos viven dentro del JSON publicado. La clave maestra y los PIN ocultan las cifras en la interfaz (se guardan solo en cada dispositivo, nunca se publican), pero no cifran el archivo. Para privacidad real habría que no publicar los sueldos o cifrarlos.

## Cómo usarlo en VS Code

1. Abre la carpeta en VS Code.
2. Instala la extensión **Live Server** (te la recomienda automáticamente).
3. Clic derecho sobre `index.html` → **Open with Live Server**. Necesitas servirlo (no abrirlo con `file://`) para que cargue `data/cuadrante-data.json` y funcione el guardado a archivo.

## Subir a GitHub

```bash
git init
git add .
git commit -m "Cuadrante de oficina · Artes Búho"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/cuadrante-artes-buho.git
git push -u origin main
```

## Publicar en GitHub Pages

1. En el repo: **Settings → Pages**.
2. **Source:** Deploy from a branch · **Branch:** `main` · carpeta `/ (root)`.
3. Guarda. En 1–2 min estará en `https://<tu-usuario>.github.io/cuadrante-artes-buho/`.

> Nota: en GitHub Pages los datos viven en el `data/cuadrante-data.json` versionado y en el localStorage de cada navegador. El guardado directo a archivo (File System Access) solo funciona en local; para publicar cambios, guarda el archivo en local y haz `git push`.

## Flujo de trabajo recomendado

1. Abre con Live Server. 2. Pulsa `💾 Guardar en proyecto` y selecciona `data/cuadrante-data.json`. 3. Deja `Auto: ON`. 4. Trabaja: cada cambio se guarda en el archivo. 5. `git add . && git commit -m "..." && git push`.

## Estructura

```
cuadrante-artes-buho/
├── index.html                 # toda la app (HTML + CSS + JS)
├── data/
│   └── cuadrante-data.json     # datos (semilla; se sobrescribe con tu uso)
├── .vscode/                    # ajustes y extensión recomendada
├── .gitignore
└── README.md
```
