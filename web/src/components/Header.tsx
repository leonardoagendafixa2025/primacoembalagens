import React, { useState } from 'react';
import type { PackagingModel } from '../engine/types';
import { MODELS } from '../engine/models';
import {
  Box,
  LayoutGrid,
  Download,
  Save,
  FolderOpen,
  Check,
  FileCode,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export type ActiveTab = '2d' | '3d' | 'imposition';

interface HeaderProps {
  currentModel: PackagingModel;
  onSelectModel: (model: PackagingModel) => void;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onExportDXF: () => void;
  onExportSVG: () => void;
  onSaveProject: (name: string) => Promise<void>;
  onOpenProjectsModal: () => void;
  isSupabaseConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentModel,
  onSelectModel,
  activeTab,
  onSelectTab,
  onExportDXF,
  onExportSVG,
  onSaveProject,
  onOpenProjectsModal,
  isSupabaseConnected,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveClick = async () => {
    const name = prompt('Nome do projeto ou embalagem para salvar:', `${currentModel.name} - ${new Date().toLocaleDateString()}`);
    if (!name) return;

    setIsSaving(true);
    try {
      await onSaveProject(name);
      setSaveSuccess(true);
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.1 } });
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      alert('Erro ao salvar projeto: ' + err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <header
      className="glass-panel"
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: '1px solid var(--border-color)',
        zIndex: 50,
      }}
    >
      {/* 1. Logotipo e Identificação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(59, 130, 246, 0.4)',
          }}
        >
          <Box size={22} color="#FFFFFF" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#F8FAFC', letterSpacing: -0.3 }}>
              PRIMACOR
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60A5FA',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              CAD EMBALAGENS
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>
            Gráfica e Editora
          </div>
        </div>
      </div>

      {/* 2. Seletor de Modelo de Embalagem */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#64748B' }}>Modelo:</span>
        <select
          value={currentModel.id}
          onChange={(e) => {
            const found = MODELS.find((m) => m.id === e.target.value);
            if (found) onSelectModel(found);
          }}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            background: '#1E293B',
            border: '1px solid #334155',
            color: '#F8FAFC',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} - {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* 3. Abas de Visualização (2D / 3D / Imposição) */}
      <div
        style={{
          display: 'flex',
          background: '#0F172A',
          padding: 3,
          borderRadius: 10,
          border: '1px solid #1E293B',
        }}
      >
        <button
          onClick={() => onSelectTab('2d')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: activeTab === '2d' ? '#FFF' : '#94A3B8',
            background: activeTab === '2d' ? '#3B82F6' : 'transparent',
            boxShadow: activeTab === '2d' ? '0 2px 8px rgba(59,130,246,0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <FileCode size={16} />
          Faca 2D
        </button>

        <button
          onClick={() => onSelectTab('3d')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: activeTab === '3d' ? '#FFF' : '#94A3B8',
            background: activeTab === '3d' ? '#3B82F6' : 'transparent',
            boxShadow: activeTab === '3d' ? '0 2px 8px rgba(59,130,246,0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Box size={16} />
          Dobra 3D
        </button>

        <button
          onClick={() => onSelectTab('imposition')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: activeTab === 'imposition' ? '#FFF' : '#94A3B8',
            background: activeTab === 'imposition' ? '#3B82F6' : 'transparent',
            boxShadow: activeTab === 'imposition' ? '0 2px 8px rgba(59,130,246,0.3)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <LayoutGrid size={16} />
          Imposição
        </button>
      </div>

      {/* 4. Botões de Ação e Exportação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Abrir Projetos Salvos */}
        <button
          onClick={onOpenProjectsModal}
          title={isSupabaseConnected ? 'Projetos sincronizados no Supabase' : 'Projetos salvos localmente'}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#1E293B',
            color: '#CBD5E1',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
          }}
        >
          <FolderOpen size={15} />
          Projetos
        </button>

        {/* Salvar Projeto */}
        <button
          onClick={handleSaveClick}
          disabled={isSaving}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: saveSuccess ? '#059669' : '#1E293B',
            color: saveSuccess ? '#FFF' : '#CBD5E1',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            transition: 'all 0.2s',
          }}
        >
          {saveSuccess ? <Check size={15} /> : <Save size={15} />}
          {saveSuccess ? 'Salvo!' : 'Salvar'}
        </button>

        {/* Exportar SVG */}
        <button
          onClick={onExportSVG}
          title="Baixar em formato vetorial SVG"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#1E293B',
            color: '#CBD5E1',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
          }}
        >
          SVG
        </button>

        {/* Exportar DXF */}
        <button
          onClick={onExportDXF}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 10px rgba(59, 130, 246, 0.3)',
          }}
        >
          <Download size={16} />
          Baixar DXF
        </button>
      </div>
    </header>
  );
};
