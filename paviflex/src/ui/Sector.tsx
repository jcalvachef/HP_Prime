import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  eliminarDano,
  eliminarSector,
  guardarDano,
  guardarSector,
  listarDanos,
  nuevoId,
  obtenerProyecto,
  obtenerSector,
  siguienteNumero,
} from '../data/db';
import { analizarSector, ordenarDanos, type AnalisisGrupo } from '../domain/analisis';
import { siglaRegistro, tipoDano } from '../domain/catalogo';
import { fmtNum, fmtPct, fmtPR, hoyISO, parseNum, parsePR, textoDimensiones } from '../domain/formato';
import type { Dano, Sector } from '../domain/types';
import { graficaSeveridades, graficaTramos } from '../report/graficas';
import { Campo, ChipSeveridad, EntradaValor, Icono, Miniatura, Pantalla, Texto, useAviso, useCarga } from './comunes';

function sectorVacio(proyectoId: string, levantadoPor: string): Sector {
  return {
    id: nuevoId(), proyectoId, nombre: '', prInicial: 0, prFinal: 0, fecha: hoyISO(), levantadoPor,
    numCalzadas: 1, carrilesPorCalzada: '2', totalCarriles: 2, anchoCarril: 3.5, anchoBerma: 0, numBermas: 2,
    descBerma: '', comentarios: '', longitudTramo: 100, creado: new Date().toISOString(),
  };
}

const numTxt = (v: number) => (v ? fmtNum(v, 3) : '');
const aNum = (t: string) => (t.trim() === '' ? 0 : parseNum(t) ?? undefined);
const aPR = (t: string) => (t.trim() === '' ? 0 : parsePR(t) ?? undefined);

