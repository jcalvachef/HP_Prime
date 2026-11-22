import { useNavigate, useParams } from 'react-router-dom';
import { CATEGORIAS, NOMBRE_SEVERIDAD, SEVERIDADES, TIPOS_DANO, etiquetaUnidad, tipoDano } from '../domain/catalogo';
import { COLOR_SEV } from './colores';
import { Pantalla } from './comunes';

export function Catalogo() {
  const nav = useNavigate();
  return (
    <Pantalla titulo="Manual de daños" subtitulo="INVIAS – Universidad Nacional, 2006" atras>
      <div className="aviso info">
        Definiciones, severidades y forma de medición tomadas del <b>Manual para la inspección visual de pavimentos flexibles</b> (Convenio 0587-03).
        Los daños en berma se registran agregando una «B» a la sigla, excepto CVB y SB.
      </div>
      {CATEGORIAS.map((c) => (
        <div className="tarjeta" key={c.id}>
          <h3>{c.nombre}</h3>
          {TIPOS_DANO.filter((t) => t.categoria === c.id).map((t) => (
            <button key={t.codigo} className="opcion" onClick={() => nav(`/catalogo/${t.codigo}`)}>
              <span className="sigla">{t.codigo}</span>
              <span>{t.nombre}</span>
              <span className="u">{etiquetaUnidad(t.unidad)}</span>
            </button>
          ))}
        </div>
      ))}
    </Pantalla>
  );
}

export function DetalleCatalogo() {
  const { codigo = '' } = useParams();
  const t = tipoDano(codigo);
  if (!t) return <Pantalla titulo="Manual de daños" atras><div className="vacio">Daño no encontrado.</div></Pantalla>;
  return (
    <Pantalla titulo={`${t.codigo} · ${t.nombre}`} subtitulo={`Numeral ${t.numeral} · unidad de medida: ${etiquetaUnidad(t.unidad)}`} atras>
      <div className="tarjeta manual">
        <h3>Definición</h3>
        <p>{t.definicion}</p>
        <h3>Causas</h3>
        <ul>{t.causas.map((c, i) => <li key={i}>{c}</li>)}</ul>
        <h3>Severidades{t.criterio ? ` · ${t.criterio.toLowerCase()}` : ''}</h3>
        {t.severidades ? (
          <div className="criterios" style={{ marginBottom: 12 }}>
            {SEVERIDADES.map((s) => (
              <div className="criterio" key={s}>
                <span className="chip" style={{ background: COLOR_SEV[s].fondo, color: COLOR_SEV[s].texto }}>{NOMBRE_SEVERIDAD[s]}</span>
                <span>{t.severidades![s]}</span>
              </div>
            ))}
          </div>
        ) : (
          <p>No tiene grados de severidad asociados.</p>
        )}
        <h3>Unidad de medición</h3>
        <p>{t.medicion}</p>
        {t.evolucion ? (
          <>
            <h3>Evolución probable</h3>
            <p>{t.evolucion}</p>
          </>
        ) : null}
      </div>
    </Pantalla>
  );
}
