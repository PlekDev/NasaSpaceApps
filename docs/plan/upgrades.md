# P.E.N. · Upgrades: plan para llevar el proyecto al máximo

> **Para:** equipo Pollones en Fuga · **Fecha:** dom 15 nov 2026
> **Corte de código:** 22:30 · **Congelar números:** 19:00 · **Enviar:** antes de las 23:30 (el formulario cierra 23:59 hora local)
> **Objetivo:** pasar de ~8.5 a ~9.8 en los 5 criterios de juicio, con todo comunicado en **7 slides**.

---

## 0. Resumen en 10 líneas

1. La ciencia ya está a nivel de finalista global: prueba ciega (#1 de 10,424), luz validada contra NASA (ρ 0.92–0.99), sombra permanente contra LPSR, LST y EMIT.
2. Lo que nos separa de ganar **no es más ciencia, es cómo se vive y se entiende**: UI, historia y camino del juez.
3. Premio objetivo: **Best Use of Science**. Secundarios: Best Use of Data, Best Mission Concept, Local Impact.
4. Función estrella nueva: **"Rehearse this traverse on Earth, on this date"**, que une el *dónde* (ranking), el *cuándo* (análogo en el tiempo) y el *cómo* (rover, sombras 3D).
5. Validez a prueba de escépticos: **test nulo (p-valor), regiones de control, intervalos de confianza y estabilidad del ranking**.
6. Rediseño de la UI alrededor de un **camino del juez de 60 s**, con gráficas interactivas nativas (adiós a los PNG de fondo blanco).
7. Nuevas vistas: **Mission Rehearsal 3D**, **Where the analogy breaks**, **búsqueda inversa**, **dossier descargable** y **tour guiado**.
8. Stack: se conserva Vite + TypeScript + MapLibre (el globo se queda) y se agregan **Apache ECharts**, **three.js**, **KaTeX** y **Scrollama**.
9. Regla de oro: **cada número sale de `data/processed/`** y es idéntico en web, deck, página y README.
10. Si hay que recortar: camino del juez y deck → Rehearse on date → pruebas de validez → resto.

---

## 1. Contexto de la investigación

### 1.1 Cómo se juzga (fuente oficial)
- **5 criterios:** Influence/Impact, Creativity, Validity, Relevance, Presentation (Judging & Awards Guide).
- **Proceso:** los jueces locales nominan → expertos de NASA y agencias socias eligen *Global Finalists* → un comité ejecutivo elige 10 *Global Winners*.
- **Best Use of Science:** "The project that makes the best and most valid use of the scientific method."
- **Best Use of Data:** "The project that best makes space data accessible, or leverages it to a unique application."
- **Best Mission Concept:** "The project with the most plausible concept and design."
- **Local Impact:** "The project that demonstrates the greatest potential for making a difference in their local community."

### 1.2 Reglas que NO se pueden fallar (Project Submission Guide)
- Demo: **video ≤ 30 s o deck ≤ 7 slides incluyendo la portada.** Pasarse = no elegible para Global Judging. Una slide extra de "Gracias" o "Referencias" también cuenta.
- Todo en **inglés**.
- Links **públicos sin login**; probar en ventana privada.
- La página del proyecto acepta imágenes **JPG/PNG/GIF de hasta 10 MB** (no video ni documentos). Usaremos GIFs.
- Contenido generado con IA: **sin marca de NASA**; imágenes/video de IA con **marca de agua visible**; declarar la IA en su campo.
- Usar datos de NASA es requisito para un premio global.
- Enviar con "Submit for Judging" antes de las 23:59 hora local del evento. **El envío es final.**

### 1.3 Ganadores verificados (útiles como referencia)
| Año | Premio | Equipo | Reto | Lección para nosotros |
|---|---|---|---|---|
| 2025 | Best Use of Science | SpaceGenes+ (Berlín) | Build a Space Biology Knowledge Engine | Datos de NASA + método cuantitativo + visualización accesible |
| 2025 | Best Use of Data | Resonant Exoplanets (EE. UU.) | A World Away: Hunting for Exoplanets with AI | Herramienta pública que filtra falsos positivos con física |
| 2025 | Best Use of Technology | **Twisters (Monterrey, México)** | Will It Rain on My Parade? | Precedente mexicano: web app clara que responde una pregunta concreta y da ventanas de tiempo |
| 2024 | Best Use of Science | WMPGang (Canadá) | Orrery Web App for Near-Earth Objects | Web app interactiva con datos reales |
| 2023 | Best Use of Science | LunarTech Ensemble (Egipto) | Make a Moonquake Map 2.0! | Un tema lunar ganó Best Use of Science |

**Patrón común:** herramienta visual e interactiva + datos de NASA + rigor cuantitativo + una pregunta concreta que el usuario puede responder en segundos.

### 1.4 Errores del estudio de Gemini que NO deben copiarse
| Gemini dice | Correcto |
|---|---|
| Video de "30 s o 240 s" | Solo **30 s** o **7 slides** |
| Sitios: Cabeus, Mawrth Vallis | Luna: **Shackleton Connecting Ridge, Nobile Rim 1, de Gerlache Rim, Malapert Massif, Haworth, Leibnitz Beta Plateau**. Marte: **Arcadia Planitia, Jezero, Deuteronilus Mensae** |
| Datos "MRO MOLA", "SRTM/NASADEM" | **MRO CTX DTMs** (Marte) y **ESA Copernicus DEM GLO-30** (Tierra) |
| Diviner "40–390 K" | Usar los números de `data/processed/diviner.json` |
| "Heatmap de 52 semanas" | El análogo en el tiempo es **horas/día por mes** (o lo que de verdad implementemos) |
| "Menos del 5 % de equipos valida…" | Sin fuente: **no usar** |

Úsalo como guía de **formato**, nunca como fuente de **números**.

---

## 2. Diagnóstico actual (web pública revisada el dom 09:40)

**Lo que funciona:** portada con globo y gancho de la prueba ciega; Explore con pesos 1/1 coherente con el README (91/100); Validation con contenido de nivel paper; Analog in time con gráfica interactiva; LST y EMIT en las tarjetas.

**Lo que resta puntos:**
1. **La portada abre en Shackleton**, pero el gancho habla de **Malapert**. Falta el momento "wow": ver el sitio real de NASA aparecer como #1.
2. **Validation parece un reporte:** tablas largas una tras otra; un juez con 5 min no llega a la sección 2.
3. **Figuras PNG de matplotlib con fondo blanco** (Fig. 4 y 7 "static") dentro de una UI oscura: rompen el diseño y no son interactivas.
4. **Method es un muro de texto**, sin diagrama del flujo.
5. **"Dónde se rompe la analogía" no tiene sección propia**; solo aparece dentro de las tarjetas.
6. **Analog in time abre en Askja**, no en Mauna Kea (la mejor región para los 6 sitios lunares).
7. **Marte se siente secundario** aunque hay 3 objetivos.
8. **No hay simulación ni ensayo de misión interactivo**: el Field kit son imágenes y videos fijos.

---

## 3. Calificación

| Criterio | Hoy | Plan base | **Plan completo (este documento)** |
|---|---|---|---|
| Validez | 9.5 | 9.8 | **9.9** |
| Relevancia | 9.0 | 9.6 | **9.8** |
| Creatividad | 8.0 | 9.4 | **9.8** |
| Impacto | 8.0 | 9.2 | **9.7** |
| Presentación | 7.8 | 9.5 | **9.8** |
| **Global** | **≈ 8.5** | **≈ 9.5** | **≈ 9.8** |

> El 9.8 es un **techo** que asume todo terminado e integrado sin errores. Una vista rota resta más de lo que suma una nueva. Con riesgo de ejecución, lo realista es 9.3–9.8.

---

## 4. La historia (lo que el juez debe entender en 60 s)

> **"Without being told, P.E.N. found the exact spot on Earth where NASA rehearsed a lunar-pole mission. Its light model matches NASA's own maps. And it tells you where, when and how to rehearse an Artemis traverse on Earth — and where Earth stops being the Moon."**

Las 7 slides, la portada de la web, el tour guiado y la página del proyecto cuentan **esta misma historia, en este mismo orden**.

---

## 5. Upgrades

Cada upgrade indica: qué es, criterio que sube, esfuerzo estimado y criterio de "terminado".

### U1 · Camino del juez y nueva portada ⭐ prioridad 1
**Criterios:** Presentación, Relevancia · **Esfuerzo:** 3–4 h

- La portada abre en **Malapert Massif ↔ Pu'u Hiwahine (Mauna Kea)**.
- Secuencia animada al cargar (con opción de saltar): globo → vuelo a Mauna Kea → marcador del sitio de NASA → tarjeta *"NASA rehearsed a lunar-pole mission here in 2012 · P.E.N. found it #1 of 10,424, blind."* → botón **"See the proof"**.
- Fila de 3 números grandes: **#1 / 10,424** · **ρ 0.92–0.99 vs NASA LOLA** · **p-valor del test nulo** (U4).
- Acceso directo a 3 casos: Luna (Malapert ↔ Mauna Kea), Marte (Jezero ↔ Chichinautzin), México (Pinacate, top 3 %).
- Sello permanente en la UI: *"Light model validated against NASA LOLA (ρ 0.92–0.99) · Blind test #1/10,424"*.

**Terminado cuando:** una persona sin contexto entiende el gancho en ≤ 10 s y llega a la prueba en ≤ 2 clics.

### U2 · Rediseño de la UI ⭐ prioridad 1
**Criterios:** Presentación, Creatividad · **Esfuerzo:** continuo (base 2 h, luego por vista)

**Principio: evolución, no reescritura.** Se conservan el globo (MapLibre), `web/DESIGN.md` y la arquitectura de `web/src/`. Se reorganiza el contenido alrededor del camino del juez.

**Nueva arquitectura de información (pestañas):**
| Pestaña | Contenido |
|---|---|
| **Home** | Portada U1 + historia en 3 pasos |
| **Explore** | Globo/mapa, ranking, tarjeta del análogo (mejorada), búsqueda inversa (U8) |
| **Proof** (antes Validation) | Las 3 pruebas (U4) con gráficas interactivas |
| **Mission** | Mission Rehearsal 3D + "Rehearse on this date" (U6, U7) |
| **When** (antes Analog in time) | Calendario y curvas, abre en Mauna Kea |
| **Limits** | Where the analogy breaks (U5) |
| **Method** | Diagrama del flujo + fórmulas (U11) |

**Lineamientos de diseño:**
- Una idea por pantalla; números grandes con unidad; detalle técnico en "Read more" colapsable.
- Títulos que **afirman el resultado** ("Distant mountains explain the gap: ρ rises from 0.55 to 0.97"), no "Results".
- Movimiento con propósito: transiciones suaves entre vistas, sombras que barren el terreno, números que cuentan hacia su valor. Respetar `prefers-reduced-motion`.
- Paleta y tipografía de `DESIGN.md`; gráficas con el mismo tema oscuro.
- Teléfono y proyector como pantallas de primera clase.
- Accesibilidad: contraste AA, navegación por teclado, textos alternativos (axe sin errores, como ya está).

**Terminado cuando:** todas las vistas usan el mismo sistema, no queda ningún PNG con fondo blanco, y el camino del juez funciona en escritorio y en el celular.

### U3 · Librerías para gráficas, 3D y contenido ⭐ prioridad 1
**Esfuerzo:** 1 h de base (instalar, tema, componente envoltorio)

| Necesidad | Librería | Por qué |
|---|---|---|
| **Gráficas interactivas** | **Apache ECharts** (`echarts`, tree-shaken) | Funciona sin framework (encaja con nuestro TS sin React), tema oscuro configurable, gran rendimiento con miles de puntos, tooltips, zoom, animaciones. Tiene todos los tipos que necesitamos: dispersión con densidad, heatmap, boxplot, barras con intervalos, radar, tornado y paralelas |
| **3D del terreno** | **three.js** | Mallas de mapas de alturas, cámaras, animación; ligero y estándar |
| **Fórmulas** | **KaTeX** | Renderiza las ecuaciones de Method (score, sombras) rápido y sin servidor |
| **Tour / scrollytelling** | **Scrollama** | Narrativa por scroll sin framework |
| **Mapa** | MapLibre GL (ya está) | Se queda |
| **Dossier descargable** | CSS de impresión (`@media print`) + "Print / Save as PDF" | Sin dependencias pesadas; el navegador genera el PDF |

**Reglas técnicas:**
- **Carga diferida por vista** (como ya se hace con el mapa): ECharts y three.js solo se cargan al abrir la vista que los usa.
- Un **componente envoltorio** `chart()` con el tema P.E.N. para que todas las gráficas se vean iguales.
- Tamaño inicial de la portada: rápido incluso en móvil (meta: contenido visible en < 2 s).
- Todas las gráficas leen de los datos exportados por `web/tools/export_data.py`; **ninguna tiene números escritos a mano**.

### U4 · Estadística avanzada: "The 3 proofs" ⭐ prioridad 2
**Criterios:** Validez (Best Use of Science) · **Esfuerzo:** 5–7 h (cálculo + vista)

Todo se calcula en Python con scripts reproducibles (`scripts/stats_*.py`), se guarda en `data/processed/stats/*.json` y se muestra con ECharts. Cada resultado se documenta en METHOD.md.

**Prueba 1 · ¿Encuentra los sitios de NASA a ciegas?**
- **Test nulo por permutación:** sortear miles de conjuntos de puntos al azar (dentro de las mismas regiones) y medir qué tan seguido quedan tan alto como los 8 análogos conocidos → **p-valor** (sobre la mediana de percentiles y sobre el rank de Pu'u Hiwahine).
- **Regiones de control:** 2–3 regiones sin interés lunar ni marciano (llanuras agrícolas, selva, etc.), corridas con el mismo pipeline. Se espera que queden abajo. *Requiere re-correr el pipeline antes de las 19:00.*
- **Curva tipo ROC / AUC:** ¿qué tan bien separa el score los análogos conocidos del resto de ventanas?
- **Visual:** la distribución nula (histograma) con la línea de nuestro resultado; el ranking de Pu'u Hiwahine por sitio lunar.

**Prueba 2 · ¿Es correcto el modelo de luz?**
- Dispersión de densidad **modelo vs LOLA** por sitio, con ρ y error medio.
- **Gráfica de Bland-Altman** (diferencia vs promedio): muestra el sesgo (−0.7 a −2.5 pp) y los límites de acuerdo.
- **Mapa de residuos** (dónde se equivoca el modelo) junto al mapa de NASA.
- Barras local vs horizontes de 150 km (la Fig. 7, pero interactiva) y el alcance de los rayos.
- Sombra permanente vs LPSR: acuerdo, precisión, recall, IoU.

**Prueba 3 · ¿Es robusto el resultado?**
- **Intervalos de confianza por bootstrap** del score (remuestreando las ventanas de referencia): "91 [89–93]".
- **Estabilidad del ranking:** probabilidad de que una ventana siga en el top-k al variar los pesos (muestreo aleatorio) → "stays #1 in X % of weightings".
- **Sensibilidad al tamaño de ventana** (3/6/12 km): correlación de Kendall τ entre rankings.
- **Gráfica tornado:** qué feature mueve más el score.
- **Descomposición del score por ventana:** la contribución de cada feature a la distancia (qué se parece y qué no), mostrada en la tarjeta.

**Terminado cuando:** cada prueba tiene una conclusión de una línea + una gráfica interactiva + "Read more" con método y números, y el p-valor está en la portada (si es significativo; si no, se reporta con honestidad).

### U5 · "Where the analogy breaks" (nueva vista) ⭐ prioridad 2
**Criterios:** Validez, Creatividad · **Esfuerzo:** 3 h

- La honestidad científica como función del producto.
- **Térmico:** Diviner (Luna: media 2 cm bajo la superficie, máximos superficiales) vs MODIS LST (Tierra) vs Mars Climate Database (Marte), en una misma escala en K, con el récord mínimo terrestre (184 K) marcado.
- **Hielo:** fracción estable a ≤ 1 m por sitio lunar.
- **Mineralogía:** EMIT por región (arcillas, carbonatos, óxidos de hierro como cota inferior, sulfatos) y el hallazgo de Atacama.
- **Lo que la Tierra nunca reproduce:** gravedad, vacío, radiación, atmósfera.
- **Matriz de fidelidad** por par de sitios: terreno ✅ · luz ✅ (en las fechas correctas) · térmico ❌ · minerales ⚠️ · gravedad ❌.

### U6 · Mission Rehearsal 3D ⭐ prioridad 2
**Criterios:** Creatividad, Relevancia, Best Mission Concept · **Esfuerzo:** 6–8 h

- Dos escenas **three.js** lado a lado (Luna/Marte | Tierra), con la cámara sincronizada.
- Malla de cada ventana de 6 km (200×200 alturas a 30 m), con exageración vertical ajustable **y siempre indicada**.
- **Sombras de nuestro propio modelo** (el algoritmo validado contra LOLA, portado a TypeScript), pintadas como textura. Así lo que se ve coincide con los números de validación.
- Sol animado (slider y "Play"); en la Tierra, solo posiciones del Sol reales para esa latitud y fecha.
- **Ruta del rover:** clic en inicio y fin; ruta de mínimo costo con la misma función que `scripts/extras/rover_twin.py` (pendiente > 20° intransitable).
- **Telemetría lado a lado:** longitud, ascenso, pendiente máx/media, % en sombra, energía solar relativa, tiempo de recorrido, temperatura de contexto (Diviner / MCD / LST).
- **Cámaras:** orbital, **astronauta a 1.7 m**, seguimiento del rover.
- **Paridad con Python obligatoria:** sombras ≥ 99 % de celdas iguales; ruta y métricas ±2 %; posición del Sol ±0.1°.
- Respaldo sin WebGL: vista 2D con la misma telemetría.

### U7 · "Rehearse this traverse on Earth, on this date" ⭐⭐ función estrella
**Criterios:** Creatividad, Relevancia, Impacto · **Esfuerzo:** 3–4 h (sobre U6)

- Une **dónde + cuándo + cómo** en un solo resultado.
- El usuario define una ruta en el sitio lunar → P.E.N. busca en el próximo año **las fechas y horas reales** en que el Sol en el análogo terrestre tiene la misma elevación (0–7°) y una dirección compatible con la de la Luna para esa ruta.
- **Rehearsal fidelity:** % de la ruta cuya condición sombra/luz coincide entre la Luna y la Tierra en esa ventana de tiempo. Métrica nueva, con fórmula simple y documentada.
- Salida accionable, por ejemplo *"Rehearse this Malapert traverse on Mauna Kea on <fecha>, <hora>–<hora> local · fidelity <X> %"* (los valores los calcula la herramienta; no se escriben a mano), con **`.ics` descargable** y entrada al dossier (U9).

### U8 · Búsqueda inversa: "¿a qué se parece este lugar?" · prioridad 3
**Criterios:** Impacto, Best Use of Data · **Esfuerzo:** 2 h

- Clic en cualquier ventana de la Tierra → ranking de los 9 objetivos (6 Luna + 3 Marte) con su score, en qué se parece y en qué no.
- Sale de los datos existentes (`windows.csv`), sin cálculo nuevo.
- Útil para cualquier equipo de campo: "tengo acceso a este sitio, ¿qué puedo ensayar aquí?".

### U9 · Dossier de misión descargable · prioridad 3
**Criterios:** Impacto, Best Mission Concept · **Esfuerzo:** 2–3 h

- Una página por par de sitios, con estilos de impresión → "Save as PDF".
- Contenido: por qué este sitio (rank y percentiles), scores con intervalo, mejores semanas y horas (U7), ruta del rover y telemetría, dónde se rompe la analogía, eventos EONET cercanos, minerales y temperatura, datos y créditos.
- Reutiliza los field briefs que ya existen en `data/processed/briefs/`.

### U10 · Tour guiado (modo historia) · prioridad 3
**Criterios:** Presentación, Best Storytelling · **Esfuerzo:** 3 h

- Recorrido de ~60 s con Scrollama: prueba ciega → luz validada → dónde se rompe → cuándo ir → ensayar la misión.
- Botón "Take the 60-second tour" en la portada.
- Sirve también para grabar los GIFs de la página del proyecto.

### U11 · Method visual · prioridad 3
**Criterios:** Presentación, Validez · **Esfuerzo:** 2 h

- **Diagrama del flujo:** DEMs (LOLA, CTX, Copernicus) → cuadrícula común de 30 m → sombras O(N) → 7 features → distancia escalada por IQR → score → validación.
- Fórmulas con KaTeX (score, sombras, rehearsal fidelity).
- Tabla de datos con nombre exacto del producto y link.
- Texto largo en "Read more".

### U12 · Marte al mismo nivel · prioridad 3
**Criterios:** Relevancia · **Esfuerzo:** 1–2 h

- Acceso directo a Jezero ↔ Sierra Chichinautzin en la portada.
- Tarjetas de Marte con Mars Climate Database, contexto de Deuteronilus (hielo enterrado) y EMIT (arcillas y carbonatos como parecido para Jezero).

### U13 · Escalabilidad y más regiones · prioridad 4
**Criterios:** Impacto · **Esfuerzo:** 1 h (declarar) / 3–4 h (más regiones)

- **Declarar la escalabilidad con números reales** del pipeline (tiempo por tile de 1°) y qué implicaría correrlo sobre toda la tierra firme.
- Opcional: más regiones (sobre todo de México) y las regiones de control de U4. **Cualquier re-corrida del pipeline: antes de las 19:00**, para que deck y página usen números finales.

### U14 · Validación del lado de la Tierra (stretch) · prioridad 5
**Criterios:** Validez · **Esfuerzo:** 3–4 h · **Riesgo:** alto

- Comparar nuestras sombras con una escena real de Landsat tomada con el Sol bajo sobre Mauna Kea (misma fecha, hora y geometría solar).
- Si coincide, el modelo queda validado en **los dos cuerpos**. Solo si alguien termina lo suyo antes.

### U15 · Página del proyecto, deck y GIFs ⭐ prioridad 1
**Criterios:** Presentación, Relevancia · **Esfuerzo:** 4–5 h (al final, con números congelados)

**Deck de 7 slides (inglés, títulos que afirman el resultado, un visual estrella por slide):**
| # | Mensaje | Visual |
|---|---|---|
| 1 | **Blind test:** P.E.N. found NASA's Mauna Kea lunar test site #1 of 10,424 | Globo → marcador del sitio de NASA; 3 números grandes; equipo y reto en pie de página |
| 2 | At the lunar south pole, **light, not just rock,** defines the mission | Sombras rasantes Luna vs Tierra |
| 3 | **How it works** in one diagram | Flujo de U11 |
| 4 | **Three proofs:** blind test (p-valor), light vs NASA (ρ 0.92–0.99), robustness | Las gráficas de U4 |
| 5 | **Where Earth stops being the Moon** | Matriz de fidelidad de U5 |
| 6 | **Rehearse this traverse on Earth, on this date** | Captura del Mission Rehearsal 3D con fecha y fidelity |
| 7 | **Impact and scale:** who uses it tomorrow, Mexico's analogs, global next step | Usuarios, México, escalabilidad, link a la app |

**Página del proyecto:**
- **Primer párrafo:** prueba ciega y ρ en negritas.
- **GIFs** (≤ 10 MB c/u): el vuelo al sitio de NASA; el barrido de sombras 3D; Rehearse on date.
- **Tabla de trazabilidad:** cada objetivo del enunciado del reto ↔ la función de P.E.N. que lo cumple.
- **NASA Data**, con nombres exactos y links: LOLA 5 m south-pole DEMs (PGDA 78), LOLA polar illumination AVGVISIB y LPSR (PGDA 69), LOLA LDEM 85°S 40 m (PDS), LRO Diviner polar resource product (PDS), MRO CTX stereo DTMs (USGS), MODIS MOD11A2 v061, EMIT L2BMIN V002, Moon/Mars Trek WMTS, GIBS, EONET, NASA POWER.
- **Space Agency Partner data:** ESA Copernicus DEM GLO-30. **Otras:** Mars Climate Database y librerías open source.
- **Use of AI:** igual al README; sin marca de NASA en contenido generado.
- **Respuestas a preguntas de juez:** por qué ventanas de 6 km, horizontes lejanos, por qué Spearman, resolución común de 30 m, cómo se eligieron los pesos (y por qué la prueba ciega lo descarta como ajuste), qué es el análogo en el tiempo frente a una calculadora solar.

### U16 · Calidad y cero errores ⭐ prioridad 1 (continuo)
**Criterios:** Presentación, Validez

- **Coherencia de números:** extender el test de Victor (que verifica README y SUBMISSION contra `data/processed/`) a los textos de la web y a los números del deck.
- **Pruebas del camino del juez** (e2e): abre la portada → muestra Malapert #1 → abre Proof → abre Mission → descarga el dossier, en Chromium, Firefox y WebKit.
- Sin errores en consola; axe sin violaciones; Lighthouse de rendimiento aceptable en móvil.
- Probar en proyector (contraste, tamaño de letra) y en el celular.
- Revisión final en ventana privada de todos los links.

---

## 6. Plan de trabajo

### 6.1 Fases
| Hora | Fase | Qué sale |
|---|---|---|
| 10:00–11:30 | **Base común** | Arquitectura de información y ajustes al sistema de diseño (U2); librerías y componente de gráficas (U3); **contratos de datos congelados**: qué exporta `export_data.py` y con qué columnas, incluidas las cuadrículas para el 3D (U6) |
| 11:30–19:00 | **Desarrollo en paralelo** | Cada upgrade en su rama; PRs chicos cada 1–2 h |
| **19:00** | **Congelar números** | Pipeline, estadísticas y regiones finales; ya no cambian. Deck y página empiezan con números finales |
| 19:00–22:30 | Integración, pulido y QA | Camino del juez, deck, página, GIFs |
| **22:30** | **Corte de código** | Solo correcciones críticas después de esta hora |
| 22:30–23:30 | Envío | Revisión en ventana privada → **Submit for Judging** antes de las 23:30 |

### 6.2 Reglas de integración (6 personas, 6 agentes)
1. **Un integrador de la web** decide el orden de los merges; todo entra por PR con 1 revisión.
2. **Una vista por persona/rama** para evitar conflictos; los archivos compartidos (`main.ts`, router, tema) se tocan solo en la base común o por el integrador.
3. **`main` siempre compila y pasa los tests.** Nada a medias en `main`; si algo no está a las 22:30, queda fuera.
4. **Ningún número escrito a mano:** todo sale de `data/processed/` vía el export.
5. **Commits:** Conventional Commits en inglés, con la identidad de cada quien, sin `Co-Authored-By` ni links de sesiones; divulgación de IA en el header de los archivos y en el PR.
6. **Sin marca de NASA** en nada generado; imágenes de IA con marca de agua (preferible: no usar imágenes de IA).

### 6.3 Si hay que recortar (en este orden se protege)
1. U1 camino del juez + U15 deck y página + U16 calidad
2. U7 Rehearse on date (sobre una versión mínima de U6)
3. U4 las 3 pruebas
4. U5 Where the analogy breaks
5. U2/U3 rediseño del resto de vistas
6. U8, U9, U10, U11, U12
7. U13, U14

---

## 7. Datos correctos de referencia (para no equivocarse)

- **Objetivos (9):** Luna: Shackleton Connecting Ridge, Nobile Rim 1, de Gerlache Rim, Malapert Massif, Haworth, Leibnitz Beta Plateau. Marte: Arcadia Planitia, Jezero, Deuteronilus Mensae.
- **Tierra:** 14 regiones, **10,424 ventanas** de 6 km a 30 m (ESA Copernicus GLO-30).
- **Prueba ciega:** Pu'u Hiwahine #1 de 10,424 para Malapert; top 0.2 % en 4 de 6 sitios lunares; top 5 % en los 6.
- **Análogos conocidos:** 8 sitios, 48 tests; mediana: percentil 84 en iluminación y 61 en terreno.
- **Luz vs NASA LOLA:** ρ 0.92–0.99 con horizontes de hasta 150 km; error medio 2.0–3.2 pp.
- **LST:** MODIS MOD11A2 2025, 10,417 de 10,424 ventanas. **EMIT:** L2BMIN V002, 9 regiones por debajo de 52° N; validado en Cuatro Ciénegas (20 de 20 ventanas con más yeso dentro de la caja Ramsar).
- **Cualquier número nuevo** (p-valores, intervalos, fidelity) se toma de su archivo en `data/processed/` el día de hoy.

---

## 8. Fuentes

- NASA Space Apps — Project Submission Guide: https://www.spaceappschallenge.org/resources/project-submission-guide/
- NASA Space Apps — Judging & Awards Guide: https://www.spaceappschallenge.org/resources/judging-awards-guide
- NASA — 2025 Global Winners: https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/
- Space Apps — 2025 Global Winners: https://www.spaceappschallenge.org/2025/awards/global-winners/
- NASA — 2024 Global Winners: https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/
- Space Apps — 2023 Global Winners: https://www.spaceappschallenge.org/blog/the-nasa-space-apps-challenge-live-global-winners-announcement
- Web pública de P.E.N.: https://plekdev.github.io/NasaSpaceApps/
- Repo: https://github.com/PlekDev/NasaSpaceApps
