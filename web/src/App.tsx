import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { PackagingModel, CardboardProfile, DielineResult } from './engine/types';
import { STANDARD_PROFILES } from './engine/types';
import { MODELS, getModelById, CATALOG } from './engine/models';
import { fetchAndParseSvgDieline, getLoadedSvgDieline } from './engine/svgDielineParser';
import { exportToDXF, exportToSVG } from './engine/dxfExporter';
import type { HingeControlInfo } from './engine/foldingEngine';
import type { SavedProject } from './lib/supabaseClient';
import {
  getSavedProjects,
  saveProject,
  deleteProject,
  isSupabaseConfigured,
} from './lib/supabaseClient';

import confetti from 'canvas-confetti';

import type { ActiveTab } from './components/Header';
import { Header } from './components/Header';
import { LeftSidebar } from './components/LeftSidebar';
import { CadViewer2D } from './components/CadViewer2D';
import { FoldingViewer3D } from './components/FoldingViewer3D';
import { ImpositionView } from './components/ImpositionView';
import { SavedProjectsModal } from './components/SavedProjectsModal';
import { CatalogModal } from './components/CatalogModal';
import { IllustratorPluginModal } from './components/IllustratorPluginModal';
import { ImportCadModal } from './components/ImportCadModal';
import { CadStatusBar } from './components/CadStatusBar';
import {
  IllustratorBridgeClient,
  type BridgeStatus,
} from './integrations/illustrator/IllustratorBridgeClient';
import { createProjectExchangePackage } from './integrations/illustrator/projectExchange';
import { generateIllustratorJsx } from './integrations/illustrator/jsxGenerator';
import { downloadHtml3DFile } from './engine/export/Html3DExporter';

