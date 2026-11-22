import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerBlob } from '../data/db';
import { NOMBRE_SEVERIDAD } from '../domain/catalogo';
import type { Severidad } from '../domain/types';
import { COLOR_SEV } from './colores';

// ── Iconos (trazo simple) ──
const ic = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
export const Icono = {
  atras: ic('M15 5l-7 7 7 7'),
  mas: ic('M12 5v14M5 12h14'),
  camara: ic('M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z'),
  galeria: ic('M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4'),
  gps: ic('M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.800 7 11 7 11zM12 12.500a2.500 2.500 0 100-5 2.500 2.500 0 000 5z'),
  regla: ic('M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2'),
  ajustes: ic('M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4'),
  libro: ic('M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11'),
  informe: ic('M7 3h8l4 4v14H7zM14 3v5h5M10 13h6M10 17h6'),
  borrar: ic('M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'),
  editar: ic('M4 20h4L19 9l-4-4L4 16zM14 6l4 4'),
  mapa: ic('M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14'),
  compartir: ic('M12 15V4M8 8l4-4 4 4M5 13v6h14v-6'),
  ok: ic('M5 12l5 5 9-10'),
};

// ── Estructura de pantalla ──
export function Pantalla(p: {
  titulo: string;
  subtitulo?: string;
  atras?: boolean | (() => void);
  acciones?: ReactNode;
  children: ReactNode;
  sinRelleno?: boolean;
  bajoBarra?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="pantalla">
      <header className="barra">
        {p.atras ? (
          <button className="icono-btn" aria-label="Volver" onClick={() => (typeof p.atras === 'function' ? p.atras() : nav(-1))}>
            {Icono.atras}
          </button>
        ) : (
          <span style={{ width: 8 }} />
        )}
        <div className="titulos">
          <h1>{p.titulo}</h1>
          {p.subtitulo ? <div className="sub">{p.subtitulo}</div> : null}
        </div>
        {p.acciones}
      </header>
      {p.bajoBarra}
      <main className={'contenido' + (p.sinRelleno ? ' sin-relleno' : '')}>
        <div className="ancho-max">{p.children}</div>
      </main>
    </div>
  );
}

// ── Formularios ──
export function Campo(p: { etiqueta: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <label className="campo">
      <span className="etq">{p.etiqueta}</span>
      {p.children}
      {p.ayuda ? <span className="ayuda">{p.ayuda}</span> : null}
    </label>
  );
}

export function Texto(p: { valor: string; alCambiar: (v: string) => void; marcador?: string; multilinea?: boolean; id?: string; filas?: number }) {
  return p.multilinea ? (
    <textarea className="entrada" data-testid={p.id} rows={p.filas ?? 3} value={p.valor} placeholder={p.marcador} onChange={(e) => p.alCambiar(e.target.value)} />
  ) : (
    <input className="entrada" data-testid={p.id} value={p.valor} placeholder={p.marcador} onChange={(e) => p.alCambiar(e.target.value)} />
  );
}

/**
 * Entrada numérica o con formato propio: el usuario escribe libremente y el valor se
 * interpreta al salir del campo. `analizar` devuelve undefined si el texto no es válido.
 */
export function EntradaValor<T>(p: {
  valor: T;
  formatear: (v: T) => string;
  analizar: (texto: string) => T | undefined;
  alCambiar: (v: T) => void;
  marcador?: string;
  teclado?: 'decimal' | 'numeric' | 'text';
  id?: string;
}) {
  const [texto, setTexto] = useState(() => p.formatear(p.valor));
  const [invalido, setInvalido] = useState(false);
  const enfocado = useRef(false);
  const fmt = p.formatear(p.valor);
  useEffect(() => {
    if (!enfocado.current) setTexto(fmt);
  }, [fmt]);
  return (
    <input
      className={'entrada' + (invalido ? ' invalida' : '')}
      data-testid={p.id}
      inputMode={p.teclado ?? 'decimal'}
      value={texto}
      placeholder={p.marcador}
      onFocus={() => (enfocado.current = true)}
      onChange={(e) => {
        setTexto(e.target.value);
        const v = p.analizar(e.target.value);
        setInvalido(v === undefined);
        if (v !== undefined) p.alCambiar(v);
      }}
      onBlur={() => {
        enfocado.current = false;
        const v = p.analizar(texto);
        if (v === undefined) {
          setInvalido(false);
          setTexto(p.formatear(p.valor));
        } else setTexto(p.formatear(v));
      }}
    />
  );
}

// ── Avisos breves ──
const CtxAviso = createContext<(m: string) => void>(() => undefined);
export function ProveedorAvisos(p: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const reloj = useRef<number | undefined>(undefined);
  const avisar = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setMsg(null), 3800);
  }, []);
  return (
    <CtxAviso.Provider value={avisar}>
      {p.children}
      {msg ? <div className="tostada" role="status">{msg}</div> : null}
    </CtxAviso.Provider>
  );
}
export const useAviso = () => useContext(CtxAviso);

// ── Datos asíncronos ──
export function useCarga<T>(cargar: () => Promise<T>, deps: unknown[]): { datos: T | undefined; recargar: () => void; error: string | null } {
  const [datos, setDatos] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    cargar()
      .then((d) => vivo && (setDatos(d), setError(null)))
      .catch((e) => vivo && setError(String(e?.message ?? e)));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { datos, recargar: () => setN((x) => x + 1), error };
}

/** URL de objeto para un binario almacenado; se libera al desmontar. */
export function useUrlBlob(blobId: string | null | undefined, version: unknown = 0): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    let creada: string | null = null;
    if (!blobId) {
      setUrl(null);
      return;
    }
    void obtenerBlob(blobId).then((b) => {
      if (!vivo || !b) return;
      creada = URL.createObjectURL(b);
      setUrl(creada);
    });
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [blobId, version]);
  return url;
}

export function Miniatura(p: { blobId?: string | null }) {
  const url = useUrlBlob(p.blobId);
  return url ? <img className="mini" src={url} alt="" /> : <div className="mini">Sin foto</div>;
}

export function ChipSeveridad(p: { sev: Severidad | null; sinGrado?: boolean }) {
  if (p.sinGrado) return <span className="chip contorno">Sin grado</span>;
  if (!p.sev) return <span className="chip contorno">Severidad sin asignar</span>;
  const c = COLOR_SEV[p.sev];
  return (
    <span className="chip" style={{ background: c.fondo, color: c.texto }}>
      {NOMBRE_SEVERIDAD[p.sev]}
    </span>
  );
}

export function Hoja(p: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  return (
    <div className="hoja-fondo" onClick={p.alCerrar}>
      <div className="hoja" role="dialog" aria-label={p.titulo} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{p.titulo}</h2>
          <button className="btn chico" onClick={p.alCerrar}>Cerrar</button>
        </header>
        <div className="cuerpo">{p.children}</div>
      </div>
    </div>
  );
}
