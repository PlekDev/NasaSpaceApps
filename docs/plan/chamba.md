# P.E.N. · Chamba: reparto del trabajo (dom 15 nov 2026)

> **Léelo completo antes de que tu agente toque una línea.** El "qué y por qué" está en [`upgrades.md`](upgrades.md) (U1–U16). Este documento dice **quién hace qué, en qué archivos y para cuándo**.
> Dale a tu agente de código **los dos archivos** como contexto, más `README.md`, `docs/METHOD.md`, `web/README.md` y `web/DESIGN.md`.

---

## 1. Horario (hora CDMX)

| Hora | Hito | Qué debe estar en `main` |
|---|---|---|
| **10:30–12:00** | **Fase base** | Paul: rutas, stubs de vistas, dependencias y wrapper de gráficas. Victor: mecanismo de exportadores y datos del simulador. **Nadie más toca archivos compartidos.** |
| 12:00 | Checkpoint 1 | Base mergeada; cada quien arranca en su rama sobre ese `main` |
| 14:00 | Checkpoint 2 | Primer PR de cada persona (aunque sea parcial pero funcional) |
| 16:30 | Checkpoint 3 | MVP de cada vista mergeado y funcionando en Pages |
| **19:00** | **Congelar números** | Estadísticas, controles y cualquier dato final en `data/processed/`. Después de esta hora **ningún número cambia** |
| 20:30 | Feature complete | Todo lo que no esté mergeado aquí, queda fuera |
| 20:30–22:00 | Pulido + QA del camino del juez | Solo correcciones y pulido visual |
| **22:00** | **Limpieza del repo** (sección 7) | Repo limpio y profesional |
| **22:30** | **Corte de código** | Solo correcciones críticas aprobadas por Victor |
| **≤ 23:30** | **Submit for Judging** | Angel envía; el formulario cierra 23:59 |

**Checkpoints:** stand-up de 10 min en el chat: qué está hecho, qué bloquea y qué sigue.

---

## 2. Reglas para evitar conflictos de merge (obligatorias)

1. **Una rama por persona y por tarea:** `nombre/tema` (ej. `ddona/stats`, `aaron/mission`). PRs chicos, mínimo uno cada ~2 h. Siempre `git pull origin main` antes de empezar y antes de abrir el PR.
2. **Solo editas los archivos de tu columna en la tabla de propiedad (sección 3).** Si necesitas un cambio en un archivo ajeno, se lo pides a su dueño en el chat; no lo editas tú.
3. **Archivos compartidos con un solo dueño:**
   - `web/package.json` y `web/package-lock.json` → **solo Paul** (todas las dependencias se agregan en la fase base).
   - `web/src/main.ts`, `web/src/pages.ts`, `web/src/style.css`, `web/src/tokens.css`, navegación y router → **solo Paul**.
   - `Makefile`, `config/sites.yaml`, `web/tools/export_data.py`, `pen/` → **solo Victor**.
   - `README.md`, `docs/SUBMISSION.md` → **nadie antes de las 19:00**; después, **solo Angel**.
   - `docs/METHOD.md` → nadie lo edita directo. Cada quien escribe su sección en `docs/notes/<tu-area>.md`; Victor las integra a METHOD entre 19:00 y 20:30.
4. **Datos nuevos:** cada persona escribe en **su propia carpeta** de `data/processed/` y en **su propio exportador** `web/tools/exports/<nombre>.py`, que escribe en `web/public/data/<nombre>/`. Nadie edita el exportador de otro.
5. **CSS:** cada vista usa clases con prefijo propio (`.proof-*`, `.mission-*`, `.limits-*`, `.method-*`, `.home-*`, `.dossier-*`, `.tour-*`) en **su propio archivo** `web/src/views/<vista>.css`, importado desde la vista. Los tokens globales (colores, tipografía) solo los cambia Paul.
6. **`main` siempre compila y pasa los tests:** `npm test`, `npm run build`, `python -m pytest -q`. Un PR que rompe algo no se mergea.
7. **Revisión:** cada PR con 1 aprobación. Pares: Victor ↔ Aaron · D. Lizárraga ↔ D. Dona · Angel ↔ Paul. **Paul decide el orden de merge de todo lo que toque `web/`.**
8. **Ningún número escrito a mano** en la web, el deck ni la página: todo sale de `data/processed/` → exportador → `web/public/data/`.
9. **Commits:** Conventional Commits en inglés, con tu identidad de git. **Sin `Co-Authored-By`, sin links a sesiones o conversaciones, sin "Generated with…".** Divulgación de IA: header en archivos de código + una frase en el PR.
10. **Sin marca de NASA** en nada generado. No usar imágenes generadas por IA.