export const App: React.FC = () => {
  // 1. Estados Centrais
  const [currentModel, setCurrentModel] = useState<PackagingModel>(MODELS[0]);
  const [selectedProfile, setSelectedProfile] = useState<CardboardProfile>(STANDARD_PROFILES[0]); // Papel Duplex/Triplex
  const [params, setParams] = useState<Record<string, number>>(() => ({
    ...MODELS[0].defaultParams,
    Ep: STANDARD_PROFILES[0].thickness,
  }));
  const [activeTab, setActiveTab] = useState<ActiveTab>('2d');

  // Estados da Integração Oficial Adobe Illustrator 2025
  const [artworkTextureUri, setArtworkTextureUri] = useState<string | null>(null);
  const [outerArtworkTextureUri, setOuterArtworkTextureUri] = useState<string | null>(null);
  const [innerArtworkTextureUri, setInnerArtworkTextureUri] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    bridgeOnline: false,
    illustratorDetected: false,
  });
  const [isOpeningIllustrator, setIsOpeningIllustrator] = useState(false);

  // Estados do Inspetor de Dobras das Abas (ArtiosCAD / Prinect) integrado ao painel esquerdo
  const [customAngles, setCustomAngles] = useState<Record<string, number>>({});
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [hingeList, setHingeList] = useState<HingeControlInfo[]>([]);

  // Estado do Painel Ativo na Barra Lateral Esquerda ('params', 'folds' ou null quando recolhida)
  const [sidebarPanel, setSidebarPanel] = useState<'params' | 'folds' | null>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? null : 'params'
  );

  // Handlers para controle individual de ângulos de dobra (em graus)
  const handleAngleChange = (panelId: string, angleDeg: number) => {
    setCustomAngles((prev) => ({
      ...prev,
      [panelId]: angleDeg,
    }));
  };

  const handleResetAngle = (panelId: string) => {
    setCustomAngles((prev) => {
      const next = { ...prev };
      delete next[panelId];
      return next;
    });
  };

  const handleResetAllAngles = () => {
    setCustomAngles({});
  };

  const handleOpenFoldInspector = () => {
    setSidebarPanel((prev) => (prev === 'folds' ? null : 'folds'));
  };

  // Estados de Visualização & Viewport CAD
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [cursorMm, setCursorMm] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(1.0);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleViewportUpdate = useCallback((info: { cursorMm: { x: number; y: number }; zoom: number }) => {
    setCursorMm((prev) => (prev.x === info.cursorMm.x && prev.y === info.cursorMm.y ? prev : info.cursorMm));
    setZoomLevel((prev) => (Math.abs(prev - info.zoom) < 0.001 ? prev : info.zoom));
  }, []);

  // 2. Catálogo & Projetos Salvos
  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState<boolean>(false);
  const [isIllustratorPluginModalOpen, setIsIllustratorPluginModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  const handleImportSuccess = useCallback(
    (model: PackagingModel, dielineRes: DielineResult) => {
      setCurrentModel(model);
      setCustomAngles({});
      setSelectedPanelId(null);
      setHingeList([]);
      setParams({
        L: Math.round(dielineRes.bounds.width) || 300,
        B: Math.round(dielineRes.bounds.height) || 200,
        H: 100,
        Ep: selectedProfile.thickness,
      });
      setActiveTab('2d');
    },
    [selectedProfile.thickness]
  );

  useEffect(() => {
    getSavedProjects().then(setSavedProjects);
  }, []);

  // Atalho de teclado CAD (Ctrl+K / Cmd+K para abrir a biblioteca de modelos)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCatalogOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Monitora a conexão com o Adobe Illustrator e escuta sincronização de arte
  useEffect(() => {
    const client = IllustratorBridgeClient.getInstance();
    client.checkStatus().then(setBridgeStatus);

    const unsubscribe = client.addListener((event) => {
      if (event.type === 'ARTWORK_UPDATED') {
        const outerUri =
          event.data?.outerArtworkDataUri ||
          event.data?.textureDataUri ||
          (typeof event.data === 'string' ? event.data : null);
        const innerUri = event.data?.innerArtworkDataUri || null;

        if (outerUri) {
          setArtworkTextureUri(outerUri);
          setOuterArtworkTextureUri(outerUri);
        }
        if (innerUri) {
          setInnerArtworkTextureUri(innerUri);
        }

        if (outerUri || innerUri) {
          try {
            confetti({ particleCount: 30, spread: 50, origin: { y: 0.2 } });
          } catch {}
        }
      } else if (event.type === 'STATUS_CHANGED') {
        if (event.data) setBridgeStatus(event.data);
      }
    });

    return () => unsubscribe();
  }, []);

  // Quando troca o modelo, redefine os parâmetros para os padrões dele
  const handleSelectModel = useCallback((model: PackagingModel) => {
    setCurrentModel(model);
    setCustomAngles({});
    setSelectedPanelId(null);
    setHingeList([]);

    const cached = getLoadedSvgDieline(model.id);
    const initialL = cached ? Math.round(cached.bounds.width) : (model.defaultParams?.L || 300);
    const initialB = cached ? Math.round(cached.bounds.height) : (model.defaultParams?.B || 200);

    setParams({
      L: initialL,
      B: initialB,
      H: model.defaultParams?.H || 150,
      M: model.defaultParams?.M || 35,
      Ec: model.defaultParams?.Ec || 6,
      Cut: model.defaultParams?.Cut ?? 1,
      ...model.defaultParams,
      Ep: selectedProfile.thickness,
      ...(cached ? { L: initialL, B: initialB } : {}),
    });

    // Carregamento sob demanda se for modelo baseado em SVG (EngView)
    const catalogItem = CATALOG.find((c) => c.id === model.id);
    if (catalogItem?.svgDieline && !cached) {
      fetchAndParseSvgDieline(catalogItem.svgDieline, model.id)
        .then((loaded) => {
          setParams((prev) => ({
            ...prev,
            L: Math.round(loaded.bounds.width),
            B: Math.round(loaded.bounds.height),
          }));
        })
        .catch((err: any) => {
          console.error('[EngView] Erro ao carregar SVG:', err);
        });
    }
  }, [selectedProfile.thickness]);

  // Carrega SVG inicial se o modelo ativo for do EngView
  useEffect(() => {
    const catalogItem = CATALOG.find((c) => c.id === currentModel.id);
    if (catalogItem?.svgDieline && !getLoadedSvgDieline(currentModel.id)) {
      fetchAndParseSvgDieline(catalogItem.svgDieline, currentModel.id)
        .then((loaded) => {
          setParams((prev) => ({
            ...prev,
            L: Math.round(loaded.bounds.width),
            B: Math.round(loaded.bounds.height),
          }));
        })
        .catch((err: any) => {
          console.error('[EngView] Erro ao carregar SVG inicial:', err);
        });
    }
  }, [currentModel.id]);

  useEffect(() => {
    (window as any).__PRIMACOR_SET_MODEL_ID__ = (id: string) => handleSelectModel(getModelById(id));
    (window as any).__PRIMACOR_SET_TAB__ = (tab: ActiveTab) => setActiveTab(tab);
  }, [handleSelectModel]);

  // Atualização em tempo real de um parâmetro dimensional
  const handleParamChange = (key: string, value: number) => {
    setParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Cálculo da Faca 2D em tempo real com proteção estrita
  const dieline = useMemo(() => {
    try {
      return currentModel.calculate(params);
    } catch (err: any) {
      return {
        segments: [],
        arcs: [],
        dimensions: [],
        bounds: { minX: -150, minY: -100, maxX: 150, maxY: 100, width: 300, height: 200 },
        error: err?.message || 'Erro ao calcular geometria',
      };
    }
  }, [currentModel, params]);

  // Exportadores
  const handleExportDXF = () => {
    const filename = `${currentModel.code}_${params.L}x${params.B}x${params.H}.dxf`;
    exportToDXF(dieline, filename);
  };

  const handleExportSVG = () => {
    const filename = `${currentModel.code}_${params.L}x${params.B}x${params.H}.svg`;
    exportToSVG(dieline, filename);
  };

  // Integração Oficial Adobe Illustrator
  const handleOpenInIllustrator = async () => {
    setIsOpeningIllustrator(true);
    try {
      const exchangePkg = createProjectExchangePackage(
        currentModel,
        params,
        selectedProfile,
        dieline
      );
      const client = IllustratorBridgeClient.getInstance();
      const res = await client.openInIllustrator(exchangePkg);
      if (res.success) {
        confetti({ particleCount: 35, spread: 45, origin: { y: 0.1 } });
      } else {
        // Se a ponte estiver offline, abre o modal explicativo
        // SEM BAIXAR NENHUM ARQUIVO .JSX AUTOMATICAMENTE
        setIsIllustratorPluginModalOpen(true);
      }
    } catch (e: any) {
      console.warn('Falha na comunicação com Illustrator:', e);
      setIsIllustratorPluginModalOpen(true);
    } finally {
      setIsOpeningIllustrator(false);
    }
  };

  const handleExportIllustratorJsx = () => {
    const exchangePkg = createProjectExchangePackage(
      currentModel,
      params,
      selectedProfile,
      dieline
    );
    const jsxCode = generateIllustratorJsx(exchangePkg);
    const blob = new Blob([jsxCode], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentModel.code}_${params.L}x${params.B}x${params.H}_1a1.jsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportHtml3D = () => {
    const res = downloadHtml3DFile(currentModel, params, selectedProfile, dieline, {
      artworkTextureUri: outerArtworkTextureUri || artworkTextureUri,
      outerArtworkTextureUri: outerArtworkTextureUri || artworkTextureUri,
      innerArtworkTextureUri: innerArtworkTextureUri,
    });
    if (res.success) {
      confetti({ particleCount: 35, spread: 50, origin: { y: 0.1 } });
    } else {
      alert('Erro ao exportar HTML 3D: ' + res.message);
    }
  };

  const handleSyncArtwork = async () => {
    try {
      const client = IllustratorBridgeClient.getInstance();
      const res = await client.requestArtworkSync(currentModel.id);
      if (res.success && (res.outerArtworkDataUri || res.textureDataUri || res.innerArtworkDataUri)) {
        const outer = res.outerArtworkDataUri || res.textureDataUri || null;
        const inner = res.innerArtworkDataUri || null;
        if (outer) {
          setArtworkTextureUri(outer);
          setOuterArtworkTextureUri(outer);
        }
        if (inner) {
          setInnerArtworkTextureUri(inner);
        }
        confetti({ particleCount: 35, spread: 50, origin: { y: 0.2 } });
      } else {
        alert(res.message || 'Nenhuma arte sincronizada encontrada na Bridge.');
      }
    } catch (e: any) {
      alert('Erro ao sincronizar arte: ' + (e?.message || e));
    }
  };

  const handleClearArtwork = () => {
    setArtworkTextureUri(null);
    setOuterArtworkTextureUri(null);
    setInnerArtworkTextureUri(null);
  };

  // Salvar projeto
  const handleSaveProject = async (name: string) => {
    const saved = await saveProject({
      name,
      model_id: currentModel.id,
      params,
      profile_id: selectedProfile.id,
    });
    setSavedProjects((prev) => [saved, ...prev]);
  };

  // Carregar projeto
  const handleLoadProject = (proj: SavedProject) => {
    const model = getModelById(proj.model_id);
    setCurrentModel(model);
    setParams(proj.params);
    const prof = STANDARD_PROFILES.find(
      (p) => p.id === proj.profile_id || (proj.profile_id?.includes('kraft') && p.id === 'kraft') || (proj.profile_id?.includes('cartao') && p.id === 'cartao')
    );
    setSelectedProfile(prof || STANDARD_PROFILES[0]);
  };

  // Voltar para a Home ao clicar na Logo oficial
  const handleGoHome = () => {
    const homeModel = MODELS[0];
    setCurrentModel(homeModel);
    setParams({
      L: homeModel.defaultParams?.L || 300,
      B: homeModel.defaultParams?.B || 200,
      H: homeModel.defaultParams?.H || 150,
      ...homeModel.defaultParams,
      Ep: selectedProfile.thickness,
    });
    setActiveTab('2d');
    setIsCatalogOpen(false);
    setIsProjectsModalOpen(false);
  };

  // Deletar projeto
  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    setSavedProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--cad-bg-app)',
      }}
    >
      {/* 1. Header / Top Application Bar */}
      <Header
        currentModel={currentModel}
        onSelectModel={handleSelectModel}
        onGoHome={handleGoHome}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onExportDXF={handleExportDXF}
        onExportSVG={handleExportSVG}
        onExportIllustratorJsx={handleExportIllustratorJsx}
        onExportHtml3D={handleExportHtml3D}
        onSaveProject={handleSaveProject}
        onOpenProjectsModal={() => setIsProjectsModalOpen(true)}
        onOpenCatalog={() => setIsCatalogOpen(true)}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        isSupabaseConnected={isSupabaseConfigured}
        onOpenInIllustrator={handleOpenInIllustrator}
        isOpeningIllustrator={isOpeningIllustrator}
        bridgeStatus={bridgeStatus}
        onSyncArtwork={handleSyncArtwork}
        hasArtwork={Boolean(outerArtworkTextureUri || innerArtworkTextureUri || artworkTextureUri)}
        onClearArtwork={handleClearArtwork}
        onOpenIllustratorPluginModal={() => setIsIllustratorPluginModalOpen(true)}
      />

      {/* 2. Workspace Central */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Backdrop para mobile quando painel estiver aberto */}
        {isMobile && sidebarPanel !== null && (
          <div
            onClick={() => setSidebarPanel(null)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
              zIndex: 35,
            }}
          />
        )}

        {/* Barra Lateral Esquerda CAD (Parâmetros e Ângulos de Dobra sem conflito) */}
        <div
          style={
            isMobile && sidebarPanel !== null
              ? {
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: 'min(340px, 88vw)',
                  zIndex: 40,
                  boxShadow: '4px 0 24px rgba(0,0,0,0.8)',
                  display: 'flex',
                }
              : { display: 'flex', height: '100%' }
          }
        >
          <LeftSidebar
            model={currentModel}
            params={params}
            selectedProfileId={selectedProfile.id}
            onParamChange={handleParamChange}
            onProfileChange={setSelectedProfile}
            bounds={dieline.bounds}
            dieline={dieline}
            activeMode={activeTab}
            hinges={hingeList}
            selectedPanelId={selectedPanelId}
            onSelectPanel={setSelectedPanelId}
            onAngleChange={handleAngleChange}
            onResetAngle={handleResetAngle}
            onResetAllAngles={handleResetAllAngles}
            activePanel={sidebarPanel}
            onSelectActivePanel={setSidebarPanel}
          />
        </div>

        {/* Viewport Central (Canvas 2D / 3D / Imposição) */}
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--cad-bg-workspace)' }}>
          {activeTab === '2d' && (
            <CadViewer2D
              dieline={dieline}
              model={currentModel}
              onViewportUpdate={handleViewportUpdate}
            />
          )}

          {activeTab === '3d' && (
            <FoldingViewer3D
              model={currentModel}
              dieline={dieline}
              params={params}
              profile={selectedProfile}
              customAngles={customAngles}
              selectedPanelId={selectedPanelId}
              onSelectPanel={(panelId) => {
                setSelectedPanelId(panelId);
                if (panelId) {
                  setSidebarPanel('folds');
                }
              }}
              onHingeListUpdate={setHingeList}
              onOpenFoldInspector={handleOpenFoldInspector}
              isFoldInspectorActive={sidebarPanel === 'folds'}
              artworkTextureUri={outerArtworkTextureUri || artworkTextureUri}
              outerArtworkTextureUri={outerArtworkTextureUri || artworkTextureUri}
              innerArtworkTextureUri={innerArtworkTextureUri}
            />
          )}

          {activeTab === 'imposition' && <ImpositionView dieline={dieline} />}
        </main>
      </div>

      {/* 3. Status Bar Inferior Profissional */}
      <CadStatusBar
        model={currentModel}
        bounds={dieline.bounds}
        cursorMm={cursorMm}
        zoomLevel={zoomLevel}
        segmentsCount={dieline.segments?.length || 0}
        arcsCount={dieline.arcs?.length || 0}
        activeTab={activeTab}
      />

      {/* Modal de Catálogo Completo (472 Modelos FEFCO e ECMA) */}
      <CatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        onSelectModel={(model) => {
          handleSelectModel(model);
          setIsCatalogOpen(false);
        }}
        currentModelId={currentModel.id}
      />

      {/* Modal de Projetos Salvos */}
      <SavedProjectsModal
        isOpen={isProjectsModalOpen}
        onClose={() => setIsProjectsModalOpen(false)}
        projects={savedProjects}
        onLoadProject={handleLoadProject}
        onDeleteProject={handleDeleteProject}
        isSupabaseConfigured={isSupabaseConfigured}
      />

      {/* Modal de Download e Instruções do Plugin Adobe Illustrator */}
      <IllustratorPluginModal
        isOpen={isIllustratorPluginModalOpen}
        onClose={() => setIsIllustratorPluginModalOpen(false)}
      />

      {/* Modal Profissional de Importação de Faca CAD (PDF, SVG, DXF, DWG) */}
      <ImportCadModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={handleImportSuccess}
      />
    </div>
  );
};

export default App;
