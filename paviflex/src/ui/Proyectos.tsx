import { useNavigate } from 'react-router-dom';
import { contarDanosProyecto, listarProyectos, listarSectores } from '../data/db';
import { importarProyecto } from '../data/respaldo';
import { fmtFecha } from '../domain/formato';
import { Icono, Pantalla, useAviso, useCarga } from './comunes';

export function Proyectos() {
  const nav = useNavigate();
  const avisar = useAviso();
  const { datos, recargar } = useCarga(async () => {
    const ps = await listarProyectos();
    return Promise.all(
      ps.map(async (p) => ({ p, sectores: (await listarSectores(p.id)).length, danos: await contarDanosProyecto(p.id) })),
    );
  }, []);

  const restaurar = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.zip,application/zip';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const id = await importarProyecto(f);
        avisar('Respaldo restaurado como proyecto nuevo.');
        recargar();
        nav(`/proyecto/${id}`);
      } catch (e) {
        avisar(String((e as Error).message ?? e));
      }
    };
    inp.click();
  };

  return (
    <Pantalla
      titulo="PaviFlex"
      subtitulo="Inspección visual de pavimentos flexibles"
      acciones={
        <>
          <button className="icono-btn" aria-label="Motor de conocimiento" onClick={() => nav('/conocimiento')}>{Icono.aprender}</button>
          <button className="icono-btn" aria-label="Manual de daños" onClick={() => nav('/catalogo')}>{Icono.libro}</button>
          <button className="icono-btn" aria-label="Ajustes" onClick={() => nav('/ajustes')}>{Icono.ajustes}</button>
        </>
      }
    >
      {datos && datos.length === 0 ? (
        <div className="vacio">
          <strong>Aún no hay proyectos</strong>
          Cree un proyecto de inspección para registrar los sectores de vía, fotografiar los daños y generar el informe.
          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={restaurar}>Restaurar un respaldo (.zip)</button>
          </div>
        </div>
      ) : null}
      {datos?.map(({ p, sectores, danos }) => (
        <button key={p.id} className="tarjeta tocable" onClick={() => nav(`/proyecto/${p.id}`)}>
          <h2>{p.nombre || 'Proyecto sin nombre'}</h2>
          <div className="meta">{[p.nombreVia, p.codigoVia].filter(Boolean).join(' · ') || 'Vía sin definir'}</div>
          <div className="meta tenue">
            {sectores} {sectores === 1 ? 'sector' : 'sectores'} · {danos} {danos === 1 ? 'daño' : 'daños'} · actualizado {fmtFecha(p.actualizado)}
          </div>
        </button>
      ))}
      {datos && datos.length > 0 ? (
        <button className="btn bloque" onClick={restaurar}>Restaurar un respaldo (.zip)</button>
      ) : null}
      <button className="fab" data-testid="nuevo-proyecto" onClick={() => nav('/proyecto/nuevo')}>
        {Icono.mas} Nuevo proyecto
      </button>
    </Pantalla>
  );
}