---

## 3. Tabla de propiedad de archivos

| Persona | Archivos / carpetas que son SOLO suyos |
|---|---|
| **Victor** | `pen/`, `Makefile`, `config/sites.yaml`, `web/tools/export_data.py`, `web/tools/exports/sim.py`, `web/src/sim/**`, `web/tests/sim_*.test.mjs`, `tests/test_factcheck*.py`, `docs/METHOD.md` (integración) |
| **Diego Dona** | `scripts/stats/` (excepto `light_*`), `data/processed/stats/` (excepto `light_*`), `data/processed/controls/`, `data/release/`, `scripts/release_catalog.py`, `web/tools/exports/stats.py`, `web/src/views/proof.ts`, `web/src/views/proof.css`, `web/src/components/reverse.ts`, `tests/test_stats.py`, `docs/notes/validation.md` |
| **Diego Lizárraga** | `scripts/stats/light_*.py`, `data/processed/stats/light_*`, `web/tools/exports/light.py`, `web/tools/exports/limits.py`, `web/src/views/proof_light.ts`, `web/src/views/limits.ts`, `web/src/views/limits.css`, `web/src/views/method.ts`, `web/src/views/method.css`, `docs/notes/moon_mars.md`, `docs/technical_note/` |
| **Paul** | `web/package.json`, `web/package-lock.json`, `web/src/main.ts`, `web/src/pages.ts`, `web/src/style.css`, `web/src/tokens.css`, `web/src/lib/**`, `web/src/intro.ts` (Home), `web/src/explore.ts`, `web/src/detail.ts`, `web/src/views/time.ts` (When), `web/src/views/tour.ts`, `web/src/views/home.css`, `web/src/views/tour.css`, `web/DESIGN.md` |
| **Aaron** | `web/src/views/mission/**`, `web/src/views/dossier.ts`, `web/src/views/dossier.css`, `web/tests/e2e.py`, `web/tools/axe_run.py`, `web/tools/perf.py`, `.github/workflows/**`, `app/` |
| **Angel** | `README.md` y `docs/SUBMISSION.md` (después de las 19:00), `docs/deck/` (o el link externo del deck), página del proyecto en spaceappschallenge.org, GIFs |

Si un archivo no está en la tabla y lo necesitas, pregúntalo en el chat antes de crearlo o editarlo.

---

## 4. Contratos de datos (Victor los publica en la fase base)

Victor convierte `web/tools/export_data.py` en un orquestador: al final ejecuta **cada script de `web/tools/exports/*.py`** (en orden alfabético). Cada exportador:
- lee **solo** de `data/processed/` (y de `data/cache/` si es indispensable, documentándolo);
- escribe **solo** en `web/public/data/<nombre>/`;
- agrega una entrada a `web/public/data/<nombre>/index.json` con `{ "files": [...], "generated": <hash de data/processed> }`;
- usa `write_json` / `copy_atomic` de `export_data.py` (escritura atómica).

| Exportador | Dueño | Salida (`web/public/data/…`) | Contenido |
|---|---|---|---|
| `sim.py` | Victor | `sim/<target>.json`, `sim/<target>__<window>.bin` | Cuadrícula 200×200 de alturas (int16 + escala + offset), dx = 30 m, lat/lon del centro, para cada target y sus top-5 ventanas terrestres |
| `stats.py` | D. Dona | `stats/null.json`, `stats/roc.json`, `stats/bootstrap.json`, `stats/stability.json`, `stats/tornado.json`, `stats/decomp.json`, `stats/controls.json` | Resultados de la sección 5.2 |
| `light.py` | D. Lizárraga | `light/<target>.json` | Densidad modelo vs LOLA, Bland-Altman, residuos submuestreados |
| `limits.py` | D. Lizárraga | `limits/<target>.json` | Térmico (Diviner/MCD/LST), hielo, EMIT, matriz de fidelidad |