export function EditarSector() {
  const { id, proyectoId } = useParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const [s, setS] = useState<Sector | null>(null);
  useEffect(() => {
    if (id) void obtenerSector(id).then((x) => x && setS(x));
    else if (proyectoId) void obtenerProyecto(proyectoId).then((p) => setS(sectorVacio(proyectoId, p?.levantadoPor ?? '')));
  }, [id, proyectoId]);
  if (!s) return <Pantalla titulo="Sector" atras>{null}</Pantalla>;
  const set = <K extends keyof Sector>(k: K, v: Sector[K]) => setS({ ...s, [k]: v });
  const guardar = async () => {
    if (!s.nombre.trim()) return avisar('Escriba el nombre del sector.');
    if (!(s.prFinal > s.prInicial)) return avisar('El PR final debe ser mayor que el PR inicial (formato 63+400).');
    if (!(s.anchoCarril > 0) || !(s.totalCarriles > 0)) return avisar('Indique el ancho de carril y el número total de carriles.');
    await guardarSector(s);
    if (id) nav(-1);
    else nav(`/sector/${s.id}`, { replace: true });
  };
  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar el sector "${s.nombre}" con todos sus daños y fotografías?`)) return;
    await eliminarSector(s.id);
    nav(`/proyecto/${s.proyectoId}`, { replace: true });
  };
  return (
    <Pantalla titulo={id ? 'Editar sector' : 'Nuevo sector'} atras acciones={<button className="icono-btn" data-testid="guardar" onClick={guardar}>Guardar</button>}>
      <div className="tarjeta">
        <h3>Información general</h3>
        <Campo etiqueta="Nombre del sector"><Texto id="s-nombre" valor={s.nombre} alCambiar={(v) => set('nombre', v)} marcador="Sector 1 – El Pepino" /></Campo>
        <div className="rejilla-2">
          <Campo etiqueta="PR inicial" ayuda="Formato 63+400">
            <EntradaValor id="s-pri" valor={s.prInicial} formatear={(v) => fmtPR(v, false)} analizar={aPR} alCambiar={(v) => set('prInicial', v)} teclado="text" marcador="63+400" />
          </Campo>
          <Campo etiqueta="PR final">
            <EntradaValor id="s-prf" valor={s.prFinal} formatear={(v) => (v ? fmtPR(v, false) : '')} analizar={aPR} alCambiar={(v) => set('prFinal', v)} teclado="text" marcador="64+250" />
          </Campo>
        </div>
        <div className="rejilla-2">
          <Campo etiqueta="Fecha del levantamiento">
            <input className="entrada" type="date" value={s.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </Campo>
          <Campo etiqueta="Levantado por"><Texto valor={s.levantadoPor} alCambiar={(v) => set('levantadoPor', v)} /></Campo>
        </div>
      </div>
      <div className="tarjeta">
        <h3>Geometría de la vía</h3>
        <div className="rejilla-2">
          <Campo etiqueta="Número de calzadas">
            <EntradaValor valor={s.numCalzadas} formatear={numTxt} analizar={aNum} alCambiar={(v) => set('numCalzadas', v)} teclado="numeric" />
          </Campo>
          <Campo etiqueta="Carriles por calzada" ayuda='Ej.: "2" o "C1 = 2, C2 = 3"'>
            <Texto valor={s.carrilesPorCalzada} alCambiar={(v) => setS({ ...s, carrilesPorCalzada: v, totalCarriles: /^\d+$/.test(v.trim()) ? parseInt(v, 10) * Math.max(1, s.numCalzadas) : s.totalCarriles })} />
          </Campo>
        </div>
        <div className="rejilla-2">
          <Campo etiqueta="Total de carriles" ayuda="Para el área inspeccionada">
            <EntradaValor id="s-carriles" valor={s.totalCarriles} formatear={numTxt} analizar={aNum} alCambiar={(v) => set('totalCarriles', v)} teclado="numeric" />
          </Campo>
          <Campo etiqueta="Ancho de carril (m)">
            <EntradaValor id="s-ancho" valor={s.anchoCarril} formatear={numTxt} analizar={aNum} alCambiar={(v) => set('anchoCarril', v)} />
          </Campo>
        </div>
        <div className="rejilla-2">
          <Campo etiqueta="Ancho de berma (m)" ayuda="0 si no hay berma">
            <EntradaValor id="s-berma" valor={s.anchoBerma} formatear={(v) => fmtNum(v, 3)} analizar={aNum} alCambiar={(v) => set('anchoBerma', v)} />
          </Campo>
          <Campo etiqueta="Número de bermas">
            <select className="entrada" value={s.numBermas} onChange={(e) => set('numBermas', Number(e.target.value))}>
              <option value={0}>Sin berma</option>
              <option value={1}>1 (un costado)</option>
              <option value={2}>2 (ambos costados)</option>
            </select>
          </Campo>
        </div>
        <Campo etiqueta="Descripción de la berma" ayuda="Opcional, p. ej. bermacuneta">
          <Texto valor={s.descBerma} alCambiar={(v) => set('descBerma', v)} />
        </Campo>
        <Campo etiqueta="Longitud del tramo de análisis (m)" ayuda="El manual establece tramos de 100 m en abscisas cerradas.">
          <EntradaValor valor={s.longitudTramo} formatear={numTxt} analizar={(t) => { const v = parseNum(t); return v && v >= 10 ? v : undefined; }} alCambiar={(v) => set('longitudTramo', v)} teclado="numeric" />
        </Campo>
      </div>
      <div className="tarjeta">
        <h3>Comentarios</h3>
        <Campo etiqueta="Comentarios generales del sector" ayuda="Problemas generalizados, características del terreno, información de la comunidad, etc.">
          <Texto id="s-coment" valor={s.comentarios} alCambiar={(v) => set('comentarios', v)} multilinea filas={4} />
        </Campo>
      </div>
      <button className="btn primario bloque" onClick={guardar}>Guardar sector</button>
      {id ? <button className="btn peligro bloque" style={{ marginTop: 10 }} onClick={eliminar}>{Icono.borrar} Eliminar sector</button> : null}
    </Pantalla>
  );
}

function TablaGrupo({ g }: { g: AnalisisGrupo }) {
  const graficas = useMemo(() => (g.numRegistros ? { t: graficaTramos(g), s: graficaSeveridades(g) } : null), [g]);
  if (!g.numRegistros) return null;
  return (
    <>
      <h2 style={{ fontSize: 15.5, margin: '14px 2px 8px' }}>{g.titulo}</h2>
      <div className="cifras">
        <div className="cifra"><div className="v">{fmtNum(g.areaAfectada)}</div><div className="k">m² afectados</div></div>
        <div className="cifra"><div className="v">{fmtPct(g.pctAfectacion, 2)}</div><div className="k">de afectación</div></div>
        <div className="cifra"><div className="v">{g.numRegistros}</div><div className="k">registros</div></div>
      </div>
      <div className="tabla-envoltura">
        <table className="datos">
          <thead>
            <tr>
              <th>Tramo</th>
              {g.columnas.map((c) => <th key={c.clave}>{c.sigla}{c.sev ? ` ${c.sev}` : ''}</th>)}
              <th>Total m²</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {g.tramos.map((t, i) => (
              <tr key={t.id}>
                <td>{t.id} · {fmtPR(t.desde, false)}–{fmtPR(t.hasta, false)}</td>
                {g.columnas.map((c, j) => <td key={c.clave}>{g.matriz[i][j] ? fmtNum(g.matriz[i][j]) : ''}</td>)}
                <td><b>{g.totalTramo[i] ? fmtNum(g.totalTramo[i]) : ''}</b></td>
                <td>{fmtPct(g.pctTramo[i])}</td>
              </tr>
            ))}
            <tr>
              <td><b>Total</b></td>
              {g.columnas.map((c, j) => <td key={c.clave}><b>{fmtNum(g.totalColumna[j])}</b></td>)}
              <td><b>{fmtNum(g.areaAfectada)}</b></td>
              <td><b>{fmtPct(g.pctAfectacion)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
      {graficas ? <img className="grafica" src={graficas.t.dataUrl} alt={`Área afectada por tramo, ${g.titulo}`} /> : null}
      {graficas?.s ? <img className="grafica" src={graficas.s.dataUrl} alt={`Distribución por tipo y severidad, ${g.titulo}`} /> : null}
    </>
  );
}

export function VistaSector() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const [pestana, setPestana] = useState<'danos' | 'resumen'>('danos');
  const { datos } = useCarga(async () => {
    const s = await obtenerSector(id);
    // Se descartan los registros abandonados sin tipo ni fotografía
    const todos = await listarDanos(id);
    const vacios = todos.filter((d) => !d.tipo && !d.foto && !d.aclaraciones && d.largo == null);
    for (const d of vacios) await eliminarDano(d.id);
    return { s, danos: todos.filter((d) => !vacios.includes(d)) };
  }, [id]);
  const analisis = useMemo(() => (datos?.s ? analizarSector(datos.s, datos.danos) : null), [datos]);
  if (!datos) return <Pantalla titulo="Sector" atras>{null}</Pantalla>;
  const { s, danos } = datos;
  if (!s || !analisis) return <Pantalla titulo="Sector" atras><div className="vacio">Sector no encontrado.</div></Pantalla>;

  const nuevo = async () => {
    try {
      const ultimo = [...danos].sort((a, b) => b.numero - a.numero)[0];
      const d: Dano = {
        id: nuevoId(), sectorId: s.id, proyectoId: s.proyectoId, numero: await siguienteNumero(s.id),
        abscisa: ultimo?.abscisa ?? s.prInicial, carril: ultimo?.carril ?? 'D', tipo: '', enBerma: false, severidad: null,
        largo: null, ancho: null, repLargo: null, repAncho: null, aclaraciones: '', descripcion: '', descripcionAuto: true,
        fechaHora: new Date().toISOString(), gps: null, foto: null, medicion: null, mapa: null,
      };
      await guardarDano(d);
      nav(`/dano/${d.id}?nuevo=1`);
    } catch (e) {
      avisar(String((e as Error).message ?? e));
    }
  };

  return (
    <Pantalla
      titulo={s.nombre}
      subtitulo={`${fmtPR(s.prInicial)} a ${fmtPR(s.prFinal)}`}
      atras={() => nav(`/proyecto/${s.proyectoId}`)}
      acciones={<button className="icono-btn" aria-label="Editar sector" onClick={() => nav(`/sector/${id}/editar`)}>{Icono.editar}</button>}
      bajoBarra={
        <div className="pestanas">
          <button className={pestana === 'danos' ? 'activa' : ''} onClick={() => setPestana('danos')}>Daños ({danos.length})</button>
          <button className={pestana === 'resumen' ? 'activa' : ''} data-testid="tab-resumen" onClick={() => setPestana('resumen')}>Análisis</button>
        </div>
      }
    >
      {pestana === 'danos' ? (
        <>
          {danos.length === 0 ? (
            <div className="vacio">
              <strong>Sin daños registrados</strong>
              Toque «Nuevo daño» para fotografiar un deterioro con la regla naranja de 1 m junto a él.
            </div>
          ) : null}
          {ordenarDanos(danos).map((d) => {
            const t = tipoDano(d.tipo);
            return (
              <button key={d.id} className="tarjeta tocable item-dano" onClick={() => nav(`/dano/${d.id}`)}>
                <Miniatura blobId={d.foto?.miniId} />
                <div className="crece">
                  <div className="linea1">
                    <span className="sigla">{d.tipo ? siglaRegistro(d.tipo, d.enBerma) : '—'}</span>
                    {t ? <ChipSeveridad sev={d.severidad} sinGrado={!t.severidades} /> : null}
                    <span className="meta" style={{ margin: 0 }}>Foto {d.numero}</span>
                  </div>
                  <div className="nombre">{t?.nombre ?? 'Tipo de daño sin asignar'}</div>
                  <div className="meta">
                    {d.abscisa != null ? fmtPR(d.abscisa) : 'Sin abscisa'} · {d.carril || '–'}{t ? ` · ${textoDimensiones(d)}` : ''}
                  </div>
                  <div className="meta tenue">{d.gps ? 'Con coordenadas' : 'Sin coordenadas'}{d.mapa ? ' · con mapa base' : ''}</div>
                </div>
              </button>
            );
          })}
        </>
      ) : (
        <>
          <div className="cifras">
            <div className="cifra"><div className="v">{fmtNum(analisis.areaInspeccionada, 0)}</div><div className="k">m² inspeccionados</div></div>
            <div className="cifra"><div className="v">{fmtNum(analisis.longitud, 0)} m</div><div className="k">longitud · {analisis.tramos.length} tramos</div></div>
            <div className="cifra"><div className="v">{fmtNum(analisis.anchoCalzada)} m</div><div className="k">ancho de calzada</div></div>
          </div>
          {analisis.advertencias.length ? (
            <div className="aviso">
              <b>Datos por completar</b>
              <ul>{analisis.advertencias.slice(0, 8).map((a, i) => <li key={i}>{a}</li>)}</ul>
              {analisis.advertencias.length > 8 ? <div>… y {analisis.advertencias.length - 8} más.</div> : null}
            </div>
          ) : null}
          {danos.length === 0 ? <div className="vacio">El análisis aparecerá cuando registre daños.</div> : null}
          <TablaGrupo g={analisis.grupos.carriles} />
          <TablaGrupo g={analisis.grupos.superficiales} />
          <TablaGrupo g={analisis.grupos.bermas} />
          {analisis.lineales.length ? (
            <>
              <h2 style={{ fontSize: 15.5, margin: '14px 2px 8px' }}>Otros daños medidos en longitud</h2>
              <div className="tabla-envoltura">
                <table className="datos">
                  <thead><tr><th>Daño</th><th>Severidad</th><th>Registros</th><th>Longitud (m)</th></tr></thead>
                  <tbody>
                    {analisis.lineales.map((l) => (
                      <tr key={l.sigla + l.sev}><td>{l.sigla} · {l.nombre}</td><td>{l.sev ?? '–'}</td><td>{l.cantidad}</td><td>{l.unidad === 'm' ? fmtNum(l.longitud) : '–'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      )}
      {pestana === 'danos' ? (
        <button className="fab" data-testid="nuevo-dano" onClick={nuevo}>{Icono.camara} Nuevo daño</button>
      ) : null}
    </Pantalla>
  );
}
