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
- **Sugerencia del tipo de daño y figuras del manual.** Al tomar la foto la aplicación propone el
  tipo más parecido y dos alternativas. Cada sigla abre la figura del manual (fotografía y esquema)
  con la definición y las severidades, y desde ahí se elige. Ver *Sugerencia del tipo de daño*.
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

## Sugerencia del tipo de daño

La sugerencia es una ayuda para llegar más rápido a la figura correcta del manual; no es un
diagnóstico y siempre la confirma el inspector.

- **Cómo lee la foto.** Extrae rasgos de la estructura del pavimento (trazos oscuros y su forma,
  celdas que encierran, manchas oscuras compactas, textura) y los interpreta con reglas tomadas de
  las definiciones del manual: fisura aislada, red de fisuras, pérdida de capa o textura superficial.
- **Familias.** Una foto sola no distingue, por ejemplo, una fisura longitudinal de una transversal
  (depende de hacia dónde va la vía). Por eso las tres sugerencias son de familias de aspecto
  distinto, y al abrir una figura se ofrecen las demás siglas de su familia.
- **Aprende del inspector.** Cada daño ya clasificado sirve de ejemplo para los siguientes: una
  foto parecida a una que usted ya clasificó se propone con esa sigla. Los ejemplos viajan en el
  respaldo `.zip`.
- **Qué tan confiable es.** No hay un banco de fotos reales clasificadas para medirlo. En fotos
  cenitales sintéticas de prueba acierta. En las 36 fotografías del propio manual, que son vistas
  oblicuas de la vía, la familia correcta fue la primera sugerencia en 7 y estuvo entre las tres en
  12. Comparar directamente contra las fotos del manual dio un resultado igual de pobre (11 de 36),
  por eso no se usa. Hay que esperar aciertos modestos al comienzo y mejores a medida que acumule
  registros propios.
- **Lo que una foto no muestra.** Deformaciones (ahuellamiento, hundimiento, ondulación), parches,
  exudación y daños de la berma casi no dejan huella en una foto cenital; rara vez saldrán como
  primera sugerencia. Todo el catálogo sigue disponible en *Elegir tipo de daño*, con botón
  *Figura* en cada tipo.

Las figuras provienen del manual INVIAS – Universidad Nacional (2006), capítulo 1, figuras 1 a 28.

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
| `src/domain` | Catálogo de daños del manual, EPSG:9377, análisis por tramos, escala con la regla, sugerencia de tipo |
| `src/data` | Almacenamiento local (IndexedDB) y respaldo `.zip` |
| `src/services` | Cámara, GPS y archivos (Capacitor), mapas, fotografía anotada |
| `src/report` | Modelo del informe, gráficas, PDF (pdfmake), Word (plantilla del rótulo) y KML/KMZ |
| `src/ui` | Pantallas |
| `src/assets` | Rótulo (`rotulo.docx` y su fondo) y figuras del manual (`manual/`) |
| `android` | Proyecto Android generado por Capacitor |