**Fase base:** cada dueño sube primero un exportador con **datos de ejemplo con la forma final** (mismas llaves, valores dummy marcados `"_stub": true`), para que las vistas se programen en paralelo. Los datos reales reemplazan al stub sin cambiar la forma.

---

## 5. Tareas por persona

> Formato: **ID · tarea** → archivos → criterio de terminado. Los IDs U# remiten a `upgrades.md`.

### 5.1 Victor · Tech lead, núcleo y datos

**V1 · Orquestador de exportadores (fase base, ≤ 11:30)**
→ `web/tools/export_data.py`, `Makefile`
- Ejecuta `web/tools/exports/*.py` al final del export; target `make web-data`.
- ✅ `make web` sigue funcionando y llama a los exportadores nuevos.

**V2 · Datos del simulador (fase base, ≤ 12:00)** · U6
→ `web/tools/exports/sim.py`
- Cuadrículas 200×200 de cada target (9) y de sus top-5 ventanas terrestres, desde las mismas grillas de `scripts/extras/`. Medir el tamaño total (meta < 15 MB) y cargar por target.
- ✅ Aaron puede cargar una cuadrícula real en la vista Mission.

**V3 · Núcleo del simulador en TypeScript** · U6, U7
→ `web/src/sim/shadows.ts`, `sun.ts`, `route.ts`, `telemetry.ts`, `rehearse.ts`, `index.ts`
- `shadows.ts`: puerto exacto de `pen/shadows.py` (rotación + máximo acumulado por fila).
- `sun.ts`: puerto de `pen/sun.py` (Tierra) + modelo del Sol en el polo lunar (elevación −5° a +6.5° según azimut, como en `docs/EXTRAS.md`).
- `route.ts`: Dijkstra/A* con la función de costo de `scripts/extras/rover_twin.py` (1 + (pendiente/10°)² + 3 × sombra; > 20° intransitable).
- `telemetry.ts`: longitud, ascenso, pendiente máx/media, % en sombra, energía solar relativa, tiempo.
- `rehearse.ts` (**U7, función estrella**): para una ruta lunar, busca en los próximos 12 meses las ventanas de fecha y hora en que el Sol del análogo terrestre tiene elevación 0–7° y una dirección compatible; calcula la **rehearsal fidelity** (% de la ruta con la misma condición luz/sombra en ambos cuerpos). Fórmula documentada en `docs/notes/sim.md`.
- API estable exportada desde `web/src/sim/index.ts` para que Aaron la consuma. **Publica la firma de la API a las 12:00, aunque la implementación siga.**
- ✅ Tests de paridad con Python: sombras ≥ 99 % de celdas iguales; ruta y métricas ±2 %; Sol ±0.1°. Fixtures generados por `web/tools/exports/sim.py` en modo `--fixtures`.

**V4 · Integración de METHOD y números (19:00–20:30)**
→ `docs/METHOD.md`
- Integra `docs/notes/*.md` en METHOD con estilo uniforme.
- ✅ METHOD describe cada método nuevo con sus fórmulas y límites.

**V5 · Coherencia de números** · U16
→ `tests/test_factcheck*.py`
- Extiende el fact-check a los textos generados de la web (`web/public/data`) y a una lista `docs/numbers.json` con los números del deck que Angel llena.
- ✅ Si un número del README, del deck o de la web no coincide con `data/processed`, CI falla.

**V6 · Escalabilidad (U13), reproducibilidad y release**
→ `docs/notes/scale.md`, `Makefile`
- Medir el tiempo real por tile de 1° y documentar qué implicaría correr toda la tierra firme.
- `make all` reproduce todo de punta a punta; documentar tiempos.
- Con Aaron (admin del repo): **release `v1.0` + DOI de Zenodo** a las 22:30, después de la limpieza.

### 5.2 Diego Dona · Validación y datos de la Tierra

