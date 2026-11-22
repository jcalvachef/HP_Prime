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
- **Escala con la regla naranja de 1 m.** La aplicación detecta la regla naranja en la foto y
  propone sus extremos; el usuario los ajusta con una lupa y traza el largo y el ancho del daño. Las
  dimensiones se calculan con esa escala.
- **Coordenadas EPSG:9377.** La posición GNSS se transforma a MAGNA-SIRGAS / Origen-Nacional
  (Transversa de Mercator, 4° N, 73° W, k = 0,9992, FE 5 000 000, FN 2 000 000). La transformación
  está verificada contra PROJ en las pruebas.
- **Vista en planta con fondo Google Maps.** Para cada daño se descarga el mapa (Maps Static API) y
  se le agregan marcador numerado, barra de escala y norte. Sin conexión o sin clave se dibuja un
  croquis con cuadrícula EPSG:9377, y el fondo se puede descargar después.
- **Análisis del capítulo 3 del manual.** Tramos de 100 m en abscisas cerradas, áreas por tipo y
  severidad, porcentajes de afectación; daños en carriles, superficiales y en bermas por separado;
  fisuras lineales con ancho de referencia de 0,6 m.
- **Informe sobre el rótulo**, en PDF (para imprimir) y en Word (editable, usando el `.docx` del
  rótulo como plantilla). Para cada sector: formato de evaluación, reporte de daños, hoja de cálculo
  por tramos, gráficas y **una ficha por fotografía de máximo media página carta** con foto, plano,
  coordenadas, descripción y severidad.
- **Respaldo.** Cada proyecto se exporta a un `.zip` (datos, fotos y mapas) y se restaura en otro
  dispositivo.

Los datos se guardan en el dispositivo y la aplicación funciona sin conexión; Internet solo se usa
para descargar el fondo de Google Maps.

## Instalar en el teléfono

Cada vez que se sube un cambio, GitHub Actions compila el APK (flujo *Compilar APK de PaviFlex*).
En la pestaña **Actions** del repositorio abra la última ejecución y descargue el artefacto
`PaviFlex-apk`; contiene `app-debug.apk`. Cópielo al teléfono e instálelo (Android pedirá permitir
la instalación de aplicaciones de origen desconocido). Requiere Android 7.0 o superior.

## Clave de Google Maps

El fondo Google Maps necesita una clave propia:

1. En [Google Cloud Console](https://console.cloud.google.com/) cree un proyecto, active la
   facturación y habilite **Maps Static API**.
2. Cree una clave de API (se recomienda restringirla a *Maps Static API*).
3. En la aplicación: **Ajustes → Google Maps → Clave de API**, y use *Probar la clave*.

La clave queda guardada solo en el dispositivo. Cada daño consume una solicitud de mapa, y el plano
general de cada sector una más por informe.

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
| `src/domain` | Catálogo de daños del manual, EPSG:9377, análisis por tramos, escala con la regla |
| `src/data` | Almacenamiento local (IndexedDB) y respaldo `.zip` |
| `src/services` | Cámara, GPS y archivos (Capacitor), mapas, fotografía anotada |
| `src/report` | Modelo del informe, gráficas, PDF (pdfmake) y Word (plantilla del rótulo) |
| `src/ui` | Pantallas |
| `src/assets` | Rótulo: `rotulo.docx` y su imagen de fondo |
| `android` | Proyecto Android generado por Capacitor |
