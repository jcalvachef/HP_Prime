/**
 * Tareas en segundo plano de un registro de daño: captura de la posición y descarga del mapa base.
 * Viven fuera de las pantallas: si el usuario pasa a medir o vuelve al listado mientras terminan,
 * el resultado igual se guarda en el registro (con cambios parciales) y la pantalla que esté
 * abierta lo recibe.
 */
import { useSyncExternalStore } from 'react';
import { eliminarBlob, guardarBlob, leerAjustes, modificarDano, nuevoId, obtenerDano } from '../data/db';
import { fmtFijo } from '../domain/formato';
import { descargarMapa, impedimentoMapa } from './mapa';
import { obtenerPosicion } from './plataforma';

export interface EstadoTareas {
  gps: { fase: 'reposo' | 'buscando' | 'error'; msg?: string };
  mapa: { fase: 'reposo' | 'descargando' | 'error'; msg?: string };
}

const REPOSO: EstadoTareas = { gps: { fase: 'reposo' }, mapa: { fase: 'reposo' } };
const estados = new Map<string, EstadoTareas>();
const oyentes = new Set<() => void>();

function poner(id: string, parcial: Partial<EstadoTareas>) {
  estados.set(id, { ...(estados.get(id) ?? REPOSO), ...parcial });
  oyentes.forEach((f) => f());
}
function suscribir(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  return () => {
    oyentes.delete(alCambiar);
  };
}
const mensaje = (e: unknown) => String((e as { message?: string })?.message ?? e);

/** Estado de las tareas del registro, para mostrar avance y errores en la pantalla. */
export function useTareasDano(id: string): EstadoTareas {
  return useSyncExternalStore(suscribir, () => estados.get(id) ?? REPOSO);
}

/** Descarga el mapa base de la posición actual del registro. En modo silencioso no reporta la falta de configuración. */
export async function descargarFondoDano(id: string, silencioso: boolean): Promise<void> {
  if ((estados.get(id) ?? REPOSO).mapa.fase === 'descargando') return;
  const d = await obtenerDano(id);
  if (!d?.gps) return;
  const aj = await leerAjustes();
  const impedimento = impedimentoMapa(aj);
  if (impedimento) {
    if (!silencioso) poner(id, { mapa: { fase: 'error', msg: impedimento } });
    return;
  }
  poner(id, { mapa: { fase: 'descargando' } });
  try {
    const { lat, lon } = d.gps;
    const r = await descargarMapa(lat, lon, aj);
    const blobId = nuevoId();
    await guardarBlob(blobId, r.blob);
    let anterior: string | undefined;
    let aplicado = false;
    await modificarDano(id, (actual) => {
      // Si la posición cambió mientras se descargaba, este mapa ya no corresponde
      if (!actual.gps || actual.gps.lat !== lat || actual.gps.lon !== lon) return {};
      anterior = actual.mapa?.blobId;
      aplicado = true;
      return { mapa: { blobId, ...r.meta } };
    });
    if (!aplicado) await eliminarBlob(blobId);
    else if (anterior) await eliminarBlob(anterior);
    poner(id, { mapa: { fase: 'reposo' } });
  } catch (e) {
    poner(id, { mapa: { fase: 'error', msg: mensaje(e) } });
  }
}

/** Captura la posición GNSS, la guarda en el registro y lanza la descarga del mapa base. */
export async function capturarPosicionDano(id: string): Promise<void> {
  if ((estados.get(id) ?? REPOSO).gps.fase === 'buscando') return;
  poner(id, { gps: { fase: 'buscando' } });
  try {
    const pos = await obtenerPosicion({
      alProgreso: (p) => poner(id, { gps: { fase: 'buscando', msg: p.precision != null ? `± ${fmtFijo(p.precision, 1)} m` : undefined } }),
    });
    let anterior: string | undefined;
    const guardado = await modificarDano(id, (actual) => {
      anterior = actual.mapa?.blobId;
      return { gps: pos, mapa: null };
    });
    if (anterior) await eliminarBlob(anterior);
    poner(id, { gps: { fase: 'reposo' } });
    if (guardado) void descargarFondoDano(id, true);
  } catch (e) {
    poner(id, { gps: { fase: 'error', msg: mensaje(e) } });
  }
}
