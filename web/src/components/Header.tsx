import React, { useState } from 'react';
import type { PackagingModel } from '../engine/types';
import modelsCatalog from '../engine/modelsCatalog.json';
import {
  Box,
  LayoutGrid,
  Download,
  Save,
  FolderOpen,
  Check,
  FileCode,
  BookOpen,
  ChevronDown,
  HelpCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';

const CATALOG_COUNT = modelsCatalog.length;

export type ActiveTab = '2d' | '3d' | 'imposition';

interface HeaderProps {
  currentModel: PackagingModel;
  onSelectModel?: (model: PackagingModel) => void;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onExportDXF: () => void;
  onExportSVG: () => void;
  onExportIllustratorJsx?: () => void;
  onSaveProject: (name: string) => Promise<void>;
  onOpenProjectsModal: () => void;
  onOpenCatalog: () => void;
  isSupabaseConnected: boolean;
  onGoHome?: () => void;
  onOpenInIllustrator?: () => void;
  isOpeningIllustrator?: boolean;
  bridgeStatus?: { bridgeOnline: boolean; illustratorDetected: boolean };
  onSyncArtwork?: () => void;
  hasArtwork?: boolean;
  onClearArtwork?: () => void;
  onUploadArtworkFile?: (file: File) => void;
  onOpenIllustratorPluginModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentModel,
  activeTab,
  onSelectTab,
  onExportDXF,
  onExportSVG,
  onExportIllustratorJsx,
  onSaveProject,
  onOpenProjectsModal,
  onOpenCatalog,
  isSupabaseConnected,
  onGoHome,
  onOpenInIllustrator,
  isOpeningIllustrator,
  bridgeStatus,
  onSyncArtwork,
  hasArtwork,
  onClearArtwork,
  onUploadArtworkFile,
  onOpenIllustratorPluginModal,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleSaveClick = async () => {
    const name = prompt(
      'Nome do projeto de embalagem:',
      `${currentModel.name} - ${new Date().toLocaleDateString()}`
    );
    if (!name) return;

    setIsSaving(true);
    try {
      await onSaveProject(name);
      setSaveSuccess(true);
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.1 } });
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      alert('Erro ao salvar projeto: ' + err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <header
      style={{
        height: 'var(--cad-header-height)',
        background: 'var(--cad-bg-header)',
        borderBottom: '1px solid var(--cad-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        zIndex: 50,
        userSelect: 'none',
      }}
    >
      {/* 1. Logotipo Oficial Primacor & Identificador CAD Pro */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={onGoHome}
          title="Primacor CAD - Voltar ao Início"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: 'var(--cad-radius-sm)',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <img
            src="/primacor-logo-horizontal.png"
            alt="Primacor Gráfica"
            style={{
              height: 28,
              objectFit: 'contain',
            }}
          />
          <div className="hide-on-mobile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: 'var(--cad-accent)',
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              PACKAGING CAD PRO
            </span>
            <span style={{ fontSize: 8, color: 'var(--cad-text-muted)', letterSpacing: 0.5, marginTop: 2 }}>
              v2.4 INDUSTRIAL
            </span>
          </div>
        </button>

        {/* Separador Vertical */}
        <div className="hide-on-mobile" style={{ width: 1, height: 24, background: 'var(--cad-border-subtle)' }} />

        {/* Botão da Biblioteca Geral */}
        <button
          type="button"
          onClick={onOpenCatalog}
          className="cad-btn icon-only-mobile"
          style={{
            background: 'var(--cad-bg-panel)',
            border: '1px solid var(--cad-border-default)',
            color: 'var(--cad-text-primary)',
            padding: '5px 10px',
            gap: 7,
          }}
          title="Biblioteca de Modelos Paramétricos (Atalho: Ctrl+K)"
        >
          <BookOpen size={14} color="var(--cad-accent)" />
          <span style={{ fontWeight: 600 }}>Biblioteca</span>
          <span
            className="keep-badge"
            style={{
              background: 'var(--cad-accent-dim)',
              color: 'var(--cad-accent)',
              border: '1px solid var(--cad-accent-border)',
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 4,
            }}
          >
            {CATALOG_COUNT}
          </span>
        </button>

        {/* Modelo Ativo Selecionado */}
        <div
          onClick={onOpenCatalog}
          title="Clique para trocar modelo na Biblioteca"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderRadius: 'var(--cad-radius-sm)',
            background: 'var(--cad-bg-input)',
            border: '1px solid var(--cad-border-subtle)',
            cursor: 'pointer',
            fontSize: 12,
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--cad-accent-border)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--cad-border-subtle)')}
        >
          <span style={{ color: 'var(--cad-accent)', fontWeight: 700, letterSpacing: 0.3 }}>
            {currentModel.code}
          </span>
          <span className="hide-on-mobile" style={{ color: 'var(--cad-border-hover)' }}>|</span>
          <span
            className="hide-on-mobile"
            style={{
              color: 'var(--cad-text-secondary)',
              fontWeight: 500,
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {currentModel.name}
          </span>
        </div>
      </div>

      {/* 2. Seletor de Modo de Trabalho (Faca 2D / Dobra 3D / Imposição) */}
      <div
        style={{
          display: 'flex',
          background: 'var(--cad-bg-app)',
          padding: 2,
          borderRadius: 'var(--cad-radius-md)',
          border: '1px solid var(--cad-border-subtle)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
        }}
      >
        <button
          type="button"
          onClick={() => onSelectTab('2d')}
          className="compact-on-mobile"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 'var(--cad-radius-sm)',
            fontSize: 12,
            fontWeight: activeTab === '2d' ? 600 : 500,
            color: activeTab === '2d' ? '#000000' : 'var(--cad-text-secondary)',
            background: activeTab === '2d' ? 'var(--cad-accent)' : 'transparent',
            boxShadow: activeTab === '2d' ? '0 1px 4px rgba(0, 210, 180, 0.35)' : 'none',
            transition: 'all 0.12s ease',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <FileCode size={14} />
          <span>2D</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('3d')}
          className="compact-on-mobile"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 'var(--cad-radius-sm)',
            fontSize: 12,
            fontWeight: activeTab === '3d' ? 600 : 500,
            color: activeTab === '3d' ? '#000000' : 'var(--cad-text-secondary)',
            background: activeTab === '3d' ? 'var(--cad-accent)' : 'transparent',
            boxShadow: activeTab === '3d' ? '0 1px 4px rgba(0, 210, 180, 0.35)' : 'none',
            transition: 'all 0.12s ease',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Box size={14} />
          <span>3D</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('imposition')}
          className="compact-on-mobile"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 'var(--cad-radius-sm)',
            fontSize: 12,
            fontWeight: activeTab === 'imposition' ? 600 : 500,
            color: activeTab === 'imposition' ? '#000000' : 'var(--cad-text-secondary)',
            background: activeTab === 'imposition' ? 'var(--cad-accent)' : 'transparent',
            boxShadow: activeTab === 'imposition' ? '0 1px 4px rgba(0, 210, 180, 0.35)' : 'none',
            transition: 'all 0.12s ease',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <LayoutGrid size={14} />
          <span className="hide-on-mobile">Imposição</span>
          <span style={{ display: 'none' }} className="keep-badge">Imp.</span>
        </button>
      </div>

      {/* 3. Ações Técnicas: Projetos, Salvar e Exportações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Projetos Salvos */}
        <button
          type="button"
          onClick={onOpenProjectsModal}
          className="cad-btn icon-only-mobile"
          title={isSupabaseConnected ? 'Projetos sincronizados na Nuvem' : 'Projetos salvos localmente'}
        >
          <FolderOpen size={14} />
          <span>Projetos</span>
        </button>

        {/* Salvar Projeto */}
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={isSaving}
          className="cad-btn icon-only-mobile"
          style={{
            background: saveSuccess ? 'rgba(16, 185, 129, 0.2)' : 'var(--cad-bg-panel)',
            borderColor: saveSuccess ? '#10b981' : 'var(--cad-border-default)',
            color: saveSuccess ? '#10b981' : 'var(--cad-text-primary)',
          }}
        >
          {saveSuccess ? <Check size={14} color="#10b981" /> : <Save size={14} />}
          <span>{isSaving ? 'Salvando...' : saveSuccess ? 'Salvo!' : 'Salvar'}</span>
        </button>

        {/* Input Oculto para upload manual de arte PNG/JPG */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/png,image/jpeg"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onUploadArtworkFile?.(file);
              e.target.value = '';
            }
          }}
        />

        {/* Botão Oficial Adobe Illustrator (Ficar Online / Sincronizar) & Download do Plugin */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <button
            type="button"
            onClick={onOpenInIllustrator}
            disabled={isOpeningIllustrator}
            className="cad-btn"
            title={
              bridgeStatus?.bridgeOnline
                ? 'Illustrator Online: clique para abrir e sincronizar a faca no Illustrator'
                : 'Conectar ao Adobe Illustrator (Ficar Online)'
            }
            style={{
              background: bridgeStatus?.bridgeOnline
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(6, 78, 59, 0.45))'
                : 'linear-gradient(135deg, rgba(255, 154, 0, 0.14), rgba(51, 0, 0, 0.35))',
              border: bridgeStatus?.bridgeOnline
                ? '1px solid rgba(16, 185, 129, 0.65)'
                : '1px solid rgba(255, 154, 0, 0.55)',
              color: bridgeStatus?.bridgeOnline ? '#34d399' : '#ff9a00',
              fontWeight: 600,
              gap: 7,
              padding: '5px 11px',
              boxShadow: bridgeStatus?.bridgeOnline
                ? '0 1px 8px rgba(16, 185, 129, 0.3)'
                : '0 1px 6px rgba(255, 154, 0, 0.15)',
            }}
          >
            <span
              style={{
                background: bridgeStatus?.bridgeOnline ? '#064e3b' : '#330000',
                color: bridgeStatus?.bridgeOnline ? '#34d399' : '#ff9a00',
                border: bridgeStatus?.bridgeOnline ? '1px solid #34d399' : '1px solid #ff9a00',
                borderRadius: 3,
                padding: '1px 3px',
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: 0.5,
                lineHeight: 1,
              }}
            >
              Ai
            </span>
            <span className="hide-on-mobile">
              {isOpeningIllustrator
                ? 'Conectando...'
                : bridgeStatus?.bridgeOnline
                  ? 'Illustrator (Online)'
                  : 'Ficar Online'}
            </span>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: bridgeStatus?.bridgeOnline ? '#10b981' : '#f59e0b',
                boxShadow: bridgeStatus?.bridgeOnline ? '0 0 6px #10b981' : '0 0 4px #f59e0b',
              }}
              title={bridgeStatus?.bridgeOnline ? 'Bridge Conectada ao Illustrator' : 'Bridge Offline (Clique para conectar)'}
            />
          </button>

          {/* Botão de Download do Plugin */}
          <a
            href="/downloads/Plugin_Illustrator_Primacor.zip"
            download="Plugin_Illustrator_Primacor.zip"
            className="cad-btn"
            title="Baixar Plugin Oficial PRIMACOR EMBALAGENS para Adobe Illustrator (.ZIP)"
            style={{
              background: 'rgba(255, 154, 0, 0.08)',
              border: '1px solid rgba(255, 154, 0, 0.35)',
              color: '#ffb347',
              padding: '5px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            <Download size={13} />
            <span className="hide-on-mobile">Plugin</span>
          </a>
        </div>

        {/* Indicador de Arte 3D Ativa */}
        {hasArtwork && (
          <button
            type="button"
            onClick={onSyncArtwork}
            className="cad-btn"
            title="Arte 3D ativa no Three.js! Clique para resincronizar ou use o menu Exportar para remover."
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid #10b981',
              color: '#10b981',
              fontWeight: 600,
              padding: '5px 9px',
              fontSize: 11,
              gap: 5,
            }}
          >
            <span>Arte 3D ✓</span>
          </button>
        )}

        {/* Dropdown de Exportação CAD */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setIsExportMenuOpen((prev) => !prev)}
            className="cad-btn cad-btn-primary"
            title="Opções de Exportação CAD e Integração"
          >
            <Download size={14} />
            <span className="hide-on-mobile">Exportar</span>
            <ChevronDown size={12} />
          </button>

          {isExportMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: 'var(--cad-bg-dropdown)',
                border: '1px solid var(--cad-border-default)',
                borderRadius: 'var(--cad-radius-md)',
                boxShadow: 'var(--cad-shadow-panel)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 220,
                zIndex: 100,
              }}
              onMouseLeave={() => setIsExportMenuOpen(false)}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--cad-text-muted)',
                  padding: '4px 8px',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Formatos de Produção
              </div>

              <button
                type="button"
                className="cad-btn"
                onClick={() => {
                  onExportDXF();
                  setIsExportMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--cad-text-primary)',
                  fontSize: 12,
                }}
              >
                <FileCode size={14} color="var(--cad-accent)" />
                <span style={{ fontWeight: 600 }}>DXF (AutoCAD / Laser)</span>
              </button>

              <button
                type="button"
                className="cad-btn"
                onClick={() => {
                  onExportSVG();
                  setIsExportMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--cad-text-primary)',
                  fontSize: 12,
                }}
              >
                <Download size={14} color="#f59e0b" />
                <span style={{ fontWeight: 600 }}>SVG (Vetor Gráfico)</span>
              </button>

              <div
                style={{
                  height: 1,
                  background: 'var(--cad-border-subtle)',
                  margin: '4px 0',
                }}
              />

              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--cad-text-muted)',
                  padding: '4px 8px',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Adobe Illustrator
              </div>

              <a
                href="/downloads/Plugin_Illustrator_Primacor.zip"
                download="Plugin_Illustrator_Primacor.zip"
                className="cad-btn"
                onClick={() => setIsExportMenuOpen(false)}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  background: 'rgba(255, 154, 0, 0.12)',
                  border: '1px solid rgba(255, 154, 0, 0.4)',
                  color: '#ff9a00',
                  fontSize: 12,
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <Download size={14} color="#ff9a00" />
                <span style={{ fontWeight: 700 }}>Baixar Plugin Illustrator (.zip)</span>
              </a>

              {onOpenIllustratorPluginModal && (
                <button
                  type="button"
                  className="cad-btn"
                  onClick={() => {
                    onOpenIllustratorPluginModal();
                    setIsExportMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--cad-text-secondary)',
                    fontSize: 12,
                  }}
                >
                  <HelpCircle size={14} color="#38bdf8" />
                  <span>Como Instalar o Plugin...</span>
                </button>
              )}

              {onExportIllustratorJsx && (
                <button
                  type="button"
                  className="cad-btn"
                  onClick={() => {
                    onExportIllustratorJsx();
                    setIsExportMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    background: 'transparent',
                    border: 'none',
                    color: '#ff9a00',
                    fontSize: 12,
                  }}
                >
                  <FileCode size={14} color="#ff9a00" />
                  <span style={{ fontWeight: 600 }}>Script da Faca (.jsx)</span>
                </button>
              )}

              {onSyncArtwork && (
                <button
                  type="button"
                  className="cad-btn"
                  onClick={() => {
                    onSyncArtwork();
                    setIsExportMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--cad-text-primary)',
                    fontSize: 12,
                  }}
                >
                  <Download size={14} color="#10b981" />
                  <span>Sincronizar Arte da Ponte</span>
                </button>
              )}

              {onUploadArtworkFile && (
                <button
                  type="button"
                  className="cad-btn"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsExportMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--cad-text-primary)',
                    fontSize: 12,
                  }}
                >
                  <FolderOpen size={14} color="#38bdf8" />
                  <span>Carregar Arte PNG / JPG</span>
                </button>
              )}

              {hasArtwork && onClearArtwork && (
                <button
                  type="button"
                  className="cad-btn"
                  onClick={() => {
                    onClearArtwork();
                    setIsExportMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: 12,
                  }}
                >
                  <span>Remover Arte 3D</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
