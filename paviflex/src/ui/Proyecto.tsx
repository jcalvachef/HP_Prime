import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  eliminarProyecto,
  guardarProyecto,
  listarDanos,
  listarSectores,
  nuevoId,
  obtenerProyecto,
} from '../data/db';
import { exportarProyecto } from '../data/respaldo';
import { fmtFecha, fmtPR } from '../domain/formato';
import type { Administracion, Proyecto } from '../domain/types';
import { entregarArchivo } from '../services/plataforma';
import { Campo, Icono, Pantalla, Texto, useAviso, useCarga } from './comunes';

function proyectoVacio(): Proyecto {
  const ahora = new Date().toISOString();
  return {
    id: nuevoId(), nombre: '', entidad: '', contrato: '', territorial: '', codigoVia: '', nombreVia: '', localizacion: '',
    administracion: '', levantadoPor: '', observaciones: '', creado: ahora, actualizado: ahora,
  };
}

export function EditarProyecto() {
  const { id } = useParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const [p, setP] = useState<Proyecto | null>(id ? null : proyectoVacio());
  useEffect(() => {
    if (id) void obtenerProyecto(id).then((x) => setP(x ?? proyectoVacio()));
  }, [id]);
  if (!p) return <Pantalla titulo="Proyecto" atras>{null}</Pantalla>;
  const set = <K extends keyof Proyecto>(k: K, v: Proyecto[K]) => setP({ ...p, [k]: v });
  const guardar = async () => {
    if (!p.nombre.trim()) {
      avisar('Escriba el nombre del proyecto.');
      return;
    }
    await guardarProyecto(p);
    if (id) nav(-1);
    else nav(`/proyecto/${p.id}`, { replace: true });
  };
  return (
    <Pantalla titulo={id ? 'Editar proyecto' : 'Nuevo proyecto'} atras acciones={<button className="icono-btn" data-testid="guardar" onClick={guardar}>Guardar</button>}>
      <div className="tarjeta">
        <h3>Identificación</h3>
        <Campo etiqueta="Nombre del proyecto"><Texto id="p-nombre" valor={p.nombre} alCambiar={(v) => set('nombre', v)} marcador="Inspección visual vía …" /></Campo>
        <Campo etiqueta="Entidad contratante"><Texto id="p-entidad" valor={p.entidad} alCambiar={(v) => set('entidad', v)} /></Campo>
        <div className="rejilla-2">
          <Campo etiqueta="Contrato No."><Texto id="p-contrato" valor={p.contrato} alCambiar={(v) => set('contrato', v)} marcador="860 de 2024" /></Campo>
          <Campo etiqueta="Territorial"><Texto id="p-territorial" valor={p.territorial} alCambiar={(v) => set('territorial', v)} /></Campo>
        </div>
      </div>
      <div className="tarjeta">
        <h3>Vía</h3>
        <Campo etiqueta="Nombre de la vía"><Texto id="p-via" valor={p.nombreVia} alCambiar={(v) => set('nombreVia', v)} marcador="Mocoa – Pitalito" /></Campo>
        <div className="rejilla-2">
          <Campo etiqueta="Código de la vía"><Texto id="p-codigo" valor={p.codigoVia} alCambiar={(v) => set('codigoVia', v)} marcador="4503" /></Campo>
          <Campo etiqueta="Administración">
            <select className="entrada" value={p.administracion} onChange={(e) => set('administracion', e.target.value as Administracion)}>
              <option value="">No aplica</option>
              <option value="concesion">Concesión</option>
              <option value="mtto">Mantenimiento integral</option>
              <option value="amv">A.M.V.</option>
            </select>
          </Campo>
        </div>
        <Campo etiqueta="Localización (municipio, departamento)"><Texto id="p-loc" valor={p.localizacion} alCambiar={(v) => set('localizacion', v)} /></Campo>
      </div>
      <div className="tarjeta">
        <h3>Levantamiento</h3>
        <Campo etiqueta="Levantado por"><Texto id="p-levanto" valor={p.levantadoPor} alCambiar={(v) => set('levantadoPor', v)} /></Campo>
        <Campo etiqueta="Observaciones generales"><Texto valor={p.observaciones} alCambiar={(v) => set('observaciones', v)} multilinea /></Campo>
      </div>
      <button className="btn primario bloque" onClick={guardar}>Guardar proyecto</button>
    </Pantalla>
  );
}

