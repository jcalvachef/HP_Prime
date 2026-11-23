/**
 * Prueba de extremo a extremo en Chromium con vista de teléfono:
 * proyecto → sector → daños con foto (regla naranja sintética), GPS simulado y teselas simuladas →
 * análisis → informe PDF y Word. Uso: node e2e/flujo.mjs [carpeta-salida]
 */
import { createRequire } from 'node:module';
// Playwright se resuelve como módulo CommonJS (instalación global o local)
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SALIDA = process.argv[2] ?? 'e2e/salida';
mkdirSync(SALIDA, { recursive: true });

// Con MAPAS_REALES=1 no se simulan las teselas: se descargan del proveedor (requiere Internet)
const REAL = process.env.MAPAS_REALES === '1';
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const navegador = await chromium.launch(REAL && proxy ? { proxy } : {});
const ctx = await navegador.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  locale: 'es-CO',
  timezoneId: 'America/Bogota',
  permissions: ['geolocation'],
  geolocation: { latitude: 1.1492, longitude: -76.6464, accuracy: 4 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
// Las teselas respondidas con 404 a propósito generan un aviso del navegador que no es un error de la app
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) errores.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());

// Imágenes sintéticas generadas en el navegador
await page.goto(BASE);
async function lienzoABytes(fn, w, h, tipo = 'image/jpeg') {
  const b64 = await page.evaluate(
    ([src, w, h, tipo]) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      new Function('ctx', 'w', 'h', src)(ctx, w, h);
      return c.toDataURL(tipo, 0.9).split(',')[1];
    },
    [fn, w, h, tipo],
  );
  return Buffer.from(b64, 'base64');
}
const DIBUJO_FOTO = (semilla, tipo) => `
  let s = ${semilla};
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = '#5b5d60'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26000; i++) { const g = 60 + rnd() * 70; ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + (g + 3) + ')'; ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3); }
  ctx.strokeStyle = '#17181a'; ctx.lineCap = 'round';
  if ('${tipo}' === 'pc') {
    for (let i = 0; i < 70; i++) { ctx.lineWidth = 2 + rnd() * 5; ctx.beginPath(); let x = 350 + rnd() * 900, y = 180 + rnd() * 520; ctx.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 220; y += (rnd() - 0.5) * 220; ctx.lineTo(Math.max(330, Math.min(1270, x)), Math.max(160, Math.min(720, y))); } ctx.stroke(); }
  } else if ('${tipo}' === 'fl') {
    ctx.lineWidth = 7; ctx.beginPath(); let y = 430; ctx.moveTo(150, y); for (let x = 150; x <= 1450; x += 60) { y += (rnd() - 0.5) * 40; ctx.lineTo(x, y); } ctx.stroke();
  } else {
    ctx.fillStyle = '#2a2623'; ctx.beginPath(); ctx.ellipse(800, 450, 330, 210, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#6b5a45'; for (let i = 0; i < 900; i++) ctx.fillRect(560 + rnd() * 480, 310 + rnd() * 280, 6, 6);
  }
  // Demarcación amarilla (distractor) y regla naranja de 1 m = 800 px con graduaciones
  ctx.fillStyle = '#e8c93a'; ctx.fillRect(0, 60, w, 26);
  ctx.save(); ctx.translate(400, 1040); ctx.rotate(-0.06);
  ctx.fillStyle = '#ff6a13'; ctx.fillRect(0, -17, 800, 34);
  ctx.fillStyle = '#111'; for (let i = 1; i < 10; i++) ctx.fillRect(i * 80 - 1.5, -17, 3, 34);
  ctx.restore();
`;
const fotos = {
  pc: await lienzoABytes(DIBUJO_FOTO(11, 'pc'), 1600, 1200),
  fl: await lienzoABytes(DIBUJO_FOTO(23, 'fl'), 1600, 1200),
  bch: await lienzoABytes(DIBUJO_FOTO(37, 'bch'), 1600, 1200),
};
for (const [k, v] of Object.entries(fotos)) writeFileSync(join(SALIDA, `foto-${k}.jpg`), v);
// Teselas de prueba: tablero con la clave z/x/y de cada una, para comprobar que el mosaico calza.
// Algunas se responden como inexistentes (404) y otras como "sin datos" (gris uniforme), para
// ejercitar el respaldo con la tesela del nivel anterior.
const pintor = await ctx.newPage();
await pintor.goto(BASE);
const tesela = async (z, x, y, sinDatos) => {
  const b64 = await pintor.evaluate(([z, x, y, sinDatos]) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    if (sinDatos) { g.fillStyle = '#cccccc'; g.fillRect(0, 0, 256, 256); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; }
    g.fillStyle = (x + y) % 2 ? '#4f6f45' : '#5d7f52'; g.fillRect(0, 0, 256, 256);
    let s = x * 7919 + y * 104729 + z; const rnd = () => (s = (s * 16807 + 11) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(' + (30 + rnd() * 60) + ',' + (70 + rnd() * 80) + ',' + (30 + rnd() * 50) + ',0.6)'; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 6 + rnd() * 22, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
    g.fillStyle = '#fff'; g.font = '600 20px sans-serif'; g.fillText(z + '/' + x + '/' + y, 12, 30);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, [z, x, y, sinDatos]);
  return Buffer.from(b64, 'base64');
};
const capaVias = Buffer.from(await pintor.evaluate(() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.strokeStyle = '#ffd24a'; g.lineWidth = 9; g.beginPath(); g.moveTo(0, 200); g.lineTo(256, 60); g.stroke();
  return c.toDataURL('image/png').split(',')[1];
}), 'base64');
let peticionesMapa = 0, respaldos = 0, superpuestas = 0;
if (!REAL) await ctx.route('https://server.arcgisonline.com/**', async (ruta) => {
  peticionesMapa++;
  // Demora como la de una red de campo: el mapa termina de llegar cuando el usuario ya pasó a medir
  await new Promise((ok) => setTimeout(ok, 150));
  const ruta_ = new URL(ruta.request().url()).pathname;
  const m = /\/tile\/(\d+)\/(\d+)\/(\d+)$/.exec(ruta_);
  if (!m) return ruta.fulfill({ status: 400, body: 'mal' });
  const [z, y, x] = m.slice(1).map(Number);
  const cors = { 'access-control-allow-origin': '*' };
  // Capa superpuesta de vías: PNG transparente con una vía diagonal
  if (ruta_.includes('World_Transportation')) { superpuestas++; return ruta.fulfill({ status: 200, contentType: 'image/png', body: capaVias, headers: cors }); }
  if (z >= 19 && (x + y) % 7 === 0) { respaldos++; return ruta.fulfill({ status: 404, body: 'Tile not found', headers: cors }); }
  if (z >= 19 && (x + y) % 7 === 3) { respaldos++; return ruta.fulfill({ status: 200, contentType: 'image/jpeg', body: await tesela(z, x, y, true), headers: cors }); }
  return ruta.fulfill({ status: 200, contentType: 'image/jpeg', body: await tesela(z, x, y, false), headers: cors });
});
// Ningún otro proveedor debe consultarse durante la prueba
const otrosHosts = [];
let teselasOsm = 0;
if (!REAL) await ctx.route('https://tile.openstreetmap.org/**', async (ruta) => {
  teselasOsm++;
  const [z, x, y] = new URL(ruta.request().url()).pathname.replace('.png', '').split('/').slice(1).map(Number);
  return ruta.fulfill({ status: 200, contentType: 'image/jpeg', body: await tesela(z, x, y, false), headers: { 'access-control-allow-origin': '*' } });
});
for (const h of ['https://maps.googleapis.com/**', 'https://tile.opentopomap.org/**', 'https://basemaps.cartocdn.com/**'])
  if (!REAL) await ctx.route(h, (ruta) => { otrosHosts.push(ruta.request().url()); return ruta.abort(); });

