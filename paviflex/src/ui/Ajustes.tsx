import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { guardarAjustes, leerAjustes } from '../data/db';
import type { Ajustes, TipoMapa } from '../domain/types';
import { ID_GOOGLE, ID_NINGUNO, ID_PERSONALIZADO, PROVEEDORES, anchoVistaMetros } from '../domain/teselas';
import { descargarMapa, impedimentoMapa, MAPA_W } from '../services/mapa';
import { Campo, Pantalla, Texto, useAviso } from './comunes';

export function PantallaAjustes() {
  const avisar = useAviso();
  const nav = useNavigate();
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
  const impedimento = impedimentoMapa(a);
  const prov = PROVEEDORES.find((p) => p.id === a.proveedorMapa);
  const descripcion = prov
    ? `${prov.descripcion} Crédito: ${prov.atribucion}.`
    : a.proveedorMapa === ID_NINGUNO
      ? 'No se descarga ningún mapa: el plano de cada daño es un croquis con cuadrícula EPSG:9377.'
      : a.proveedorMapa === ID_GOOGLE
        ? 'Opcional. Google solo permite usar sus mapas con una clave de API propia.'
        : 'Cualquier servicio de teselas XYZ, por ejemplo uno institucional o propio.';
  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      // Punto de prueba: Mocoa, Putumayo
      const r = await descargarMapa(1.1492, -76.6464, a);
      setPrueba({ ok: true, msg: 'Mapa base descargado correctamente (vista de prueba en Mocoa, Putumayo).', url: URL.createObjectURL(r.blob) });
    } catch (e) {
      setPrueba({ ok: false, msg: String((e as Error).message ?? e) });
    } finally {
      setProbando(false);
    }
  };
  return (
    <Pantalla titulo="Ajustes" atras>
      <div className="tarjeta">
        <h3>Mapa base del plano</h3>
        <Campo etiqueta="Proveedor" ayuda={descripcion}>
          <select className="entrada" data-testid="a-proveedor" value={a.proveedorMapa} onChange={(e) => { setPrueba(null); set('proveedorMapa', e.target.value); }}>
            {PROVEEDORES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            <option value={ID_PERSONALIZADO}>Servicio de teselas propio (XYZ)</option>
            <option value={ID_GOOGLE}>Google Maps (requiere clave de API)</option>
            <option value={ID_NINGUNO}>Sin mapa base (solo croquis)</option>
          </select>
        </Campo>
        {a.proveedorMapa === ID_PERSONALIZADO ? (
          <>
            <Campo etiqueta="Plantilla de URL" ayuda="Servicio de teselas XYZ en Web Mercator, con {z}, {x} e {y} (y {s} si usa subdominios a, b, c). Use solo servicios cuyas condiciones permitan este uso.">
              <Texto id="a-plantilla" valor={a.plantillaXYZ} alCambiar={(v) => set('plantillaXYZ', v.trim())} marcador="https://servidor/teselas/{z}/{x}/{y}.png" />
            </Campo>
            <Campo etiqueta="Atribución" ayuda="Crédito que exige el proveedor; se imprime sobre el mapa.">
              <Texto valor={a.atribucionXYZ} alCambiar={(v) => set('atribucionXYZ', v)} marcador="© Entidad" />
            </Campo>
          </>
        ) : null}
        {a.proveedorMapa === ID_GOOGLE ? (
          <>
            <Campo
              etiqueta="Clave de API (Maps Static API)"
              ayuda="Cree la clave en Google Cloud Console, habilite «Maps Static API» y active la facturación del proyecto. La clave se guarda solo en este dispositivo."
            >
              <Texto id="a-clave" valor={a.claveGoogleMaps} alCambiar={(v) => set('claveGoogleMaps', v.trim())} marcador="AIza…" />
            </Campo>
            <Campo etiqueta="Tipo de mapa">
              <select className="entrada" value={a.tipoMapa} onChange={(e) => set('tipoMapa', e.target.value as TipoMapa)}>
                <option value="hybrid">Híbrido (satélite + vías)</option>
                <option value="satellite">Satélite</option>
                <option value="roadmap">Mapa de vías</option>
              </select>
            </Campo>
          </>
        ) : null}
        {a.proveedorMapa !== ID_NINGUNO ? (
          <>
            <Campo etiqueta="Zoom de la vista" ayuda="Ancho aproximado del terreno que abarca el plano de cada daño.">
              <select className="entrada" data-testid="a-zoom" value={a.zoomMapa} onChange={(e) => set('zoomMapa', Number(e.target.value))}>
                {[16, 17, 18, 19, 20].map((z) => <option key={z} value={z}>{z} · unos {Math.round(anchoVistaMetros(4, z, MAPA_W) / 10) * 10} m de ancho</option>)}
              </select>
            </Campo>
            <button className="btn bloque" data-testid="probar-mapa" disabled={probando || !!impedimento} onClick={probar}>{probando ? 'Descargando…' : 'Probar el mapa base'}</button>
            {impedimento ? <div className="aviso" style={{ marginTop: 10, marginBottom: 0 }}>{impedimento}</div> : null}
          </>
        ) : null}
        {prueba ? (
          <div className={'aviso ' + (prueba.ok ? 'info' : 'error')} style={{ marginTop: 10, marginBottom: 0 }} data-testid="prueba-mapa">
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
        <h3>Motor de conocimiento</h3>
        <p className="meta" style={{ lineHeight: 1.5, marginBottom: 10 }}>
          La aplicación aprende de los daños que usted clasifica para sugerir el tipo en las fotos siguientes.
        </p>
        <button className="btn bloque" onClick={() => nav('/conocimiento')}>Ver lo aprendido</button>
      </div>
      <div className="tarjeta">
        <h3>Acerca de</h3>
        <p className="meta" style={{ lineHeight: 1.5 }}>
          PaviFlex 1.3 · Metodología: Manual para la inspección visual de pavimentos flexibles (INVIAS – Universidad Nacional de Colombia, 2006).
          Coordenadas en MAGNA-SIRGAS / Origen-Nacional (EPSG:9377). Los mapas base pertenecen a sus proveedores y se usan con su atribución. Los datos se almacenan en este dispositivo; use el respaldo .zip de cada proyecto para conservarlos.
        </p>
      </div>
      <button className="btn bloque" onClick={() => avisar('Ajustes guardados.')}>Listo</button>
    </Pantalla>
  );
}
