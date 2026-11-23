/**
 * Medición sobre la fotografía: se marcan los extremos de la regla naranja de 1,00 m (escala)
 * y se trazan el largo y el ancho del daño. Una lupa ayuda a ubicar los puntos con el dedo.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { modificarDano, obtenerBlob, obtenerDano } from '../data/db';
import { fmtFijo, parseNum } from '../domain/formato';
import { detectarReglaNaranja, longitudPolilinea, pxPorMetro, resumenMedicion } from '../domain/regla';
import type { ClaseTrazo, Dano, Medicion, Pt } from '../domain/types';
import { COLOR_TRAZO } from '../services/fotoAnotada';
import { lienzo } from '../services/imagen';
import { Icono, useAviso } from './comunes';

type Modo = 'regla' | ClaseTrazo;
type Agarre = { tipo: 'regla'; cual: 'a' | 'b' } | { tipo: 'trazo'; clase: ClaseTrazo; i: number } | { tipo: 'nuevo' };

const RADIO_TOQUE = 30;
const LUPA = 132;

function redondear(v: number) {
  return Math.round(v * 100) / 100;
}

export function Medir() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const [d, setD] = useState<Dano | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [m, setM] = useState<Medicion>({ regla: null, longitudRegla: 1, trazos: [] });
  const [primerExtremo, setPrimerExtremo] = useState<Pt | null>(null);
  const [modo, setModo] = useState<Modo>('regla');
  const [caja, setCaja] = useState({ w: 0, h: 0 });
  const [lupa, setLupa] = useState<{ p: Pt; sx: number; sy: number } | null>(null);
  const [txtRegla, setTxtRegla] = useState('1,00');
  const escenario = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const lupaRef = useRef<HTMLCanvasElement>(null);
  const agarre = useRef<Agarre | null>(null);

  useEffect(() => {
    let creada: string | null = null;
    void (async () => {
      const x = await obtenerDano(id);
      if (!x?.foto) return nav(-1);
      setD(x);
      if (x.medicion) {
        setM(x.medicion);
        setTxtRegla(fmtFijo(x.medicion.longitudRegla, 2));
        if (x.medicion.regla) setModo('largo');
      }
      const b = await obtenerBlob(x.foto.blobId);
      if (b) {
        creada = URL.createObjectURL(b);
        setUrl(creada);
      }
    })();
    return () => {
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [id, nav]);

  useLayoutEffect(() => {
    const el = escenario.current;
    if (!el) return;
    const medir = () => setCaja({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [d]);

  const iw = d?.foto?.w ?? 1, ih = d?.foto?.h ?? 1;
  const k = Math.min(caja.w / iw, caja.h / ih) || 1;
  const ox = (caja.w - iw * k) / 2, oy = (caja.h - ih * k) / 2;
  const aPantalla = (p: Pt) => ({ x: ox + p.x * k, y: oy + p.y * k });
  const aImagen = (sx: number, sy: number): Pt => ({
    x: Math.max(0, Math.min(iw, (sx - ox) / k)),
    y: Math.max(0, Math.min(ih, (sy - oy) / k)),
  });

  const detectar = (silencioso: boolean) => {
    const img = imgRef.current;
    if (!img || !img.complete || !img.naturalWidth) return;
    const f = Math.min(1, 520 / Math.max(iw, ih));
    const c = lienzo(iw * f, ih * f);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const r = detectarReglaNaranja(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    if (r) {
      setM((x) => ({ ...x, regla: { a: { x: r.a.x / f, y: r.a.y / f }, b: { x: r.b.x / f, y: r.b.y / f } } }));
      setPrimerExtremo(null);
      avisar('Regla naranja detectada. Verifique que los extremos coincidan y ajústelos si es necesario.');
    } else if (!silencioso) {
      avisar('No se detectó la regla naranja. Marque sus dos extremos tocando la fotografía.');
    }
  };

  // Dibuja la lupa centrada en el punto de la imagen
  useEffect(() => {
    const c = lupaRef.current, img = imgRef.current;
    if (!c || !img || !lupa) return;
    const ctx = c.getContext('2d')!;
    const zoom = Math.max(2.5 * k, 1.2);
    const r = LUPA / 2 / zoom;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LUPA, LUPA);
    ctx.drawImage(img, lupa.p.x - r, lupa.p.y - r, 2 * r, 2 * r, 0, 0, LUPA, LUPA);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(LUPA / 2, LUPA / 2 - 16); ctx.lineTo(LUPA / 2, LUPA / 2 + 16);
    ctx.moveTo(LUPA / 2 - 16, LUPA / 2); ctx.lineTo(LUPA / 2 + 16, LUPA / 2);
    ctx.stroke();
    ctx.strokeStyle = modo === 'regla' ? COLOR_TRAZO.regla : COLOR_TRAZO[modo];
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }, [lupa, k, modo]);

  const trazoDe = (clase: ClaseTrazo) => m.trazos.find((t) => t.clase === clase);

  const buscarAgarre = (sx: number, sy: number): Agarre => {
    let mejor: { a: Agarre; dist: number } | null = null;
    const probar = (p: Pt, a: Agarre, preferido: boolean) => {
      const s = aPantalla(p);
      const dist = Math.hypot(s.x - sx, s.y - sy) - (preferido ? 6 : 0);
      if (dist <= RADIO_TOQUE && (!mejor || dist < mejor.dist)) mejor = { a, dist };
    };
    if (m.regla) {
      probar(m.regla.a, { tipo: 'regla', cual: 'a' }, modo === 'regla');
      probar(m.regla.b, { tipo: 'regla', cual: 'b' }, modo === 'regla');
    }
    for (const t of m.trazos) t.puntos.forEach((p, i) => probar(p, { tipo: 'trazo', clase: t.clase, i }, modo === t.clase));
    return (mejor as { a: Agarre } | null)?.a ?? { tipo: 'nuevo' };
  };

  const mover = (a: Agarre, p: Pt) => {
    if (a.tipo === 'regla') setM((x) => (x.regla ? { ...x, regla: { ...x.regla, [a.cual]: p } } : x));
    else if (a.tipo === 'trazo')
      setM((x) => ({ ...x, trazos: x.trazos.map((t) => (t.clase === a.clase ? { ...t, puntos: t.puntos.map((q, i) => (i === a.i ? p : q)) } : t)) }));
  };

  const agregar = (p: Pt) => {
    if (modo === 'regla') {
      if (m.regla) {
        // Mueve el extremo más cercano al punto tocado
        const da = Math.hypot(m.regla.a.x - p.x, m.regla.a.y - p.y), db = Math.hypot(m.regla.b.x - p.x, m.regla.b.y - p.y);
        mover({ tipo: 'regla', cual: da <= db ? 'a' : 'b' }, p);
      } else if (!primerExtremo) setPrimerExtremo(p);
      else {
        setM((x) => ({ ...x, regla: { a: primerExtremo, b: p } }));
        setPrimerExtremo(null);
      }
      return;
    }
    setM((x) => {
      const existe = x.trazos.some((t) => t.clase === modo);
      return {
        ...x,
        trazos: existe
          ? x.trazos.map((t) => (t.clase === modo ? { ...t, puntos: [...t.puntos, p] } : t))
          : [...x.trazos, { id: modo, clase: modo, puntos: [p] }],
      };
    });
  };

  const pos = (e: React.PointerEvent) => {
    const r = escenario.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const alBajar = (e: React.PointerEvent) => {
    if (!url) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { sx, sy } = pos(e);
    const a = buscarAgarre(sx, sy);
    agarre.current = a;
    if (a.tipo === 'regla') setModo('regla');
    if (a.tipo === 'trazo') setModo(a.clase);
    setLupa({ p: aImagen(sx, sy), sx, sy });
  };
  const alMover = (e: React.PointerEvent) => {
    const a = agarre.current;
    if (!a) return;
    const { sx, sy } = pos(e);
    const p = aImagen(sx, sy);
    if (a.tipo !== 'nuevo') mover(a, p);
    setLupa({ p, sx, sy });
  };
  const alSoltar = (e: React.PointerEvent) => {
    const a = agarre.current;
    agarre.current = null;
    setLupa(null);
    if (!a) return;
    const { sx, sy } = pos(e);
    if (a.tipo === 'nuevo') agregar(aImagen(sx, sy));
  };

  const deshacer = () => {
    if (modo === 'regla') {
      if (primerExtremo) setPrimerExtremo(null);
      else setM((x) => ({ ...x, regla: null }));
      return;
    }
    setM((x) => ({
      ...x,
      trazos: x.trazos.map((t) => (t.clase === modo ? { ...t, puntos: t.puntos.slice(0, -1) } : t)).filter((t) => t.puntos.length),
    }));
  };
  const borrar = () => {
    if (modo === 'regla') {
      setPrimerExtremo(null);
      setM((x) => ({ ...x, regla: null }));
    } else setM((x) => ({ ...x, trazos: x.trazos.filter((t) => t.clase !== modo) }));
  };

  const aplicar = async () => {
    if (!d) return;
    const limpio: Medicion = { ...m, trazos: m.trazos.filter((t) => t.puntos.length >= 2) };
    const r = resumenMedicion(limpio);
    // Cambio parcial: no toca la posición ni el mapa, que pueden estar llegando en este momento
    const cambios: Partial<Dano> = { medicion: limpio.regla || limpio.trazos.length ? limpio : null };
    if (r.largo != null) cambios.largo = redondear(r.largo);
    if (r.ancho != null) cambios.ancho = redondear(r.ancho);
    await modificarDano(d.id, cambios);
    if (limpio.trazos.length && !limpio.regla) avisar('Faltan los extremos de la regla: sin escala no se calculan las dimensiones.');
    nav(-1);
  };

  const ppm = pxPorMetro(m);
  const res = resumenMedicion(m);
  const tActual = modo === 'regla' ? null : trazoDe(modo);
  const guia =
    modo === 'regla'
      ? m.regla
        ? 'Arrastre los extremos hasta los bordes de la regla naranja. La lupa muestra el punto exacto.'
        : primerExtremo
          ? 'Ahora toque el otro extremo de la regla.'
          : 'Toque un extremo de la regla naranja de 1 m (o use «Detectar regla»).'
      : !ppm
        ? 'Primero marque la regla para tener escala. Puede ir trazando mientras tanto.'
        : !tActual
          ? `Toque el punto inicial del ${modo} del daño.`
          : tActual.puntos.length === 1
            ? 'Toque el punto final. Puede agregar más puntos para seguir una fisura curva.'
            : 'Arrastre los puntos para ajustar, o toque para agregar otro tramo.';

  const linea = (pts: Pt[]) => pts.map((p) => { const s = aPantalla(p); return `${s.x},${s.y}`; }).join(' ');

  return (
    <div className="medir">
      <header className="barra">
        <button className="icono-btn" aria-label="Cancelar" onClick={() => nav(-1)}>{Icono.atras}</button>
        <div className="titulos">
          <h1>Medir con la regla</h1>
          <div className="sub">{d ? `Foto ${d.numero}` : ''}</div>
        </div>
        <button className="icono-btn" data-testid="aplicar" onClick={aplicar}>Aplicar</button>
      </header>
      <div className="guia" data-testid="guia">{guia}</div>
      <div className="escenario" ref={escenario} data-testid="escenario" onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={() => { agarre.current = null; setLupa(null); }}>
        {url ? (
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            style={{ left: ox, top: oy, width: iw * k, height: ih * k }}
            onLoad={() => { if (!d?.medicion?.regla) detectar(true); }}
          />
        ) : null}
        <svg width={caja.w} height={caja.h} style={{ left: 0, top: 0 }}>
          {m.trazos.map((t) => (
            <g key={t.clase}>
              <polyline points={linea(t.puntos)} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={linea(t.puntos)} fill="none" stroke={COLOR_TRAZO[t.clase]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              {t.puntos.map((p, i) => { const s = aPantalla(p); return <circle key={i} cx={s.x} cy={s.y} r={modo === t.clase ? 9 : 6} fill="rgba(0,0,0,0.35)" stroke={COLOR_TRAZO[t.clase]} strokeWidth={2.5} />; })}
            </g>
          ))}
          {m.regla ? (
            <g>
              <polyline points={linea([m.regla.a, m.regla.b])} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={6} strokeLinecap="round" />
              <polyline points={linea([m.regla.a, m.regla.b])} fill="none" stroke={COLOR_TRAZO.regla} strokeWidth={3} strokeDasharray="10 7" strokeLinecap="round" />
              {[m.regla.a, m.regla.b].map((p, i) => { const s = aPantalla(p); return <circle key={i} cx={s.x} cy={s.y} r={modo === 'regla' ? 10 : 7} fill="#fff" stroke={COLOR_TRAZO.regla} strokeWidth={3} />; })}
            </g>
          ) : primerExtremo ? (
            (() => { const s = aPantalla(primerExtremo); return <circle cx={s.x} cy={s.y} r={10} fill="#fff" stroke={COLOR_TRAZO.regla} strokeWidth={3} />; })()
          ) : null}
        </svg>
        {lupa ? <canvas ref={lupaRef} className="lupa" width={LUPA} height={LUPA} style={lupa.sx < caja.w / 2 && lupa.sy < LUPA + 40 ? { right: 10 } : { left: 10 }} /> : null}
      </div>
      <div className="lectura" data-testid="lectura">
        <span><i style={{ background: COLOR_TRAZO.regla }} />Regla {m.regla ? `${Math.round(longitudPolilinea([m.regla.a, m.regla.b]))} px =` : 'sin marcar ·'}
          <input
            aria-label="Longitud real de la regla en metros"
            inputMode="decimal"
            value={txtRegla}
            onChange={(e) => { setTxtRegla(e.target.value); const v = parseNum(e.target.value); if (v && v > 0) setM((x) => ({ ...x, longitudRegla: v })); }}
            style={{ width: 46, background: '#0c0e10', color: '#fff', border: '1px solid #3a4046', borderRadius: 6, padding: '2px 4px', textAlign: 'right' }}
          /> m
        </span>
        <span><i style={{ background: COLOR_TRAZO.largo }} />Largo {res.largo != null ? `${fmtFijo(res.largo, 2)} m` : '–'}</span>
        <span><i style={{ background: COLOR_TRAZO.ancho }} />Ancho {res.ancho != null ? `${fmtFijo(res.ancho, 2)} m` : '–'}</span>
        {res.largo != null && res.ancho != null ? <span>Área {fmtFijo(res.largo * res.ancho, 2)} m²</span> : null}
      </div>
      <div className="modos">
        <button data-testid="modo-regla" className={modo === 'regla' ? 'activo' : ''} style={{ color: COLOR_TRAZO.regla }} onClick={() => setModo('regla')}>Regla 1 m</button>
        <button data-testid="modo-largo" className={modo === 'largo' ? 'activo' : ''} style={{ color: COLOR_TRAZO.largo }} onClick={() => setModo('largo')}>Largo</button>
        <button data-testid="modo-ancho" className={modo === 'ancho' ? 'activo' : ''} style={{ color: COLOR_TRAZO.ancho }} onClick={() => setModo('ancho')}>Ancho</button>
      </div>
      <div className="herr">
        {modo === 'regla' ? <button data-testid="detectar" onClick={() => detectar(false)}>Detectar regla</button> : null}
        <button onClick={deshacer} disabled={modo === 'regla' ? !m.regla && !primerExtremo : !tActual}>Deshacer punto</button>
        <button onClick={borrar} disabled={modo === 'regla' ? !m.regla && !primerExtremo : !tActual}>Borrar {modo === 'regla' ? 'regla' : modo}</button>
      </div>
    </div>
  );
}
