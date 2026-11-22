/**
 * Servicios del dispositivo: cámara, GPS y archivos. En Android usan los complementos
 * nativos de Capacitor; en el navegador (desarrollo y pruebas) usan las API web equivalentes.
 */
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { PosGps } from '../domain/types';

export const esNativo = Capacitor.isNativePlatform();

// ───────────── Cámara ─────────────

function elegirArchivo(capturar: boolean): Promise<Blob | null> {
  return new Promise((ok) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (capturar) inp.setAttribute('capture', 'environment');
    inp.style.display = 'none';
    inp.dataset.testid = capturar ? 'entrada-camara' : 'entrada-galeria';
    document.body.appendChild(inp);
    let resuelto = false;
    const fin = (b: Blob | null) => {
      if (resuelto) return;
      resuelto = true;
      inp.remove();
      ok(b);
    };
    inp.addEventListener('change', () => fin(inp.files?.[0] ?? null));
    inp.addEventListener('cancel', () => fin(null));
    inp.click();
  });
}

/** Abre la cámara del dispositivo y devuelve la fotografía tomada (null si se cancela). */
export async function tomarFoto(): Promise<Blob | null> {
  if (!esNativo) return elegirArchivo(true);
  try {
    const r = await Camera.takePhoto({
      quality: 92,
      targetWidth: 2400,
      targetHeight: 2400,
      correctOrientation: true,
      saveToGallery: false,
      editable: 'no',
    });
    const ruta = r.webPath ?? (r.uri ? Capacitor.convertFileSrc(r.uri) : null);
    if (!ruta) return null;
    return await (await fetch(ruta)).blob();
  } catch (e) {
    if (esCancelacion(e)) return null;
    throw e;
  }
}

/** Selecciona una fotografía existente de la galería. */
export async function elegirDeGaleria(): Promise<Blob | null> {
  if (!esNativo) return elegirArchivo(false);
  try {
    const r = await Camera.chooseFromGallery({ allowMultipleSelection: false, quality: 92, editable: 'no' });
    const m = r.results[0];
    const ruta = m?.webPath ?? (m?.uri ? Capacitor.convertFileSrc(m.uri) : null);
    if (!ruta) return null;
    return await (await fetch(ruta)).blob();
  } catch (e) {
    if (esCancelacion(e)) return null;
    throw e;
  }
}

function esCancelacion(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase();
  return m.includes('cancel') || m.includes('no image') || m.includes('no media');
}

// ───────────── GPS ─────────────

export interface OpcionesGps {
  /** Tiempo máximo de espera, ms */
  maximo?: number;
  /** Precisión (m) a partir de la cual se acepta la lectura sin seguir esperando */
  objetivo?: number;
  alProgreso?: (p: PosGps) => void;
}

/**
 * Lee la posición observando el GPS durante unos segundos y se queda con la lectura de mejor
 * precisión: la primera lectura de un receptor suele ser la peor.
 */
export async function obtenerPosicion(op: OpcionesGps = {}): Promise<PosGps> {
  const maximo = op.maximo ?? 15000;
  const objetivo = op.objetivo ?? 5;
  if (esNativo) {
    let permiso = await Geolocation.checkPermissions();
    if (permiso.location !== 'granted') permiso = await Geolocation.requestPermissions({ permissions: ['location'] });
    if (permiso.location !== 'granted') throw new Error('Permiso de ubicación denegado. Actívelo en los ajustes de la aplicación.');
  }
  return new Promise<PosGps>((ok, err) => {
    let mejor: PosGps | null = null;
    let idWatch: string | null = null;
    let terminado = false;
    let ultimoError: unknown = null;
    const terminar = () => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      if (idWatch != null) void Geolocation.clearWatch({ id: idWatch }).catch(() => undefined);
      if (mejor) ok(mejor);
      else err(new Error(mensajeGps(ultimoError)));
    };
    const reloj = setTimeout(terminar, maximo);
    Geolocation.watchPosition({ enableHighAccuracy: true, timeout: maximo, maximumAge: 0 }, (pos, e) => {
      if (terminado) return;
      if (e || !pos) {
        ultimoError = e;
        return;
      }
      const p: PosGps = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        precision: pos.coords.accuracy ?? null,
        altitud: pos.coords.altitude ?? null,
        ts: new Date(pos.timestamp || Date.now()).toISOString(),
      };
      if (!mejor || (p.precision ?? 1e9) <= (mejor.precision ?? 1e9)) {
        mejor = p;
        op.alProgreso?.(p);
      }
      if ((p.precision ?? 1e9) <= objetivo) terminar();
    })
      .then((id) => {
        idWatch = id;
        if (terminado) void Geolocation.clearWatch({ id }).catch(() => undefined);
      })
      .catch((e) => {
        ultimoError = e;
        terminar();
      });
  });
}

function mensajeGps(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  if (/denied|permission/i.test(m)) return 'Permiso de ubicación denegado.';
  if (/disabled|unavailable/i.test(m)) return 'La ubicación del dispositivo está desactivada.';
  return 'No se obtuvo señal GPS. Verifique que la ubicación esté activa y que haya cielo despejado.';
}

// ───────────── Archivos ─────────────

async function trozoABase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  const paso = 0x8000;
  for (let i = 0; i < buf.length; i += paso) bin += String.fromCharCode.apply(null, buf.subarray(i, i + paso) as unknown as number[]);
  return btoa(bin);
}

async function escribirNativo(ruta: string, directorio: Directory, blob: Blob): Promise<string> {
  // Se escribe por trozos (múltiplos de 3 bytes) para no pasar cadenas enormes por el puente nativo.
  const TROZO = 3 * 256 * 1024;
  const primero = await trozoABase64(blob.slice(0, TROZO));
  const r = await Filesystem.writeFile({ path: ruta, directory: directorio, data: primero, recursive: true });
  for (let pos = TROZO; pos < blob.size; pos += TROZO) {
    await Filesystem.appendFile({ path: ruta, directory: directorio, data: await trozoABase64(blob.slice(pos, pos + TROZO)) });
  }
  return r.uri;
}

export interface ResultadoGuardado {
  /** Texto para informar al usuario dónde quedó el archivo */
  mensaje: string;
}

/**
 * Entrega un archivo generado al usuario. En Android lo guarda en Documentos/PaviFlex (si el
 * sistema lo permite) y abre el diálogo Compartir para imprimirlo, abrirlo o enviarlo.
 * En el navegador lo descarga.
 */
export async function entregarArchivo(blob: Blob, nombre: string, titulo: string): Promise<ResultadoGuardado> {
  if (!esNativo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { mensaje: `Archivo descargado: ${nombre}` };
  }
  let mensaje = '';
  try {
    await escribirNativo(`PaviFlex/${nombre}`, Directory.Documents, blob);
    mensaje = `Guardado en Documentos/PaviFlex/${nombre}`;
  } catch {
    // Algunas versiones de Android restringen la carpeta Documentos; el archivo se comparte desde la caché.
  }
  const uri = await escribirNativo(`informes/${nombre}`, Directory.Cache, blob);
  try {
    await Share.share({ title: titulo, dialogTitle: titulo, files: [uri] });
  } catch (e) {
    if (!/cancel/i.test(String((e as { message?: string })?.message ?? e))) {
      if (!mensaje) throw e;
    }
  }
  return { mensaje: mensaje || `Archivo generado: ${nombre}` };
}
