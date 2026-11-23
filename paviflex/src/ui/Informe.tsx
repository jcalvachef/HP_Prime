import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { eliminarBlob, guardarBlob, leerAjustes, modificarDano, listarDanos, listarSectores, nuevoId, obtenerProyecto } from '../data/db';
import type { Dano } from '../domain/types';
import { construirInforme } from '../report/construir';
import type { Informe } from '../report/modelo';
import { descargarMapa, impedimentoMapa, nombreProveedor } from '../services/mapa';
import { entregarArchivo, esNativo } from '../services/plataforma';
import { Icono, Pantalla, useAviso, useCarga } from './comunes';

export function PantallaInforme() {
  const { proyectoId = '' } = useParams();
  const avisar = useAviso();
  const [estado, setEstado] = useState<{ msg: string; fr: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advertencias, setAdvertencias] = useState<string[] | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const { datos, recargar } = useCarga(async () => {
    const proyecto = await obtenerProyecto(proyectoId);
    const ajustes = await leerAjustes();
    const sectores = await Promise.all((await listarSectores(proyectoId)).map(async (sector) => ({ sector, danos: await listarDanos(sector.id) })));
    return { proyecto, ajustes, sectores };
  }, [proyectoId]);
  if (!datos?.proyecto) return <Pantalla titulo="Informe" atras>{null}</Pantalla>;
  const { proyecto, ajustes, sectores } = datos;
  const todos = sectores.flatMap((s) => s.danos);
  const sinGps = todos.filter((d) => !d.gps).length;
  const sinMapa = todos.filter((d) => d.gps && !d.mapa);
  const sinFoto = todos.filter((d) => !d.foto).length;
  // Mapas descargados con un proveedor distinto al elegido ahora en Ajustes
  const deOtroProveedor = todos.filter((d) => d.gps && d.mapa && d.mapa.proveedor !== ajustes.proveedorMapa);
  const impedimento = impedimentoMapa(ajustes);
  const ocupado = estado != null;

  const descargarMapas = async (lista: Dano[]) => {
    setError(null);
    let hechos = 0;
    try {
      for (const d of lista) {
        setEstado({ msg: `Descargando mapa de la foto ${d.numero}`, fr: hechos / lista.length });
        const r = await descargarMapa(d.gps!.lat, d.gps!.lon, ajustes);
        const blobId = nuevoId();
        await guardarBlob(blobId, r.blob);
        await modificarDano(d.id, { mapa: { blobId, ...r.meta } });
        if (d.mapa) await eliminarBlob(d.mapa.blobId);
        hechos++;
      }
      avisar(`${hechos} mapas descargados.`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setEstado(null);
      recargar();
    }
  };

  const generar = async (formato: 'pdf' | 'docx') => {
    setError(null);
    setUltimo(null);
    setEstado({ msg: 'Preparando datos', fr: 0 });
    try {
      // Se releen los datos para incluir mapas recién descargados
      const frescos = await Promise.all(sectores.map(async ({ sector }) => ({ sector, danos: await listarDanos(sector.id) })));
      const inf: Informe = await construirInforme(
        { proyecto, ajustes, sectores: frescos },
        { alProgreso: (msg, fr) => setEstado({ msg, fr: fr * 0.85 }) },
      );
      setAdvertencias(inf.advertencias);
      setEstado({ msg: formato === 'pdf' ? 'Generando PDF' : 'Generando documento Word', fr: 0.9 });
      await new Promise((r) => setTimeout(r, 30));
      let blob: Blob;
      if (formato === 'pdf') blob = await (await import('../report/pdf')).generarPdf(inf);
      else blob = await (await import('../report/docx')).generarDocx(inf);
      const nombre = `${inf.nombreArchivo}.${formato}`;
      const r = await entregarArchivo(blob, nombre, inf.titulo);
      setUltimo(r.mensaje);
    } catch (e) {
      console.error(e);
      setError(`No se pudo generar el informe: ${String((e as Error).message ?? e)}`);
    } finally {
      setEstado(null);
    }
  };

  return (
    <Pantalla titulo="Informe" subtitulo={proyecto.nombre} atras>
      <div className="tarjeta">
        <h3>Contenido</h3>
        <p className="meta" style={{ lineHeight: 1.5, color: 'var(--tinta)' }}>
          El informe se arma sobre el rótulo e incluye, para cada sector: el formato de evaluación del pavimento flexible, el reporte de daños
          con la hoja de cálculo por tramos, las gráficas y una ficha de máximo media página carta por cada fotografía (foto, plano, coordenadas
          EPSG:9377, descripción y severidad).
        </p>
        <div className="cifras" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="cifra"><div className="v">{sectores.length}</div><div className="k">sectores</div></div>
          <div className="cifra"><div className="v">{todos.length}</div><div className="k">registros de daño</div></div>
          <div className="cifra"><div className="v">{todos.length - sinMapa.length - sinGps}</div><div className="k">con mapa base</div></div>
        </div>
      </div>

      {todos.length === 0 ? <div className="aviso">El proyecto aún no tiene daños registrados; el informe solo tendrá los formatos vacíos.</div> : null}
      {sinFoto || sinGps ? (
        <div className="aviso">
          {sinFoto ? <div>{sinFoto} registros sin fotografía.</div> : null}
          {sinGps ? <div>{sinGps} registros sin coordenadas.</div> : null}
        </div>
      ) : null}
      {sinMapa.length ? (
        <div className="aviso info">
          {sinMapa.length} registros tienen coordenadas pero no mapa base; en el informe llevarán un croquis con cuadrícula.
          {!impedimento ? (
            <button className="btn chico bloque" style={{ marginTop: 8 }} data-testid="mapas-pendientes" disabled={ocupado} onClick={() => descargarMapas(sinMapa)}>{Icono.mapa} Descargar los mapas pendientes ({nombreProveedor(ajustes)})</button>
          ) : (
            <div style={{ marginTop: 4 }}>{impedimento}</div>
          )}
        </div>
      ) : null}

      {deOtroProveedor.length && !impedimento ? (
        <div className="aviso info">
          {deOtroProveedor.length} planos se descargaron con otro mapa base. Puede dejarlos así o actualizarlos al proveedor elegido en Ajustes.
          <button className="btn chico bloque" style={{ marginTop: 8 }} data-testid="mapas-actualizar" disabled={ocupado} onClick={() => descargarMapas(deOtroProveedor)}>
            {Icono.mapa} Actualizar a {nombreProveedor(ajustes)}
          </button>
        </div>
      ) : null}

      <div className="tarjeta">
        <h3>Generar</h3>
        <div className="acciones">
          <button className="btn primario" data-testid="generar-pdf" disabled={ocupado} onClick={() => generar('pdf')}>{Icono.informe} PDF para imprimir</button>
          <button className="btn oscuro" data-testid="generar-docx" disabled={ocupado} onClick={() => generar('docx')}>{Icono.editar} Word editable</button>
        </div>
        {estado ? (
          <div style={{ marginTop: 12 }} data-testid="progreso">
            <div className="meta" style={{ marginBottom: 6 }}>{estado.msg}…</div>
            <div className="progreso"><div style={{ width: `${Math.round(estado.fr * 100)}%` }} /></div>
          </div>
        ) : null}
        {ultimo ? <div className="aviso info" style={{ marginTop: 12, marginBottom: 0 }} data-testid="resultado">{ultimo}{esNativo ? ' Use «Compartir» para imprimirlo o enviarlo.' : ''}</div> : null}
        {error ? <div className="aviso error" style={{ marginTop: 12, marginBottom: 0 }} data-testid="error">{error}</div> : null}
      </div>

      {advertencias?.length ? (
        <div className="aviso">
          <b>Datos por completar ({advertencias.length})</b>
          <ul>{advertencias.slice(0, 12).map((a, i) => <li key={i}>{a}</li>)}</ul>
          {advertencias.length > 12 ? <div>… y {advertencias.length - 12} más.</div> : null}
        </div>
      ) : null}
    </Pantalla>
  );
}