export function VistaProyecto() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const [ocupado, setOcupado] = useState(false);
  const { datos } = useCarga(async () => {
    const p = await obtenerProyecto(id);
    const sectores = await listarSectores(id);
    const conteos = await Promise.all(sectores.map(async (s) => (await listarDanos(s.id)).length));
    return { p, sectores: sectores.map((s, i) => ({ s, n: conteos[i] })) };
  }, [id]);
  if (!datos) return <Pantalla titulo="Proyecto" atras>{null}</Pantalla>;
  const { p, sectores } = datos;
  if (!p) return <Pantalla titulo="Proyecto" atras><div className="vacio">Proyecto no encontrado.</div></Pantalla>;

  const respaldar = async () => {
    setOcupado(true);
    try {
      const { blob, nombre } = await exportarProyecto(id);
      const r = await entregarArchivo(blob, nombre, 'Respaldo del proyecto');
      avisar(r.mensaje);
    } catch (e) {
      avisar(String((e as Error).message ?? e));
    } finally {
      setOcupado(false);
    }
  };
  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar el proyecto "${p.nombre}" con todos sus sectores, daños y fotografías? Esta acción no se puede deshacer.`)) return;
    await eliminarProyecto(id);
    nav('/', { replace: true });
  };

  return (
    <Pantalla
      titulo={p.nombre}
      subtitulo={[p.nombreVia, p.codigoVia].filter(Boolean).join(' · ')}
      atras={() => nav('/')}
      acciones={<button className="icono-btn" aria-label="Editar proyecto" onClick={() => nav(`/proyecto/${id}/editar`)}>{Icono.editar}</button>}
    >
      <div className="tarjeta">
        <h3>Datos del proyecto</h3>
        <div className="coords">
          <dt>Entidad</dt><dd>{p.entidad || '–'}</dd>
          <dt>Contrato</dt><dd>{p.contrato || '–'}</dd>
          <dt>Territorial</dt><dd>{p.territorial || '–'}</dd>
          <dt>Levantado por</dt><dd>{p.levantadoPor || '–'}</dd>
        </div>
      </div>

      <div className="fila entre" style={{ margin: '4px 2px 10px' }}>
        <h2 style={{ fontSize: 16 }}>Sectores</h2>
        <button className="btn chico" data-testid="nuevo-sector" onClick={() => nav(`/proyecto/${id}/sector/nuevo`)}>{Icono.mas} Sector</button>
      </div>
      {sectores.length === 0 ? (
        <div className="vacio">
          <strong>Sin sectores</strong>
          Agregue un sector de vía (PR inicial y final) para comenzar el levantamiento de daños.
        </div>
      ) : null}
      {sectores.map(({ s, n }) => (
        <button key={s.id} className="tarjeta tocable" onClick={() => nav(`/sector/${s.id}`)}>
          <h2>{s.nombre}</h2>
          <div className="meta">{fmtPR(s.prInicial)} a {fmtPR(s.prFinal)} · {n} {n === 1 ? 'daño' : 'daños'}</div>
          <div className="meta tenue">{fmtFecha(s.fecha)}{s.levantadoPor ? ` · ${s.levantadoPor}` : ''}</div>
        </button>
      ))}

      <div className="tarjeta">
        <h3>Informe y respaldo</h3>
        <div className="acciones">
          <button className="btn primario" data-testid="ir-informe" onClick={() => nav(`/informe/${id}`)}>{Icono.informe} Generar informe</button>
          <button className="btn" disabled={ocupado} onClick={respaldar}>{Icono.compartir} {ocupado ? 'Exportando…' : 'Respaldo .zip'}</button>
        </div>
        <span className="campo"><span className="ayuda">El respaldo incluye datos, fotografías y mapas; puede restaurarse en otro dispositivo desde la pantalla inicial.</span></span>
      </div>
      <button className="btn peligro bloque" onClick={eliminar}>{Icono.borrar} Eliminar proyecto</button>
    </Pantalla>
  );
}