const captura = (nombre) => page.screenshot({ path: join(SALIDA, nombre + '.png') });
const llenar = (id, v) => page.getByTestId(id).fill(v);

// ── Ajustes: mapa base sin clave ──
await page.getByLabel('Ajustes').click();
const proveedor = page.getByTestId('a-proveedor');
if ((await proveedor.inputValue()) !== 'esri-hibrido') throw new Error('El proveedor por defecto debe ser el satélite con vías, sin clave');
// Google queda como opción, pero exige clave; un servicio propio exige una plantilla válida
await proveedor.selectOption('google');
await page.getByText('Google Maps requiere una clave de API').waitFor();
await proveedor.selectOption('xyz');
await llenar('a-plantilla', 'https://mapas.ejemplo.co/{z}/{x}.png');
await page.getByText('A la plantilla le falta {y}').waitFor();
await proveedor.selectOption('esri-hibrido');
await page.getByTestId('probar-mapa').click();
await page.getByText('Mapa base descargado correctamente').waitFor({ timeout: REAL ? 120000 : 30000 });
await page.getByTestId('prueba-mapa').scrollIntoViewIfNeeded();
await captura('00-ajustes-mapa');
await page.getByLabel('Volver').click();

// ── Proyecto ──
await captura('01-inicio');
await page.getByTestId('nuevo-proyecto').click();
await llenar('p-nombre', 'Inspección visual vía Mocoa – San Francisco');
await llenar('p-entidad', 'Instituto Nacional de Vías – Territorial Putumayo');
await llenar('p-contrato', '1234 de 2026');
await llenar('p-territorial', 'Putumayo');
await llenar('p-via', 'Mocoa – San Francisco');
await llenar('p-codigo', '1003');
await llenar('p-loc', 'Mocoa, Putumayo');
await llenar('p-levanto', 'Ing. Jhimmy Calvache');
await page.getByTestId('guardar').click();
await page.getByTestId('nuevo-sector').waitFor();