**D1 · Estadística avanzada: pruebas 1 y 3** · U4
→ `scripts/stats/*.py`, `data/processed/stats/*.json`, `tests/test_stats.py`
- `null_test.py`: **test nulo por permutación**: N ≥ 10,000 conjuntos de 8 puntos al azar dentro de las mismas regiones → p-valor de la mediana de percentiles y del rank de Pu'u Hiwahine por sitio lunar. Semilla fija.
- `roc.py`: curva ROC y **AUC**: ventanas que contienen análogos conocidos vs el resto.
- `bootstrap.py`: **IC 95 % del score** por ventana top (remuestreando las ventanas de referencia de cada target).
- `stability.py`: probabilidad de seguir en top-1/top-10 con pesos aleatorios (Dirichlet) + **Kendall τ** entre rankings de 3/6/12 km.
- `tornado.py`: sensibilidad del score a cada feature; `decomp.py`: contribución de cada feature a la distancia, por ventana del top.
- ✅ Todo reproducible con `python scripts/stats/<x>.py`; tests con datos sintéticos; resultados con fecha y semilla.

**D2 · Regiones de control** · U4
→ `scripts/stats/controls.py`, `data/processed/controls/`
- 2–3 tiles de Copernicus sin interés lunar ni marciano (llanura agrícola, selva, etc.), justificados en `docs/notes/validation.md`.
- Puntuarlas con las funciones de `pen/` **sin modificar `pen/` ni `config/sites.yaml`**, usando el mismo IQR y las mismas referencias que la corrida principal. **Los números principales (10,424 ventanas, rankings) no cambian.**
- ✅ Tabla: distribución de scores de los controles vs regiones candidatas. Listo **antes de las 17:00**.

**D3 · Exportador y vista "Proof"** · U4, U2
→ `web/tools/exports/stats.py`, `web/src/views/proof.ts`, `web/src/views/proof.css`
- La vista reemplaza a Validation con **"The 3 proofs"**: (1) prueba ciega con la distribución nula + nuestro resultado, AUC y controles; (2) importa el componente de Lizárraga `proof_light.ts`; (3) robustez: IC, estabilidad, Kendall τ, tornado.
- Cada prueba: conclusión de una línea + gráfica ECharts (con `web/src/lib/chart.ts` de Paul) + "Read more" con método y tablas.
- ✅ Cero PNG de fondo blanco; todo interactivo y en tema oscuro/claro.

**D4 · Búsqueda inversa** · U8
→ `web/src/components/reverse.ts`
- `renderReverse(el, windowId, data)`: ranking de los 9 objetivos para la ventana seleccionada, con qué se parece y qué no. **Paul la conecta en Explore.**

**D5 · Catálogo abierto (dataset)**
→ `scripts/release_catalog.py`, `data/release/pen_analog_catalog.csv`, `.geojson`, `data/release/README.md`
- Las 10,424 ventanas con scores por target, LST y EMIT, licencia (código MIT; datos con su fuente y crédito).

**D6 · Novedad y validación externa**
→ `docs/notes/validation.md` (sección "Prior work")
- **Búsqueda de literatura** (NASA ADS, Google Scholar) para comprobar si ya existe una herramienta que puntúe análogos por iluminación de Sol bajo validada contra LOLA. Entregar a Angel una frase verificada (o la conclusión de que no se puede afirmar novedad).
- **Cita de un experto:** en el evento local, pedirle a un mentor, juez o profesor del área que revise P.E.N. 10 min; si da su permiso, cita textual con nombre y cargo para la página.

**D7 · Validación terrestre con Landsat (stretch)** · U14
- Solo si D1–D5 están mergeados. Sombras del modelo vs una escena Landsat con Sol bajo sobre Mauna Kea.

### 5.3 Diego Lizárraga · Luna y Marte

**L1 · Prueba 2: luz contra NASA** · U4
→ `scripts/stats/light_agreement.py`, `data/processed/stats/light_*.json`, `web/tools/exports/light.py`
- Por sitio lunar: dispersión de densidad modelo vs LOLA, **Bland-Altman** (sesgo y límites de acuerdo), mapa de residuos submuestreado, alcance de los rayos, sombra permanente vs LPSR.

**L2 · Componente de la prueba 2**
→ `web/src/views/proof_light.ts`
- Exporta `renderLightProof(el, data)`, que D. Dona importa en `proof.ts`. Reemplaza las Fig. 4 y 7 estáticas por gráficas interactivas.

