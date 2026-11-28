# PaviFlex — Inspección visual de pavimentos flexibles

Aplicación Android para levantar en campo los daños de pavimentos flexibles y generar el informe
técnico, siguiendo el **Manual para la inspección visual de pavimentos flexibles** (Convenio
Interadministrativo 0587-03, Universidad Nacional de Colombia – INVIAS, octubre de 2006).

## Qué hace

- **Proyectos y sectores.** Cada proyecto agrupa sectores de vía (PR inicial y final, geometría,
  comentarios), con los datos del *Formato para la evaluación del pavimento flexible*.
- **Registro de daños con fotografía.** La foto se toma con la cámara desde la aplicación. Cada
  registro lleva tipo de daño (29 tipos del manual, con su sigla), severidad (baja, media, alta) con
  el criterio del manual a la vista, carril, abscisa, dimensiones, área de reparación y aclaraciones.
- **Sugerencia del tipo de daño, con un modelo que aprende en el teléfono.** Al tomar la foto la
  aplicación propone el tipo más parecido y dos alternativas. Cada daño que el inspector clasifica
  alimenta el motor de conocimiento, que así mejora con el trabajo. Cada sigla abre la figura del
  manual (fotografía y esquema) para confirmar. Ver *Sugerencia del tipo de daño y motor de conocimiento*.
- **Escala con la regla naranja de 1 m.** La aplicación detecta la regla naranja en la foto y
  propone sus extremos; el usuario los ajusta con una lupa y traza el largo y el ancho del daño. Las
  dimensiones se calculan con esa escala.
- **Coordenadas EPSG:9377.** La posición GNSS se transforma a MAGNA-SIRGAS / Origen-Nacional
  (Transversa de Mercator, 4° N, 73° W, k = 0,9992, FE 5 000 000, FN 2 000 000). La transformación
  está verificada contra PROJ en las pruebas.
- **Vista en planta sobre un mapa base, sin clave de API.** Para cada daño se arma el plano con
  teselas del proveedor elegido y se le agregan marcador numerado, barra de escala y norte. Sin
  conexión se dibuja un croquis con cuadrícula EPSG:9377, y el mapa se puede descargar después.
- **Análisis del capítulo 3 del manual.** Tramos de 100 m en abscisas cerradas, áreas por tipo y
  severidad, porcentajes de afectación; daños en carriles, superficiales y en bermas por separado;
  fisuras lineales con ancho de referencia de 0,6 m.
- **Informe sobre el rótulo**, en PDF (para imprimir) y en Word (editable, usando el `.docx` del
  rótulo como plantilla). Para cada sector: formato de evaluación, reporte de daños, hoja de cálculo
  por tramos, gráficas y **una ficha por fotografía de máximo media página carta** con foto, plano,
  coordenadas, descripción y severidad.
- **Exportación KML / KMZ.** Al terminar el recorrido, los daños con coordenadas se exportan como
  puntos con todos sus atributos, agrupados por sector, para Google Earth o un SIG. El KMZ incluye
  la fotografía de cada punto.
- **Respaldo.** Cada proyecto se exporta a un `.zip` (datos, fotos y mapas) y se restaura en otro
  dispositivo.

Los datos se guardan en el dispositivo y la aplicación funciona sin conexión; Internet solo se usa
para descargar el mapa base.

## Instalar en el teléfono

Cada vez que se sube un cambio, GitHub Actions compila el APK (flujo *Compilar APK de PaviFlex*).
En la pestaña **Actions** del repositorio abra la última ejecución y descargue el artefacto
`PaviFlex-apk`; contiene `app-debug.apk`. Cópielo al teléfono e instálelo (Android pedirá permitir
la instalación de aplicaciones de origen desconocido). Requiere Android 7.0 o superior.

Todas las compilaciones usan la misma firma de prueba (`android/app/paviflex-debug.keystore`), así
que una versión nueva se instala sobre la anterior y conserva los proyectos. Aun así, exporte el
respaldo `.zip` de sus proyectos antes de actualizar o desinstalar: los datos viven dentro de la
aplicación y se borran al desinstalarla.

## Mapa base

El plano de cada daño no necesita ninguna clave. En **Ajustes → Mapa base del plano** se elige el
proveedor y el zoom de la vista, y *Probar el mapa base* descarga una vista de ejemplo:

| Proveedor | Qué muestra | Detalle |
|---|---|---|
| Satélite con vías (Esri) — por defecto | Imagen satelital con vías y nombres | Según la zona: en la prueba, zoom 19 en Bogotá y 18 en Mocoa |
| Imagen satelital (Esri World Imagery) | Imagen satelital sin rótulos | Igual que el anterior |
| Callejero (OpenStreetMap) | Vías, nombres y referencias | Hasta zoom 19 |
| Topográfico (OpenTopoMap) | Curvas de nivel y relieve | Hasta zoom 17 |
| Servicio de teselas propio (XYZ) | Lo que publique el servicio | Plantilla `https://…/{z}/{x}/{y}.png` |
| Google Maps (opcional) | Híbrido, satélite o vías | Requiere clave propia de *Maps Static API* |
| Sin mapa base | Croquis con cuadrícula EPSG:9377 | No usa Internet |

Donde el proveedor no tiene imagen al nivel pedido (por ejemplo Esri a zoom 19 en Mocoa), la
aplicación usa el nivel anterior ampliado. Cada mapa lleva impresa la
atribución de su proveedor. Los servidores de OpenStreetMap y OpenTopoMap son comunitarios y están
pensados para un uso moderado: la aplicación pide una docena de teselas por daño, pero no conviene
usarlos para descargas masivas. Google no permite usar sus mapas sin clave; por eso queda como
opción y no viene activado.

Al cambiar de proveedor, los planos ya descargados se conservan; en la pantalla del informe se
pueden actualizar todos al proveedor nuevo.

## Sugerencia del tipo de daño y motor de conocimiento

Al tomar la foto, la aplicación propone el tipo más parecido y dos alternativas. Es una ayuda para
llegar más rápido a la figura correcta del manual; siempre la confirma el inspector.

### El motor de conocimiento: un modelo que se entrena en el teléfono

- **Qué es.** Cada fotografía se convierte en un vector de 512 rasgos con un modelo de visión
  preentrenado (MobileNet v1) que viene dentro de la aplicación y corre sin conexión. Cada daño que
  usted clasifica entra a una base de ejemplos (vector + sigla). Una foto nueva se clasifica por
  sus vecinos más cercanos en esa base.
- **Cómo aprende.** En el momento: al elegir el tipo de un daño, ese registro ya cuenta para la
  foto siguiente. Si corrige el tipo o repite la foto, el ejemplo se corrige; si borra el registro,
  se olvida. Borrar un sector o un proyecto completo no borra lo aprendido.
- **Cuándo opina.** Las fotos de un mismo inspector se parecen entre sí aunque el daño sea distinto
  (mismo asfalto, misma regla, misma cámara). Por eso el motor compara el parecido del mejor
  ejemplo contra el parecido típico entre daños de tipo distinto, que estima con su propia base.
  Solo pesa cuando la foto se parece claramente a algo ya visto; si no, decide la lectura por reglas.
- **Autoevaluación.** La pantalla *Motor de conocimiento* (icono de bombilla en el inicio) muestra
  cuántos ejemplos hay por tipo y, con al menos 8 registros de tipos repetidos, qué tan seguido
  habría acertado: oculta cada registro y revisa qué habría sugerido con los demás. Es la medida
  real de su confiabilidad, hecha con sus propios datos.
- **Compartir.** *Exportar* genera un archivo con lo aprendido (sin fotografías) para pasarlo a
  otro teléfono o sumar el de otro inspector; *Importar* agrega sin duplicar. Si restaura un
  respaldo de proyecto, la misma pantalla ofrece incorporar sus registros.

### La lectura por reglas (respaldo)

Mientras el motor no tiene ejemplos parecidos, la sugerencia sale de rasgos de la estructura de la
foto (trazos oscuros y su forma, celdas que encierran, manchas compactas, textura) interpretados con
las definiciones del manual: fisura aislada, red de fisuras, pérdida de capa o textura superficial.

### Familias

Una foto sola no distingue, por ejemplo, una fisura longitudinal de una transversal (depende de
hacia dónde va la vía). Por eso las tres sugerencias son de familias de aspecto distinto, y al abrir
una figura se ofrecen las demás siglas de su familia.

### Qué tan confiable es

No hay un banco de fotos reales de campo clasificadas para medirlo; lo que se midió:

| Prueba | Familia correcta primera | Entre las tres |
|---|---|---|
| 36 fotografías del manual, lectura por reglas | 7 | 12 |
| 36 fotografías del manual, comparación directa de rasgos simples | 7 | 11 |
| 36 fotografías del manual, motor de conocimiento (cada foto contra las demás) | 16 | 27 |

