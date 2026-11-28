import { useEffect, useMemo, useState } from 'react';
import { listarEjemplos, vaciarEjemplos } from '../data/db';
import { tipoDano } from '../domain/catalogo';
import { autoevaluar, conteoPorCodigo, type EjemploConocimiento } from '../domain/conocimiento';
import { fmtPct } from '../domain/formato';
import type { Dano } from '../domain/types';
import { exportarConocimiento, importarConocimiento, incorporar, registrosPorIncorporar } from '../services/conocimiento';
import { estadoVision, prepararVision, type EstadoVision } from '../services/vision';
import { Icono, Pantalla, useAviso } from './comunes';

const NOMBRE_MOTOR: Record<string, string> = { wasm: 'WebAssembly', webgl: 'WebGL (procesador gráfico)', cpu: 'JavaScript (lento)' };

/** Estado de lo que la aplicación ha aprendido de los daños clasificados, y su mantenimiento. */
export function PantallaConocimiento() {
  const avisar = useAviso();
  const [vision, setVision] = useState<EstadoVision>(estadoVision());
  const [ejemplos, setEjemplos] = useState<EjemploConocimiento[] | null>(null);
  const [pendientes, setPendientes] = useState<Dano[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const recargar = async () => {
    setEjemplos([...(await listarEjemplos())]);
    setPendientes(await registrosPorIncorporar());
  };
  useEffect(() => {
    void recargar();
    void prepararVision().then(() => setVision(estadoVision()));
  }, []);

  const evaluacion = useMemo(() => (ejemplos ? autoevaluar(ejemplos) : null), [ejemplos]);
  const conteo = useMemo(() => (ejemplos ? conteoPorCodigo(ejemplos) : []), [ejemplos]);

  const hacer = async (rotulo: string, tarea: () => Promise<string>) => {
    setOcupado(rotulo);
    try {
      avisar(await tarea());
    } catch (e) {
      avisar(String((e as Error).message ?? e));
    } finally {
      setOcupado(null);
      await recargar();
    }
  };
  const importar = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.dataset.testid = 'entrada-conocimiento';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return;
      void hacer('Importando…', async () => {
        const r = await importarConocimiento(f);
        return `${r.nuevos} ejemplos incorporados${r.repetidos ? ` (${r.repetidos} ya estaban)` : ''}.`;
      });
    };
    inp.click();
  };
  const vaciar = () => {
    if (!window.confirm('¿Borrar todo lo aprendido? Los registros de daño no se tocan, pero el motor empezará de cero.')) return;
    void hacer('Borrando…', async () => {
      await vaciarEjemplos();
      return 'Motor de conocimiento vaciado.';
    });
  };

  const n = ejemplos?.length ?? 0;
  return (
    <Pantalla titulo="Motor de conocimiento" subtitulo="Lo que la aplicación ha aprendido de sus registros" atras>
      <div className="tarjeta">
        <h3>Cómo aprende</h3>
        <p className="meta" style={{ lineHeight: 1.5, color: 'var(--tinta)' }}>
          Cada daño que usted clasifica, con su fotografía, queda como ejemplo. Al tomar una foto nueva, la aplicación busca los ejemplos más
          parecidos y propone su tipo. Aprende en el momento, dentro del teléfono y sin conexión; si corrige un tipo o borra un registro, lo
          aprendido se corrige con él.
        </p>
        <p className="meta" style={{ marginTop: 8 }} data-testid="estado-vision">
          Modelo de visión:{' '}
          {vision.fase === 'listo'
            ? `listo · ${NOMBRE_MOTOR[vision.motor ?? ''] ?? vision.motor}`
            : vision.fase === 'no-disponible'
              ? `no disponible en este dispositivo (${vision.error ?? 'sin detalle'})`
              : 'cargando…'}
        </p>
      </div>

      <div className="cifras">
        <div className="cifra"><div className="v" data-testid="total-ejemplos">{n}</div><div className="k">daños aprendidos</div></div>
        <div className="cifra"><div className="v">{conteo.length}</div><div className="k">tipos de daño distintos</div></div>
        <div className="cifra"><div className="v">{pendientes.length}</div><div className="k">registros por incorporar</div></div>
      </div>

      {pendientes.length ? (
        <div className="aviso info">
          Hay {pendientes.length} registros clasificados que aún no están en el motor (por ejemplo, de un respaldo restaurado o de una versión anterior).
          <button
            className="btn chico bloque"
            style={{ marginTop: 8 }}
            data-testid="incorporar"
            disabled={!!ocupado || vision.fase !== 'listo'}
            onClick={() => hacer('Analizando fotografías…', async () => `${await incorporar(pendientes, (h, t) => setOcupado(`Fotografía ${h} de ${t}…`))} registros incorporados.`)}
          >
            {ocupado ?? 'Incorporarlos ahora'}
          </button>
        </div>
      ) : null}

      <div className="tarjeta">
        <h3>Autoevaluación</h3>
        {evaluacion && evaluacion.evaluados >= 8 ? (
          <>
            <div className="cifras" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
              <div className="cifra"><div className="v" data-testid="acierto-sigla">{fmtPct(evaluacion.siglaPrimera / evaluacion.evaluados, 0)}</div><div className="k">la sigla correcta fue la primera sugerencia</div></div>
              <div className="cifra"><div className="v" data-testid="acierto-familia">{fmtPct(evaluacion.familiaEntreTres / evaluacion.evaluados, 0)}</div><div className="k">la familia correcta estuvo entre las tres</div></div>
            </div>
            <p className="meta">
              Medido sobre {evaluacion.evaluados} de sus propios registros: se oculta cada uno y se revisa qué habría sugerido el motor con los demás.
              Los tipos con un solo ejemplo no entran en la medición.
            </p>
          </>
        ) : (
          <p className="meta">
            Con al menos 8 registros de tipos repetidos, aquí aparecerá qué tan seguido acierta el motor, medido con sus propios datos
            {evaluacion?.evaluados ? ` (van ${evaluacion.evaluados})` : ''}.
          </p>
        )}
      </div>

      {conteo.length ? (
        <div className="tarjeta">
          <h3>Ejemplos por tipo de daño</h3>
          <div className="tabla-envoltura" style={{ marginBottom: 0 }}>
            <table className="datos">
              <thead><tr><th>Tipo de daño</th><th>Ejemplos</th></tr></thead>
              <tbody>
                {conteo.map((c) => (
                  <tr key={c.codigo}><td><b>{c.codigo}</b> · {tipoDano(c.codigo)?.nombre}</td><td>{c.n}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta" style={{ marginTop: 8 }}>Un tipo se reconoce mejor cuando tiene varios ejemplos; los que tienen uno o dos todavía son frágiles.</p>
        </div>
      ) : null}

      <div className="tarjeta">
        <h3>Compartir y mantener</h3>
        <div className="acciones">
          <button className="btn" data-testid="exportar-conocimiento" disabled={!!ocupado || !n} onClick={() => hacer('Exportando…', exportarConocimiento)}>{Icono.compartir} Exportar</button>
          <button className="btn" data-testid="importar-conocimiento" disabled={!!ocupado} onClick={importar}>{Icono.mas} Importar</button>
        </div>
        <span className="campo">
          <span className="ayuda">
            El archivo lleva lo aprendido (no las fotografías) y sirve para pasarlo a otro teléfono o sumar lo de otro inspector. Importar agrega
            ejemplos; no borra los que ya hay.
          </span>
        </span>
        <button className="btn peligro bloque" disabled={!!ocupado || !n} onClick={vaciar}>{Icono.borrar} Borrar todo lo aprendido</button>
      </div>
    </Pantalla>
  );
}