// ── Sector ──
await page.getByTestId('nuevo-sector').click();
await llenar('s-nombre', 'Sector 1 – El Pepino');
await llenar('s-pri', '63+350');
await llenar('s-prf', '63+820');
await llenar('s-ancho', '3,5');
await llenar('s-berma', '1');
await llenar('s-coment', 'Se observan problemas de drenaje superficial y desgaste generalizado de severidad baja. Se recomienda mantenimiento de cunetas.');
await captura('02-sector-editar');
await page.getByTestId('guardar').click();
await page.getByTestId('nuevo-dano').waitFor();

// ── Daños ──
const danos = [
  { foto: 'pc', tipo: 'PC', sev: 'M', abscisa: '63+372', carril: 'D', medir: true, aclar: 'Con ahuellamiento leve en la huella externa; se recomienda parcheo.', lat: 1.14920, lon: -76.64640 },
  { foto: 'fl', tipo: 'FL', sev: 'A', abscisa: '63+415', carril: 'I', medir: 'largo', aclar: 'Posee afloramiento de finos.', lat: 1.14945, lon: -76.64600 },
  { foto: 'bch', tipo: 'BCH', sev: 'A', abscisa: '63+470', carril: 'D', medir: true, aclar: '', lat: 1.14968, lon: -76.64562 },
  { foto: 'pc', tipo: 'PC', sev: 'B', abscisa: '63+560', carril: 'C', largo: '12', ancho: '3,5', aclar: '', lat: 1.15010, lon: -76.64492 },
  { foto: 'pc', tipo: 'DSU', sev: 'B', abscisa: '63+600', carril: 'C', largo: '100', ancho: '7', aclar: 'Desgaste generalizado.', lat: 1.15030, lon: -76.64460 },
  { foto: 'bch', tipo: 'PCH', sev: 'M', abscisa: '63+655', carril: 'I', largo: '7', ancho: '1,5', aclar: 'Parche con deficiencias en los bordes.', lat: 1.15055, lon: -76.64418 },
  { foto: 'fl', tipo: 'FBD', sev: 'M', abscisa: '63+700', carril: 'D', largo: '8', aclar: '', lat: 1.15078, lon: -76.64380 },
  { foto: 'pc', tipo: 'PC', sev: 'M', abscisa: '63+720', carril: 'D', largo: '4', ancho: '0,9', berma: true, aclar: 'Daño localizado en la berma derecha.', lat: 1.15088, lon: -76.64364 },
  { foto: 'fl', tipo: 'CVB', sev: 'A', abscisa: '63+760', carril: 'I', largo: '3,5', ancho: '0,1', aclar: 'Se observa hundimiento en la banca.', lat: 1.15108, lon: -76.64331 },
  { foto: 'pc', tipo: 'CD', sev: null, abscisa: '63+790', carril: 'C', largo: '30', ancho: '7', aclar: '', lat: 1.15123, lon: -76.64306 },
];
let n = 0;
for (const d of danos) {
  n++;
  await ctx.setGeolocation({ latitude: d.lat, longitude: d.lon, accuracy: 3 + (n % 3) });
  await page.getByTestId('nuevo-dano').click();
  await page.getByTestId('tomar-foto').waitFor();
  const [selector] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('tomar-foto').click()]);
  await selector.setFiles({ name: `foto${n}.jpg`, mimeType: 'image/jpeg', buffer: fotos[d.foto] });
  await page.getByTestId('foto').waitFor();
  await page.getByTestId('elegir-tipo').click();
  if (n === 1) await captura('03-selector-tipo');
  await page.getByTestId(`tipo-${d.tipo}`).click();
  if (d.sev) await page.getByTestId(`sev-${d.sev}`).click();
  if (d.berma) await page.getByText('El daño está en la berma').click();
  await llenar('d-abscisa', d.abscisa);
  await page.getByTestId(`carril-${d.carril}`).click();

  if (d.medir) {
    await page.getByTestId('medir').click();
    const esc = page.getByTestId('escenario');
    await esc.waitFor();
    // La regla debe detectarse sola al abrir
    await page.getByTestId('lectura').getByText(/Regla \d+ px/).waitFor({ timeout: 8000 });
    // La foto de 1600×1200 se ajusta al escenario; se convierte de píxeles de imagen a pantalla
    const aPantalla = async (x, y) => {
      const caja = await esc.boundingBox();
      const k = Math.min(caja.width / 1600, caja.height / 1200);
      return [caja.x + (caja.width - 1600 * k) / 2 + x * k, caja.y + (caja.height - 1200 * k) / 2 + y * k];
    };
    const toque = async (x, y) => { await page.mouse.move(...(await aPantalla(x, y))); await page.mouse.down(); await page.mouse.up(); };
    await page.getByTestId('modo-largo').click();
    if (d.medir === 'largo') { await toque(150, 430); await toque(800, 440); await toque(1450, 425); }
    else { await toque(360, 450); await toque(1260, 450); await page.getByTestId('modo-ancho').click(); await toque(800, 180); await toque(800, 720); }
    if (n === 1) {
      // Arrastre de un punto con la lupa visible
      await page.mouse.move(...(await aPantalla(800, 720))); await page.mouse.down(); await page.mouse.move(...(await aPantalla(830, 690)), { steps: 4 });
      await captura('05-medir-lupa');
      await page.mouse.move(...(await aPantalla(800, 720))); await page.mouse.up();
      await captura('06-medir');
    }
    d.lectura = await page.getByTestId('lectura').innerText();
    await page.getByTestId('aplicar').click();
    await page.getByTestId('foto').waitFor();
  } else {
    await llenar('d-largo', d.largo);
    if (d.ancho) await llenar('d-ancho', d.ancho);
  }
  if (d.aclar) await llenar('d-aclar', d.aclar);
  await page.getByTestId('coords').waitFor({ timeout: 20000 });
  await page.getByTestId('plano').waitFor();
  await page.getByText('Actualizar mapa base').waitFor({ timeout: REAL ? 40000 : 15000 }).catch(async (e) => {
    // Diagnóstico: qué dice la pantalla cuando el mapa no llega
    console.log('avisos en pantalla:', await page.locator('.aviso').allInnerTexts());
    await captura('error-mapa');
    throw e;
  });
  if (n === 1) {
    await page.waitForTimeout(400);
    await captura('04-dano-arriba');
    await page.screenshot({ path: join(SALIDA, '07-dano-completo.png'), fullPage: false });
    d.largoMedido = await page.getByTestId('d-largo').inputValue();
    d.anchoMedido = await page.getByTestId('d-ancho').inputValue();
    d.coords = await page.getByTestId('coords').innerText();
    await page.getByTestId('plano').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await captura('08-dano-coordenadas');
  }
  if (n === 2) d.largoMedido = await page.getByTestId('d-largo').inputValue();
  await page.getByTestId('listo').click();
  await page.getByTestId('nuevo-dano').waitFor();
}
await page.waitForTimeout(300);
await captura('09-sector-lista');
await page.getByTestId('tab-resumen').click();
await page.waitForTimeout(500);
await captura('10-sector-analisis');
await page.screenshot({ path: join(SALIDA, '11-sector-analisis-completo.png'), fullPage: true });