Las fotografías del manual son vistas oblicuas de la vía, muy distintas entre sí y con un solo
ejemplo por tipo: es un caso difícil. Con fotos cenitales sintéticas, el motor reconoce un daño
parecido a partir de un solo ejemplo. Con fotos reales de campo cabe esperar que mejore a medida
que cada tipo de daño acumule varios ejemplos; la autoevaluación dirá cuánto.

Deformaciones (ahuellamiento, hundimiento, ondulación), exudación y daños de la berma casi no se
ven en una foto cenital: el motor solo los propondrá cuando ya tenga ejemplos suyos. Todo el
catálogo sigue disponible en *Elegir tipo de daño*, con botón *Figura* en cada tipo.

El motor necesita WebAssembly, presente en cualquier Android reciente; si un teléfono no pudiera
ejecutarlo, la aplicación lo indica y sigue trabajando con la lectura por reglas.

Las figuras provienen del manual INVIAS – Universidad Nacional (2006), capítulo 1, figuras 1 a 28.
El modelo de visión es MobileNet v1 (0,50 · 224 px) de TensorFlow, con licencia Apache 2.0.

## Exportar los puntos (KML / KMZ)

En la pantalla del proyecto, **Puntos de inspección (KML / KMZ)** exporta todos los sectores; en la
pestaña *Análisis* de un sector se exporta solo ese sector.

- Un punto por daño con coordenadas, en WGS84 (equivalente a MAGNA-SIRGAS para este uso). Los
  registros sin posición no se exportan y el mensaje dice cuántos fueron.
- Atributos de cada punto: proyecto, sector, número de foto, sigla y tipo de daño, categoría,
  severidad, abscisa, carril, largo, ancho, área para el análisis, reparación, aclaraciones,
  descripción, fecha y hora, Este y Norte en EPSG:9377, latitud, longitud, precisión y altitud.
- Los atributos van como campos con tipo (se abren como tabla en QGIS o ArcGIS) y también en el
  globo de cada punto en Google Earth. El color del punto indica la severidad.
- **KMZ**: agrega la fotografía anotada de cada punto. **KML**: solo puntos y atributos, más liviano.

## Uso en campo

1. Cree el proyecto y el sector (PR inicial y final en formato `63+400`, carriles, anchos).
2. En el sector toque **Nuevo daño**. Coloque la regla naranja de 1 m junto al daño, en el plano
   del pavimento, y tome la foto lo más perpendicular posible a la superficie.
3. Elija el tipo de daño y la severidad, la abscisa y el carril.
4. Toque **Medir con la regla**: verifique los extremos de la regla y trace largo y ancho.
5. La posición se captura sola al crear el registro (se puede repetir).
6. En el proyecto, **Generar informe** → PDF o Word.

La escala de la regla vale para el plano del pavimento y cerca de la regla. En fotos oblicuas o
con el daño lejos de la regla el error crece; para daños grandes (decenas de metros) conviene
escribir las dimensiones medidas con cinta u odómetro. La precisión de las coordenadas es la del
receptor del teléfono (típicamente 3 a 10 m a cielo abierto), y se reporta en cada ficha.

## Desarrollo

Requiere Node 22. La aplicación es React + TypeScript (Vite) empaquetada con Capacitor.

```bash
cd paviflex
npm install
npm run dev          # navegador, http://localhost:5173
npm test             # pruebas unitarias (EPSG:9377, análisis por tramos, detección de la regla)
npm run build && npx vite preview --port 4173 &
node e2e/flujo.mjs   # prueba de extremo a extremo; deja capturas e informes en e2e/salida
```

Para compilar el APK en un equipo con Android SDK y JDK 21:

```bash
npm run android:apk  # paviflex/android/app/build/outputs/apk/debug/app-debug.apk
```

### Estructura

| Carpeta | Contenido |
|---|---|
| `src/domain` | Catálogo de daños del manual, EPSG:9377, análisis por tramos, escala con la regla, sugerencia de tipo y motor de conocimiento |
| `src/data` | Almacenamiento local (IndexedDB) y respaldo `.zip` |
| `src/services` | Cámara, GPS y archivos (Capacitor), mapas, fotografía anotada, modelo de visión |
| `public/modelo` | Modelo de visión MobileNet (TensorFlow.js) que se empaqueta en la aplicación |
| `src/report` | Modelo del informe, gráficas, PDF (pdfmake), Word (plantilla del rótulo) y KML/KMZ |
| `src/ui` | Pantallas |
| `src/assets` | Rótulo (`rotulo.docx` y su fondo) y figuras del manual (`manual/`) |
| `android` | Proyecto Android generado por Capacitor |