**L3 · Vista "Limits": where the analogy breaks** · U5
→ `web/tools/exports/limits.py`, `web/src/views/limits.ts`, `web/src/views/limits.css`
- Térmico en una sola escala en K (Diviner / Mars Climate Database / MODIS LST) con el récord mínimo terrestre (184 K) marcado; hielo estable ≤ 1 m; EMIT (óxidos de hierro como cota inferior; hallazgo de Atacama); gravedad, vacío y radiación; **matriz de fidelidad** por par de sitios.

**L4 · Marte al mismo nivel** · U12
- Contenido de los 3 objetivos marcianos en Limits (MCD, Deuteronilus con hielo enterrado, arcillas y carbonatos de EMIT para Jezero). Le pasa a Paul el dato del atajo Jezero ↔ Chichinautzin para Home.

**L5 · Vista "Method" visual** · U11
→ `web/src/views/method.ts`, `web/src/views/method.css`
- Diagrama SVG del flujo (DEMs → grilla de 30 m → sombras O(N) → 7 features → IQR → score → validación), fórmulas con KaTeX, tabla de datos con nombres exactos y links, texto largo en "Read more".

**L6 · Nota técnica de 2 páginas (estilo abstract LPSC)**
→ `docs/technical_note/PEN_technical_note.md` → PDF
- Pregunta, método, resultados (con los números congelados de las 19:00), limitaciones y referencias. Revisada por Victor. Angel la enlaza en la página.

### 5.4 Paul · UI/UX e integrador de la web

**P1 · Base de la web (fase base, ≤ 12:00)** · U2, U3
→ `web/package.json`, `web/src/main.ts`, `web/src/pages.ts`, `web/src/lib/chart.ts`, `web/src/lib/lazy.ts`
- Agregar **de una vez** `echarts`, `three`, `katex`, `scrollama` (con carga diferida por vista).
- `lib/chart.ts`: wrapper de ECharts con el tema de `tokens.css` (oscuro/claro), redimensionado y accesibilidad (resumen textual de cada gráfica).
- **Rutas nuevas:** `#/` Home, `#/explore`, `#/proof`, `#/mission`, `#/when`, `#/limits`, `#/method`, `#/dossier`, `#/tour`. Redirigir `#/validation` → `#/proof` y `#/time` → `#/when`.
- Crear los **archivos stub** de cada vista (`proof.ts`, `limits.ts`, `mission/index.ts`, `dossier.ts`, `tour.ts`) con una función `render(el, m)` vacía, para que cada dueño solo edite su archivo.
- ✅ `main` compila con todas las rutas navegables (aunque vacías) a las 12:00.

**P2 · Home y camino del juez** · U1
→ `web/src/intro.ts`, `web/src/views/home.css`
- Abre en **Malapert Massif ↔ Pu'u Hiwahine**. Secuencia: globo → vuelo a Mauna Kea → marcador del sitio de NASA → *"NASA rehearsed a lunar-pole mission here in 2012 · P.E.N. found it #1 of 10,424, blind"* → "See the proof".
- 3 números grandes (rank, ρ, **p-valor** desde `stats/null.json`); atajos a Luna, Marte (Jezero ↔ Chichinautzin) y México (Pinacate).
- Sello permanente de validación en la UI. Respetar `prefers-reduced-motion`.
- ✅ Una persona sin contexto entiende el gancho en ≤ 10 s.

**P3 · Rediseño de Explore y When** · U2
→ `web/src/explore.ts`, `web/src/detail.ts`, `web/src/views/time.ts`
- Tarjeta del análogo con IC del score y descomposición por feature (de `stats/`); integrar `reverse.ts` de D. Dona.
- When abre en **Mauna Kea**. Aaron mejoró esta vista en el PR #16: conservar su trabajo y coordinar con él.

**P4 · Tour guiado** · U10
→ `web/src/views/tour.ts`, `web/src/views/tour.css`
- Recorrido de ~60 s con Scrollama: prueba ciega → luz validada → dónde se rompe → cuándo ir → ensayar la misión. Botón en Home.