// ── Informe ──
await page.getByLabel('Volver').click();
await page.getByTestId('ir-informe').click();
await captura('12-informe');
for (const fmt of ['pdf', 'docx']) {
  const [descarga] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.getByTestId(`generar-${fmt}`).click(),
  ]);
  await descarga.saveAs(join(SALIDA, `informe.${fmt}`));
  await page.getByTestId('resultado').waitFor();
}
await captura('13-informe-generado');

if (!REAL) {
// ── Cambio de proveedor: los planos ya descargados se pueden actualizar al nuevo ──
await page.getByLabel('Volver').click();
await page.getByLabel('Volver').click();
await page.getByLabel('Ajustes').click();
await page.getByTestId('a-proveedor').selectOption('osm');
await page.getByLabel('Volver').click();
await page.getByText('Inspección visual vía Mocoa – San Francisco').first().click();
await page.getByTestId('ir-informe').click();
await page.getByText('10 planos se descargaron con otro mapa base').waitFor();
await captura('14-informe-otro-proveedor');
await page.getByTestId('mapas-actualizar').click();
await page.getByText('10 mapas descargados').waitFor({ timeout: 60000 });
await page.getByTestId('mapas-actualizar').waitFor({ state: 'detached' });
if (teselasOsm < 60) throw new Error('No se pidieron las teselas de OpenStreetMap esperadas: ' + teselasOsm);
}

writeFileSync(
  join(SALIDA, 'resultado.json'),
  JSON.stringify({ errores, peticionesMapa, respaldos, otrosHosts, danos: danos.map(({ tipo, lectura, largoMedido, anchoMedido, coords }) => ({ tipo, lectura, largoMedido, anchoMedido, coords })) }, null, 1),
);
console.log('errores:', errores.length ? errores : 'ninguno');
console.log('teselas pedidas:', peticionesMapa, '· con respaldo:', respaldos, '· de la capa de vías:', superpuestas, '· de OpenStreetMap:', teselasOsm, '· otros proveedores consultados:', otrosHosts.length);
console.log(JSON.stringify(danos[0], null, 1));
console.log('largo FL medido:', danos[1].largoMedido);
await navegador.close();
process.exit(errores.length || otrosHosts.length ? 1 : 0);
