import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  eliminarBlob,
  eliminarDano,
  guardarBlob,
  leerAjustes,
  listarDanos,
  modificarDano,
  nuevoId,
  obtenerBlob,
  obtenerDano,
  obtenerSector,
  suscribirDano,
} from '../data/db';
import {
  CARRILES_BASE,
  CATEGORIAS,
  NOMBRE_SEVERIDAD,
  SEVERIDADES,
  TIPOS_DANO,
  etiquetaUnidad,
  siglaRegistro,
  tipoDano,
} from '../domain/catalogo';
import { descripcionAutomatica, fmtFechaHora, fmtFijo, fmtNum, fmtPR, magnitud, parseNum, parsePR } from '../domain/formato';
import { aEpsg9377, fmtCoord, fmtGrados } from '../domain/geo';
import { pxPorMetro } from '../domain/regla';
import type { Dano, Sector } from '../domain/types';
import { fotoParaInforme } from '../services/fotoAnotada';
import { normalizarFoto } from '../services/imagen';
import { componerPlano, MAPA_ESCALA, MAPA_H, MAPA_W, type Marcador } from '../services/mapa';
import { elegirDeGaleria, esNativo, tomarFoto } from '../services/plataforma';
import { capturarPosicionDano, descargarFondoDano, useTareasDano } from '../services/tareasDano';
import { COLOR_SEV } from './colores';
import { Campo, EntradaValor, Hoja, Icono, Pantalla, Texto, useAviso } from './comunes';

const optNum = (t: string) => (t.trim() === '' ? null : parseNum(t) ?? undefined);
const optPR = (t: string) => (t.trim() === '' ? null : parsePR(t) ?? undefined);