**P5 · Integración y QA visual (continuo)**
- Decide el orden de merge de todo `web/`; revisa consistencia visual, celular y proyector; captura pantallas y GIFs con Angel.

### 5.5 Aaron · Ingeniería de la app, simulador 3D, deploy y QA

**A1 · Vista "Mission": Mission Rehearsal 3D** · U6
→ `web/src/views/mission/**` (`index.ts`, `scene.ts`, `controls.ts`, `telemetry.ts`, `mission.css`)
- Dos escenas **three.js** lado a lado (Luna/Marte | Tierra) con cámara sincronizada; malla 200×200 con exageración vertical ajustable **e indicada**; sombras pintadas desde `web/src/sim/shadows.ts` (no las de three.js).
- Controles: target, ventana terrestre (top-5), Sol (slider y "Play"), clic de inicio y fin de ruta.
- Cámaras: orbital, **astronauta a 1.7 m**, seguimiento del rover. Animación del rover por la ruta.
- Panel de telemetría lado a lado (desde `web/src/sim/telemetry.ts`).
- Respaldo sin WebGL: vista 2D con la misma telemetría.
- Mientras Victor termina `web/src/sim/`, programar contra la API publicada a las 12:00.

**A2 · "Rehearse this traverse on Earth, on this date"** · U7
→ `web/src/views/mission/rehearse.ts`
- Lista de ventanas de fecha y hora (de `web/src/sim/rehearse.ts`), con la **fidelity** de cada una; botón para descargar el `.ics`; botón "Add to dossier".

**A3 · Dossier de misión descargable** · U9
→ `web/src/views/dossier.ts`, `web/src/views/dossier.css`
- `#/dossier?target=…&window=…`: una página con CSS de impresión → "Save as PDF". Contenido: rank y percentiles, score con IC, mejores fechas (A2), ruta y telemetría, Limits, EONET, LST y EMIT, datos y créditos. Reutilizar `data/processed/briefs/`.

**A4 · QA y deploy** · U16
→ `web/tests/e2e.py`, `web/tools/axe_run.py`, `web/tools/perf.py`, `.github/workflows/**`
- e2e del **camino del juez**: Home → Malapert #1 → Proof → Mission (ruta + fecha) → Dossier, en Chromium, Firefox y WebKit.
- Sin errores en consola; axe sin violaciones; rendimiento aceptable en móvil (contenido visible < 2 s).
- Verificar Pages después de cada merge.

**A5 · Release y app vieja**
- Con Victor: release `v1.0` + integración Zenodo (DOI) a las 22:30.
- Decidir con el equipo qué pasa con el Streamlit (`app/`): o queda como alternativa documentada, o se retira en la limpieza (sección 7).

### 5.6 Angel · Presentación y envío

**G1 · Deck de 7 slides** · U15
- Estructura de `upgrades.md` U15: títulos que afirman el resultado, un visual por slide, inglés, sin marca de NASA, **exactamente ≤ 7 slides** (sin slide extra de gracias ni referencias).
- Borrador con placeholders desde ya; **números finales después de las 19:00**; los números del deck van en `docs/numbers.json` para el fact-check de Victor.
- Link público, probado en ventana privada.

**G2 · Página del proyecto** · U15
- Todos los campos: resumen con la prueba ciega y ρ en el primer párrafo; descripción detallada; **tabla de trazabilidad** (objetivo del reto ↔ función); **NASA Data** con nombres exactos de producto y links; ESA Copernicus en agencias socias; Use of AI; respuestas a preguntas de juez; link a la nota técnica (L6), al DOI de Zenodo y al catálogo abierto (D5).
- **Historia humana:** estudiantes en México que encontraron, con datos abiertos, los mejores lugares de su país para ensayar misiones lunares.
- **Cita del experto** (D6), si se consiguió y con permiso.

**G3 · GIFs (≤ 10 MB c/u)**
- Con Paul y Aaron: vuelo al sitio de NASA, barrido de sombras 3D, Rehearse on date.

**G4 · README y SUBMISSION (después de las 19:00)**
- Actualizar con las nuevas vistas y números congelados; el fact-check de CI debe pasar.

**G5 · Ensayo del pitch**
- 3 ensayos con el equipo, incluyendo las preguntas difíciles: "¿y si es suerte?" (test nulo), "¿por qué solo 14 regiones?" (escalabilidad), "¿por qué 6 km?", "¿por qué Spearman?".

