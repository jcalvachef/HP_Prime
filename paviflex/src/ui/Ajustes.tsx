import { useEffect, useState } from 'react';
import { guardarAjustes, leerAjustes } from '../data/db';
import type { Ajustes, TipoMapa } from '../domain/types';
import { descargarMapa } from '../services/mapa';
import { Campo, Pantalla, Texto, useAviso } from './comunes';

export function PantallaAjustes() {
  const avisar = useAviso();
  const [a, setA] = useState<Ajustes | null>(null);
  const [prueba, setPrueba] = useState<{ ok: boolean; msg: string; url?: string } | null>(null);
  const [probando, setProbando] = useState(false);
  useEffect(() => {
    void leerAjustes().then(setA);
  }, []);
  if (!a) return <Pantalla titulo="Ajustes" atras>{null}</Pantalla>;
  const set = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => {
    const n = { ...a, [k]: v };
    setA(n);
    void guardarAjustes(n);
  };
  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      // Punto de prueba: Mocoa, Putumayo
      const r = await descargarMapa(1.1492, -76.6464, a);
      setPrueba({ ok: true, msg: 'La clave funciona: mapa descargado correctamente.', url: URL.createObjectURL(r.blob) });
    } catch (e) {
      setPrueba({ ok: false, msg: String((e as Error).message ?? e) });
    } finally {
      setProbando(false);
    }
  };
  return (
    <Pantalla titulo="Ajustes" atras>
      <div className="tarjeta">
        <h3>Google Maps</h3>
        <Campo
          etiqueta="Clave de API (Maps Static API)"
          ayuda="Se usa para descargar la vista en planta de cada daño con fondo Google Maps. Cree la clave en Google Cloud Console, habilite «Maps Static API» y active la facturación del proyecto. La clave se guarda solo en este dispositivo."
        >
          <Texto id="a-clave" valor={a.claveGoogleMaps} alCambiar={(v) => set('claveGoogleMaps', v.trim())} marcador="AIza…" />
        </Campo>
        <div className="rejilla-2">
          <Campo etiqueta="Tipo de mapa">
            <select className="entrada" value={a.tipoMapa} onChange={(e) => set('tipoMapa', e.target.value as TipoMapa)}>
              <option value="hybrid">Híbrido (satélite + vías)</option>
              <option value="satellite">Satélite</option>
              <option value="roadmap">Mapa de vías</option>
            </select>
          </Campo>
          <Campo etiqueta="Zoom" ayuda="19 ≈ 60 m de ancho">
            <select className="entrada" value={a.zoomMapa} onChange={(e) => set('zoomMapa', Number(e.target.value))}>
              {[16, 17, 18, 19, 20, 21].map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Campo>
        </div>
        <button className="btn bloque" disabled={probando || !a.claveGoogleMaps} onClick={probar}>{probando ? 'Probando…' : 'Probar la clave'}</button>
        {prueba ? (
          <div className={'aviso ' + (prueba.ok ? 'info' : 'error')} style={{ marginTop: 10 }}>
            {prueba.msg}
            {prueba.url ? <img className="mapa-img" style={{ marginTop: 8 }} src={prueba.url} alt="Mapa de prueba" /> : null}
          </div>
        ) : null}
      </div>
      <div className="tarjeta">
        <h3>Portada del informe</h3>
        <Campo etiqueta="Consultor"><Texto valor={a.consultorNombre} alCambiar={(v) => set('consultorNombre', v)} /></Campo>
        <Campo etiqueta="Títulos profesionales" ayuda="Una línea por título, como en el rótulo.">
          <Texto valor={a.consultorTitulos} alCambiar={(v) => set('consultorTitulos', v)} multilinea filas={4} />
        </Campo>
        <Campo etiqueta="Ciudad del informe"><Texto valor={a.ciudadInforme} alCambiar={(v) => set('ciudadInforme', v)} /></Campo>
        <Campo etiqueta="Pie de página del rótulo (PDF)" ayuda="Datos de contacto que aparecen abajo a la derecha, como en la plantilla Word del rótulo.">
          <Texto valor={a.pieRotulo} alCambiar={(v) => set('pieRotulo', v)} multilinea filas={4} />
        </Campo>
      </div>
      <div className="tarjeta">
        <h3>Acerca de</h3>
        <p className="meta" style={{ lineHeight: 1.5 }}>
          PaviFlex 1.0 · Metodología: Manual para la inspección visual de pavimentos flexibles (INVIAS – Universidad Nacional de Colombia, 2006).
          Coordenadas en MAGNA-SIRGAS / Origen-Nacional (EPSG:9377). Los datos se almacenan en este dispositivo; use el respaldo .zip de cada proyecto para conservarlos.
        </p>
      </div>
      <button className="btn bloque" onClick={() => avisar('Ajustes guardados.')}>Listo</button>
    </Pantalla>
  );
}