function SelectorTipo(p: { alElegir: (codigo: string) => void; alCerrar: () => void }) {
  const [q, setQ] = useState('');
  const f = q.trim().toLowerCase();
  return (
    <Hoja titulo="Tipo de daño" alCerrar={p.alCerrar}>
      <input className="entrada" placeholder="Buscar por nombre o sigla" value={q} onChange={(e) => setQ(e.target.value)} />
      {CATEGORIAS.map((c) => {
        const tipos = TIPOS_DANO.filter((t) => t.categoria === c.id && (!f || t.nombre.toLowerCase().includes(f) || t.codigo.toLowerCase().includes(f)));
        if (!tipos.length) return null;
        return (
          <div key={c.id}>
            <div className="grupo">{c.nombre}</div>
            {tipos.map((t) => (
              <button key={t.codigo} className="opcion" data-testid={`tipo-${t.codigo}`} onClick={() => p.alElegir(t.codigo)}>
                <span className="sigla">{t.codigo}</span>
                <span>{t.nombre}</span>
                <span className="u">{etiquetaUnidad(t.unidad)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </Hoja>
  );
}

export function EditorDano() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const [d, setD] = useState<Dano | null>(null);
  const [sector, setSector] = useState<Sector | null>(null);
  const [eligiendoTipo, setEligiendoTipo] = useState(false);
  const [urlFoto, setUrlFoto] = useState<string | null>(null);
  const [urlPlano, setUrlPlano] = useState<string | null>(null);
  const [ocupadoFoto, setOcupadoFoto] = useState(false);
  const { gps: gpsEstado, mapa: mapaEstado } = useTareasDano(id);
  const ref = useRef<Dano | null>(null);
  const pendientes = useRef(0);
  const iniciado = useRef(false);
  const fijar = useCallback((n: Dano | null) => {
    ref.current = n;
    setD(n);
  }, []);

  /**
   * Aplica cambios del formulario: se reflejan de inmediato en pantalla y se guardan como cambio
   * parcial, de modo que no pisan lo que guarden la medición, el GPS o la descarga del mapa.
   */
  const actualizar = useCallback(
    (cambios: Partial<Dano>) => {
      if (!ref.current) return;
      let n: Dano = { ...ref.current, ...cambios };
      if (n.descripcionAuto) n = { ...n, descripcion: descripcionAutomatica(n) };
      fijar(n);
      pendientes.current++;
      void modificarDano(id, cambios).finally(async () => {
        if (--pendientes.current > 0) return;
        const guardado = await obtenerDano(id);
        if (guardado && pendientes.current === 0 && ref.current) fijar(guardado);
      });
    },
    [id, fijar],
  );

  // Cambios hechos fuera del formulario (posición, mapa base, medición)
  useEffect(
    () =>
      suscribirDano(id, (n) => {
        if (pendientes.current === 0 && ref.current) fijar(n);
      }),
    [id, fijar],
  );

  const capturarGps = useCallback(() => void capturarPosicionDano(id), [id]);

  const ponerFoto = useCallback(
    async (origen: () => Promise<Blob | null>) => {
      setOcupadoFoto(true);
      try {
        const blob = await origen();
        if (!blob) return;
        const [grande, mini] = await Promise.all([normalizarFoto(blob), normalizarFoto(blob, 240)]);
        const anterior = ref.current?.foto;
        const foto = { blobId: nuevoId(), miniId: nuevoId(), w: grande.w, h: grande.h };
        await guardarBlob(foto.blobId, grande.blob);
        await guardarBlob(foto.miniId, mini.blob);
        actualizar({ foto, medicion: null, fechaHora: new Date().toISOString() });
        if (anterior) {
          void eliminarBlob(anterior.blobId);
          void eliminarBlob(anterior.miniId);
        }
      } catch (e) {
        avisar(`No se pudo obtener la fotografía: ${String((e as Error).message ?? e)}`);
      } finally {
        setOcupadoFoto(false);
      }
    },
    [actualizar, avisar],
  );

  // Carga inicial; en un registro nuevo se captura la posición y (en el dispositivo) se abre la cámara.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const x = await obtenerDano(id);
      if (!vivo || !x) return;
      fijar(x);
      setSector((await obtenerSector(x.sectorId)) ?? null);
      if (params.get('nuevo') === '1' && !iniciado.current) {
        iniciado.current = true;
        nav(`/dano/${id}`, { replace: true });
        if (esNativo && !x.foto) {
          // En el teléfono: primero la cámara y, al volver, la posición. Con la cámara abierta la
          // aplicación queda en segundo plano y Android limita las lecturas de ubicación; además
          // así el diálogo de permiso de ubicación no compite con la cámara.
          await ponerFoto(tomarFoto);
          if (!ref.current?.gps) void capturarPosicionDano(id);
        } else if (!x.gps) void capturarPosicionDano(id);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Vista previa de la fotografía con anotaciones
  const claveFoto = d?.foto ? `${d.foto.blobId}|${JSON.stringify(d.medicion)}` : '';
  useEffect(() => {
    let vivo = true;
    const actual = ref.current;
    if (!actual?.foto) {
      setUrlFoto(null);
      return;
    }
    void (async () => {
      const b = await obtenerBlob(actual.foto!.blobId);
      if (!b || !vivo) return;
      const r = await fotoParaInforme(b, actual.medicion, '', 1200);
      if (vivo) setUrlFoto(r.dataUrl);
    })();
    return () => {
      vivo = false;
    };
  }, [claveFoto]);

  // Vista en planta: mapa base (si existe) o croquis, con los demás daños del sector
  const clavePlano = d?.gps ? `${d.gps.lat}|${d.gps.lon}|${d.mapa?.blobId ?? ''}|${d.severidad}|${d.tipo}` : '';
  useEffect(() => {
    let vivo = true;
    const actual = ref.current;
    if (!actual?.gps) {
      setUrlPlano(null);
      return;
    }
    void (async () => {
      const t = tipoDano(actual.tipo);
      const marca = (x: Dano, principal: boolean): Marcador => {
        const tx = tipoDano(x.tipo);
        const c = COLOR_SEV[tx?.severidades && x.severidad ? x.severidad : 'N'];
        return { lat: x.gps!.lat, lon: x.gps!.lon, etiqueta: String(x.numero), color: c.fondo, colorTexto: c.texto, principal };
      };
      void t;
      const vecinos = (await listarDanos(actual.sectorId)).filter((x) => x.id !== actual.id && x.gps).map((x) => marca(x, false));
      const fondo = actual.mapa ? (await obtenerBlob(actual.mapa.blobId)) ?? null : null;
      const aj = await leerAjustes();
      const vista = actual.mapa
        ? { lat: actual.mapa.lat, lon: actual.mapa.lon, zoom: actual.mapa.zoom, w: actual.mapa.w, h: actual.mapa.h, escala: actual.mapa.escala }
        : { lat: actual.gps!.lat, lon: actual.gps!.lon, zoom: aj.zoomMapa, w: MAPA_W, h: MAPA_H, escala: MAPA_ESCALA };
      const plano = await componerPlano(fondo, vista, [marca(actual, true), ...vecinos]);
      if (vivo) setUrlPlano(plano.dataUrl);
    })();
    return () => {
      vivo = false;
    };
  }, [clavePlano]);

  if (!d) return <Pantalla titulo="Daño" atras>{null}</Pantalla>;
  const t = tipoDano(d.tipo);
  const en = d.gps ? aEpsg9377(d.gps.lat, d.gps.lon) : null;
  const mg = magnitud(d);
  const escala = pxPorMetro(d.medicion);

  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar el registro de la foto ${d.numero}?`)) return;
    ref.current = null;
    await eliminarDano(d.id);
    nav(-1);
  };
  const elegirTipo = (codigo: string) => {
    const nt = tipoDano(codigo)!;
    actualizar({
      tipo: codigo,
      severidad: nt.severidades ? d.severidad : null,
      enBerma: nt.propioDeBerma ? false : d.enBerma,
      ancho: nt.unidad === 'm2' ? d.ancho : nt.propioDeBerma ? d.ancho : null,
    });
    setEligiendoTipo(false);
  };

  return (
    <Pantalla
      titulo={`Foto ${d.numero}${t ? ` · ${siglaRegistro(d.tipo, d.enBerma)}` : ''}`}
      subtitulo={sector ? `${sector.nombre} · ${fmtFechaHora(d.fechaHora)}` : undefined}
      atras
      acciones={<button className="icono-btn" data-testid="listo" onClick={() => nav(-1)}>Listo</button>}
    >
      {/* Fotografía */}
      <div className="foto-caja">
        {urlFoto ? (
          <img src={urlFoto} alt={`Fotografía ${d.numero}`} data-testid="foto" />
        ) : (
          <div className="foto-vacia">
            {ocupadoFoto ? 'Procesando fotografía…' : 'Coloque la regla naranja de 1 m junto al daño, en el plano del pavimento, y tome la fotografía lo más perpendicular posible.'}
          </div>
        )}
      </div>
      <div className="acciones" style={{ marginBottom: 12 }}>
        <button className="btn primario" data-testid="tomar-foto" disabled={ocupadoFoto} onClick={() => ponerFoto(tomarFoto)}>{Icono.camara} {d.foto ? 'Repetir foto' : 'Tomar foto'}</button>
        <button className="btn" data-testid="galeria" disabled={ocupadoFoto} onClick={() => ponerFoto(elegirDeGaleria)}>{Icono.galeria} Galería</button>
        {d.foto ? (
          <button className="btn oscuro" data-testid="medir" onClick={() => nav(`/dano/${d.id}/medir`)}>{Icono.regla} {escala ? 'Ajustar medición' : 'Medir con la regla'}</button>
        ) : null}
      </div>

      {/* Clasificación */}
      <div className="tarjeta">
        <h3>Clasificación del daño</h3>
        <button className="btn bloque" data-testid="elegir-tipo" style={{ justifyContent: 'flex-start', marginBottom: 12 }} onClick={() => setEligiendoTipo(true)}>
          {t ? (
            <>
              <span className="sigla">{siglaRegistro(d.tipo, d.enBerma)}</span>
              <span className="crece" style={{ textAlign: 'left' }}>{t.nombre}</span>
            </>
          ) : (
            <span className="crece" style={{ textAlign: 'left', color: 'var(--naranja-osc)' }}>Elegir tipo de daño…</span>
          )}
          <span className="tenue" style={{ fontWeight: 500, fontSize: 13 }}>Cambiar</span>
        </button>
        {t && !t.propioDeBerma ? (
          <label className="casilla">
            <input type="checkbox" checked={d.enBerma} onChange={(e) => actualizar({ enBerma: e.target.checked })} />
            El daño está en la berma (se registra como {t.codigo}B)
          </label>
        ) : null}
        {t ? (
          t.severidades ? (
            <>
              <span className="campo" style={{ marginBottom: 6, marginTop: 6 }}>
                <span className="etq">Severidad{t.criterio ? ` · criterio: ${t.criterio.toLowerCase()}` : ''}</span>
              </span>
              <div className="segmentos">
                {SEVERIDADES.map((s) => (
                  <button
                    key={s}
                    data-testid={`sev-${s}`}
                    className={d.severidad === s ? 'activo' : ''}
                    style={d.severidad === s ? { background: COLOR_SEV[s].fondo, borderColor: COLOR_SEV[s].fondo, color: COLOR_SEV[s].texto } : undefined}
                    onClick={() => actualizar({ severidad: s })}
                  >
                    {NOMBRE_SEVERIDAD[s]}
                  </button>
                ))}
              </div>
              <div className="criterios">
                {SEVERIDADES.map((s) => (
                  <div key={s} className={'criterio' + (d.severidad === s ? ' activo' : '')} onClick={() => actualizar({ severidad: s })}>
                    <b style={{ minWidth: 46 }}>{NOMBRE_SEVERIDAD[s]}</b>
                    <span>{t.severidades![s]}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="aviso info" style={{ marginTop: 8, marginBottom: 0 }}>Este daño no tiene grados de severidad asociados.</div>
          )
        ) : null}
        {t ? (
          <button className="btn chico" style={{ marginTop: 10 }} onClick={() => nav(`/catalogo/${t.codigo}`)}>{Icono.libro} Ver en el manual</button>
        ) : null}
      </div>

      {/* Localización en la vía */}
      <div className="tarjeta">
        <h3>Localización en la vía</h3>
        <Campo etiqueta="Abscisa (PR)" ayuda={sector ? `Sector: ${fmtPR(sector.prInicial)} a ${fmtPR(sector.prFinal)}` : undefined}>
          <EntradaValor id="d-abscisa" valor={d.abscisa} formatear={(v) => (v == null ? '' : fmtPR(v, false))} analizar={optPR} alCambiar={(v) => actualizar({ abscisa: v })} teclado="text" marcador="63+450" />
        </Campo>
        <span className="campo" style={{ marginBottom: 6 }}><span className="etq">Carril</span></span>
        <div className="segmentos" style={{ marginBottom: 8 }}>
          {CARRILES_BASE.map((c) => (
            <button key={c.id} data-testid={`carril-${c.id}`} className={d.carril === c.id ? 'activo' : ''} title={c.nombre} onClick={() => actualizar({ carril: c.id })}>{c.id}</button>
          ))}
        </div>
        <Campo etiqueta="Otra convención de carril" ayuda="D derecho · I izquierdo · C toda la calzada · E eje. Varios carriles o calzadas: D1, I2, C1-D2…">
          <Texto valor={d.carril} alCambiar={(v) => actualizar({ carril: v.toUpperCase().trim() })} />
        </Campo>
      </div>

      {/* Dimensiones */}
      <div className="tarjeta">
        <h3>Dimensiones</h3>
        {escala ? (
          <div className="aviso info">Escala fotográfica: la regla de {fmtFijo(d.medicion!.longitudRegla, 2)} m mide {Math.round(escala * d.medicion!.longitudRegla)} px. Los valores medidos se pueden corregir a mano.</div>
        ) : d.foto ? (
          <div className="aviso">Use «Medir con la regla» para escalar las dimensiones sobre la fotografía, o escríbalas medidas en campo.</div>
        ) : null}
        <div className="rejilla-2">
          <Campo etiqueta={t?.unidad === 'm' ? 'Longitud (m)' : 'Largo (m)'}>
            <EntradaValor id="d-largo" valor={d.largo} formatear={(v) => fmtNum(v, 2)} analizar={optNum} alCambiar={(v) => actualizar({ largo: v })} />
          </Campo>
          <Campo etiqueta={t?.unidad === 'm' ? (t.propioDeBerma ? 'Desnivel o abertura (m)' : 'Ancho (no aplica)') : 'Ancho (m)'}>
            <EntradaValor id="d-ancho" valor={d.ancho} formatear={(v) => fmtNum(v, 2)} analizar={optNum} alCambiar={(v) => actualizar({ ancho: v })} />
          </Campo>
        </div>
        {t ? (
          <p className="meta" style={{ marginBottom: 10 }}>
            {t.unidad === 'm2'
              ? `Área afectada: ${fmtNum(mg.area)} m²`
              : t.lineal
                ? `Área equivalente: ${fmtNum(mg.area)} m² (longitud × 0,6 m de ancho de referencia)`
                : t.unidad === 'm'
                  ? 'Este daño se cuantifica en longitud afectada (m).'
                  : 'Se registra en las aclaraciones del daño asociado.'}
          </p>
        ) : null}
        <div className="rejilla-2">
          <Campo etiqueta="Reparación: largo (m)" ayuda="Vacío = igual al daño">
            <EntradaValor valor={d.repLargo} formatear={(v) => fmtNum(v, 2)} analizar={optNum} alCambiar={(v) => actualizar({ repLargo: v })} />
          </Campo>
          <Campo etiqueta="Reparación: ancho (m)">
            <EntradaValor valor={d.repAncho} formatear={(v) => fmtNum(v, 2)} analizar={optNum} alCambiar={(v) => actualizar({ repAncho: v })} />
          </Campo>
        </div>
      </div>

      {/* Coordenadas y plano */}
      <div className="tarjeta">
        <h3>Coordenadas · EPSG:9377</h3>
        {en && d.gps ? (
          <dl className="coords" data-testid="coords">
            <dt>Este</dt><dd>{fmtCoord(en.este)} m</dd>
            <dt>Norte</dt><dd>{fmtCoord(en.norte)} m</dd>
            <dt>Latitud</dt><dd>{fmtGrados(d.gps.lat)}</dd>
            <dt>Longitud</dt><dd>{fmtGrados(d.gps.lon)}</dd>
            <dt>Precisión</dt><dd>{d.gps.precision != null ? `± ${fmtFijo(d.gps.precision, 1)} m` : 'No informada'}</dd>
          </dl>
        ) : (
          <p className="meta">{gpsEstado.fase === 'buscando' ? 'Buscando señal GPS…' : 'Sin coordenadas capturadas.'}</p>
        )}
        {gpsEstado.fase === 'error' ? <div className="aviso error" style={{ marginTop: 10 }}>{gpsEstado.msg}</div> : null}
        <button className="btn bloque" data-testid="gps" style={{ marginTop: 12 }} disabled={gpsEstado.fase === 'buscando'} onClick={capturarGps}>
          {Icono.gps} {gpsEstado.fase === 'buscando' ? `Capturando posición… ${gpsEstado.msg ?? ''}` : d.gps ? 'Volver a capturar la posición' : 'Capturar posición'}
        </button>
        {urlPlano ? <img className="mapa-img" style={{ marginTop: 12 }} src={urlPlano} alt="Vista en planta del daño" data-testid="plano" /> : null}
        {d.gps ? (
          <>
            {mapaEstado.fase === 'error' ? <div className="aviso" style={{ marginTop: 10 }}>{mapaEstado.msg}</div> : null}
            {!d.mapa && mapaEstado.fase === 'reposo' ? <p className="meta" style={{ marginTop: 8 }}>Croquis sin mapa base. El mapa se descarga cuando hay conexión a Internet.</p> : null}
            <button className="btn bloque chico" data-testid="mapa" style={{ marginTop: 10 }} disabled={mapaEstado.fase === 'descargando'} onClick={() => void descargarFondoDano(d.id, false)}>
              {Icono.mapa} {mapaEstado.fase === 'descargando' ? 'Descargando mapa…' : d.mapa ? 'Actualizar mapa base' : 'Descargar mapa base'}
            </button>
          </>
        ) : null}
      </div>

      {/* Textos */}
      <div className="tarjeta">
        <h3>Descripción y aclaraciones</h3>
        <Campo etiqueta="Aclaraciones" ayuda="Daños asociados, afloramientos, causa probable, recomendación de reparación…">
          <Texto id="d-aclar" valor={d.aclaraciones} alCambiar={(v) => actualizar({ aclaraciones: v })} multilinea />
        </Campo>
        <Campo etiqueta="Descripción del daño (aparece en la ficha del informe)">
          <Texto id="d-desc" valor={d.descripcion} alCambiar={(v) => actualizar({ descripcion: v, descripcionAuto: false })} multilinea filas={5} />
        </Campo>
        {!d.descripcionAuto ? (
          <button className="btn chico" onClick={() => actualizar({ descripcionAuto: true })}>Restablecer descripción automática</button>
        ) : (
          <p className="meta tenue">La descripción se genera con los datos del registro y el manual; puede editarla.</p>
        )}
      </div>

      <div className="acciones">
        <button className="btn primario" onClick={() => nav(-1)}>{Icono.ok} Listo</button>
        <button className="btn peligro" onClick={eliminar}>{Icono.borrar} Eliminar</button>
      </div>
      {eligiendoTipo ? <SelectorTipo alElegir={elegirTipo} alCerrar={() => setEligiendoTipo(false)} /> : null}
    </Pantalla>
  );
}