**G6 · Envío**
- Revisión final en ventana privada de todos los links (web, repo, deck, nota, DOI) → **Submit for Judging antes de las 23:30**. Todos descargan su certificado.

---

## 6. Dependencias entre personas

| Quién espera | Qué | De quién | Para cuándo |
|---|---|---|---|
| Todos los de `web/` | Rutas, stubs, deps, `lib/chart.ts` | Paul (P1) | 12:00 |
| D. Dona, D. Lizárraga | Orquestador de exportadores | Victor (V1) | 11:30 |
| Aaron | Cuadrículas del simulador y firma de la API de `web/src/sim/` | Victor (V2, V3) | 12:00 |
| Paul (Home) | `stats/null.json` con la forma final (stub) | D. Dona (D3) | 12:00 (real: 17:00) |
| D. Dona (Proof) | `proof_light.ts` | D. Lizárraga (L2) | 16:30 |
| Paul (Explore) | `reverse.ts` | D. Dona (D4) | 16:30 |
| Aaron (Dossier) | Limits y stats exportados | D. Lizárraga (L3), D. Dona (D3) | 17:00 |
| Angel | Números congelados | Todos | **19:00** |
| Angel | Capturas y GIFs | Paul, Aaron | 21:00 |

---

## 7. ⚠️ Limpieza del repo (22:00, ANTES del envío)

El repo es parte de lo que ven los jueces: tiene que verse profesional. **Responsables: Victor (ejecuta) y Angel (verifica).**

**Borrar del repo:**
- [ ] `docs/plan/` (este `chamba.md` y `upgrades.md`)
- [ ] `docs/notes/` (después de integrarlo a METHOD)
- [ ] `docs/drafts/`
- [ ] `docs/issues/` y `scripts/create_issues.sh`
- [ ] `docs/TEAM.md` (plan interno; los roles quedan en el README)
- [ ] `web/PROGRESS.md` y `web/DECISIONS.md` (notas internas; lo útil va a `web/README.md`)
- [ ] Cualquier carpeta local tipo `Claude outputs/`, archivos temporales, `.DS_Store`, notebooks de prueba
- [ ] `app/` (Streamlit) **solo si** el equipo decide retirarlo (A5); si se queda, documentarlo en el README como alternativa
- [ ] Ramas viejas mergeadas en GitHub (`MoonAndMars`, `aaron-*`, `angel/*`, `ddona/*`, `paul/*`, `web/*`, `extras/*`, `validation-ray-reach`)

**Verificar:**
- [ ] No hay secretos (`.netrc`, `.env`, tokens), ni `data/raw/`, `data/cache/`, `node_modules/`, `dist/`, `.venv/`
- [ ] El README tiene: qué es, link a la web, resultados clave, cómo reproducir (`make all`), datos y créditos, Use of AI, licencia y equipo
- [ ] `python -m pytest -q`, `npm test`, `npm run build` y el fact-check pasan en `main`
- [ ] La web en Pages funciona en ventana privada y en el celular
- [ ] Release `v1.0` creado y DOI de Zenodo en el README

**Después del evento (cada quien en su compu, no en el repo):** borrar `data/cache/`, `data/raw/` (salvo `.gitkeep`), `.venv/`, `web/node_modules/`, `web/dist/` y los entornos conda/micromamba que hayan creado.

---

## 8. Si algo se atrasa (orden de recorte)

1. **Se protege siempre:** Home/camino del juez (P2), deck y página (G1, G2), QA (A4), limpieza (sección 7).
2. Rehearse on date (V3 `rehearse.ts` + A2) sobre una versión mínima de Mission (A1 sin cámaras extra).
3. Las 3 pruebas (D1, D3, L1, L2).
4. Limits (L3).
5. Rediseño de Explore y When (P3).
6. Búsqueda inversa (D4), dossier (A3), tour (P4), Method visual (L5), Marte (L4).
7. Controles (D2), escalabilidad (V6), Landsat (D7).

**Regla:** a las 20:30, lo que no esté mergeado y funcionando **no entra**. Mejor una función menos que una vista rota.
