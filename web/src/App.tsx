import React, { useState, useMemo, useEffect } from 'react';
import type { PackagingModel, CardboardProfile } from './engine/types';
import { STANDARD_PROFILES } from './engine/types';
import { MODELS, getModelById } from './engine/models';
import { exportToDXF, exportToSVG } from './engine/dxfExporter';
import type { SavedProject } from './lib/supabaseClient';
import {
  getSavedProjects,
  saveProject,
  deleteProject,
  isSupabaseConfigured,
} from './lib/supabaseClient';

import type { ActiveTab } from './components/Header';
import { Header } from './components/Header';
import { ParameterPanel } from './components/ParameterPanel';
import { CadViewer2D } from './components/CadViewer2D';
import { FoldingViewer3D } from './components/FoldingViewer3D';
import { ImpositionView } from './components/ImpositionView';
import { SavedProjectsModal } from './components/SavedProjectsModal';
import { CatalogModal } from './components/CatalogModal';

export const App: React.FC = () => {
  // 1. Estados Centrais
  const [currentModel, setCurrentModel] = useState<PackagingModel>(MODELS[0]);
  const [selectedProfile, setSelectedProfile] = useState<CardboardProfile>(STANDARD_PROFILES[0]); // Papel Cartão BRANCO Duplex
  const [params, setParams] = useState<Record<string, number>>(() => ({
    ...MODELS[0].defaultParams,
    Ep: STANDARD_PROFILES[0].thickness,
  }));
  const [activeTab, setActiveTab] = useState<ActiveTab>('2d');

  // 2. Catálogo & Projetos Salvos
  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    getSavedProjects().then(setSavedProjects);
  }, []);

  // Quando troca o modelo, redefine os parâmetros para os padrões dele
  const handleSelectModel = (model: PackagingModel) => {
    setCurrentModel(model);
    setParams({
      L: model.defaultParams?.L || 300,
      B: model.defaultParams?.B || 200,
      H: model.defaultParams?.H || 150,
      M: model.defaultParams?.M || 35,
      Ec: model.defaultParams?.Ec || 6,
      Cut: model.defaultParams?.Cut ?? 1,
      ...model.defaultParams,
      Ep: selectedProfile.thickness,
    });
  };

  // Atualização em tempo real de um parâmetro dimensional
  const handleParamChange = (key: string, value: number) => {
    console.log(`[UI] ${key} changed`, value);
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
    const prof = STANDARD_PROFILES.find((p) => p.id === proj.profile_id);
    if (prof) setSelectedProfile(prof);
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
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Header Superior */}
      <Header
        currentModel={currentModel}
        onSelectModel={handleSelectModel}
        onGoHome={handleGoHome}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onExportDXF={handleExportDXF}
        onExportSVG={handleExportSVG}
        onSaveProject={handleSaveProject}
        onOpenProjectsModal={() => setIsProjectsModalOpen(true)}
        onOpenCatalog={() => setIsCatalogOpen(true)}
        isSupabaseConnected={isSupabaseConfigured}
      />

      {/* Conteúdo Principal */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Painel Esquerdo de Parâmetros */}
        <ParameterPanel
          model={currentModel}
          params={params}
          selectedProfileId={selectedProfile.id}
          onParamChange={handleParamChange}
          onProfileChange={setSelectedProfile}
          bounds={dieline.bounds}
        />

        {/* Área Central / Visualizador Alternável */}
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {activeTab === '2d' && <CadViewer2D dieline={dieline} model={currentModel} />}
          {activeTab === '3d' && <FoldingViewer3D model={currentModel} dieline={dieline} params={params} profile={selectedProfile} />}
          {activeTab === 'imposition' && <ImpositionView dieline={dieline} />}
        </main>
      </div>

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
    </div>
  );
};

export default App;
