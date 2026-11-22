import { useEffect } from 'react';
import { HashRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { App as AppNativa } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { esNativo } from './services/plataforma';
import { ProveedorAvisos } from './ui/comunes';
import { Proyectos } from './ui/Proyectos';
import { EditarProyecto, VistaProyecto } from './ui/Proyecto';
import { EditarSector, VistaSector } from './ui/Sector';
import { EditorDano } from './ui/DanoEditor';
import { Medir } from './ui/Medir';
import { Catalogo, DetalleCatalogo } from './ui/Catalogo';
import { PantallaAjustes } from './ui/Ajustes';
import { PantallaInforme } from './ui/Informe';

/** Botón "atrás" de Android: retrocede en la navegación; en la pantalla inicial cierra la app. */
function BotonAtras() {
  const nav = useNavigate();
  useEffect(() => {
    if (!esNativo) return;
    // Barra de estado con iconos claros sobre la barra oscura de la app
    void SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => undefined);
    const h = AppNativa.addListener('backButton', () => {
      if (window.location.hash === '#/' || window.location.hash === '') void AppNativa.exitApp();
      else nav(-1);
    });
    return () => {
      void h.then((x) => x.remove());
    };
  }, [nav]);
  return null;
}

export function App() {
  return (
    <ProveedorAvisos>
      <HashRouter>
        <BotonAtras />
        <Routes>
          <Route path="/" element={<Proyectos />} />
          <Route path="/proyecto/nuevo" element={<EditarProyecto />} />
          <Route path="/proyecto/:id" element={<VistaProyecto />} />
          <Route path="/proyecto/:id/editar" element={<EditarProyecto />} />
          <Route path="/proyecto/:proyectoId/sector/nuevo" element={<EditarSector />} />
          <Route path="/sector/:id" element={<VistaSector />} />
          <Route path="/sector/:id/editar" element={<EditarSector />} />
          <Route path="/dano/:id" element={<EditorDano />} />
          <Route path="/dano/:id/medir" element={<Medir />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/catalogo/:codigo" element={<DetalleCatalogo />} />
          <Route path="/ajustes" element={<PantallaAjustes />} />
          <Route path="/informe/:proyectoId" element={<PantallaInforme />} />
        </Routes>
      </HashRouter>
    </ProveedorAvisos>
  );
}
