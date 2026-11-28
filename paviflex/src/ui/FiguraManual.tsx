import { useState } from 'react';
import { NOMBRE_SEVERIDAD, SEVERIDADES, etiquetaUnidad, tipoDano } from '../domain/catalogo';
import { FIGURA_DE } from '../domain/figuras';
import { figuraDe } from '../services/manual';
import { COLOR_SEV } from './colores';
import { Hoja } from './comunes';

/** Figura del manual: fotografía de ejemplo junto al esquema de medición. Se amplía al tocarla. */
export function ImagenFigura({ codigo }: { codigo: string }) {
  const [amplia, setAmplia] = useState(false);
  const f = figuraDe(codigo);
  const t = tipoDano(codigo);
  if (!f) return null;
  return (
    <figure className="figura-manual">
      <div className={'lienzo' + (amplia ? ' amplia' : '')} onClick={() => setAmplia(!amplia)}>
        <img src={f.url} width={f.w} height={f.h} alt={`Figura ${f.num} del manual: fotografía y esquema de ${t?.nombre ?? codigo}`} data-testid="figura-manual" />
      </div>
      <figcaption>
        Figura {FIGURA_DE[codigo]} del manual · fotografía y esquema. {amplia ? 'Deslice para recorrerla; toque para reducir.' : 'Toque la figura para ampliarla.'}
      </figcaption>
    </figure>
  );
}

/**
 * Hoja de consulta de un tipo de daño con la figura del manual, para confirmar antes de elegirlo.
 * `variantes` son otras siglas de aspecto parecido entre las que se puede cambiar.
 */
export function HojaFigura(p: { codigo: string; variantes?: string[]; alElegir?: (codigo: string) => void; alCerrar: () => void }) {
  const [codigo, setCodigo] = useState(p.codigo);
  const t = tipoDano(codigo);
  if (!t) return null;
  const grupo = [p.codigo, ...(p.variantes ?? [])];
  return (
    <Hoja
      titulo={`${t.codigo} · ${t.nombre}`}
      alCerrar={p.alCerrar}
      pie={
        p.alElegir ? (
          <button className="btn primario bloque" data-testid="elegir-figura" onClick={() => p.alElegir!(codigo)}>
            Elegir {t.codigo} · {t.nombre}
          </button>
        ) : undefined
      }
    >
      <ImagenFigura codigo={codigo} />
      <p className="texto-manual">{t.definicion}</p>
      <p className="meta" style={{ marginBottom: 10 }}>Unidad de medida: {etiquetaUnidad(t.unidad)} · numeral {t.numeral} del manual</p>
      {t.severidades ? (
        <div className="criterios" style={{ marginBottom: 12, marginTop: 0 }}>
          {SEVERIDADES.map((s) => (
            <div className="criterio" key={s}>
              <span className="chip" style={{ background: COLOR_SEV[s].fondo, color: COLOR_SEV[s].texto }}>{NOMBRE_SEVERIDAD[s]}</span>
              <span>{t.severidades![s]}</span>
            </div>
          ))}
        </div>
      ) : null}
      {grupo.length > 1 ? (
        <>
          <div className="grupo" style={{ marginTop: 4 }}>Daños de aspecto parecido</div>
          <div className="variantes">
            {grupo.map((c) => (
              <button key={c} data-testid={`variante-${c}`} className={'sigla-btn' + (c === codigo ? ' activa' : '')} onClick={() => setCodigo(c)} title={tipoDano(c)?.nombre}>
                {c}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </Hoja>
  );
}
