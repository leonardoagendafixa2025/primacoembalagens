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
  Key,
  Lock,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CorelDrawBridgeClient } from '../integrations/coreldraw/CorelDrawBridgeClient';
import { IllustratorBridgeClient } from '../integrations/illustrator/IllustratorBridgeClient';

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
  bridgeStatus?: { bridgeOnline: boolean; authenticated?: boolean; illustratorDetected: boolean };
  onOpenInCorelDraw?: () => void;
  isOpeningCorelDraw?: boolean;
  corelBridgeStatus?: { bridgeOnline: boolean; authenticated?: boolean; corelDetected: boolean };
  onExportCorelScript?: () => void;
  onOpenCorelPluginModal?: () => void;
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
  onOpenInCorelDraw,
  isOpeningCorelDraw,
  corelBridgeStatus,
  onExportCorelScript,
  onOpenCorelPluginModal,
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

  // Estados de Pareamento e Autenticação da Bridge Local
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [pairError, setPairError] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);

  const isBridgeOnline = !!(bridgeStatus?.bridgeOnline || corelBridgeStatus?.bridgeOnline);
  const isBridgePaired = !!(bridgeStatus?.authenticated || corelBridgeStatus?.authenticated);

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = otpInput.replace(/[-\s]/g, '').trim();
    if (cleanCode.length !== 6) {
      setPairError('O código deve conter exatamente 6 dígitos.');
      return;
    }
    setIsPairing(true);
    setPairError(null);
    try {
      const res = await CorelDrawBridgeClient.getInstance().pairWithOtp(cleanCode);
      if (res.success) {
        await IllustratorBridgeClient.getInstance().checkStatus();
        setIsPairModalOpen(false);
        setOtpInput('');
        confetti({ particleCount: 35, spread: 45, origin: { y: 0.1 } });
      } else {
        setPairError(res.message);
      }
    } catch {
      setPairError('Erro ao comunicar com a bridge.');
    } finally {
      setIsPairing(false);
    }
  };

  const handleRevokePairing = async () => {
    await CorelDrawBridgeClient.getInstance().revokeSession();
    await IllustratorBridgeClient.getInstance().checkStatus();
    setIsPairModalOpen(false);
  };

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
              title={bridgeStatus?.bridgeOnline ? 'Illustrator Conectado e Online' : 'Clique para Ficar Online com o Illustrator'}
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

        {/* Botão Oficial CorelDRAW (Ficar Online / Sincronizar) & Download do Plugin */}
        {onOpenInCorelDraw && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <button
              type="button"
              onClick={onOpenInCorelDraw}
              disabled={isOpeningCorelDraw}
              className="cad-btn"
              title={
                corelBridgeStatus?.bridgeOnline
                  ? 'CorelDRAW Online: clique para abrir e sincronizar a faca no CorelDRAW'
                  : 'Conectar ao CorelDRAW (Ficar Online)'
              }
              style={{
                background: corelBridgeStatus?.bridgeOnline
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(6, 78, 59, 0.5))'
                  : 'linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(6, 78, 59, 0.25))',
                border: corelBridgeStatus?.bridgeOnline
                  ? '1px solid rgba(34, 197, 94, 0.7)'
                  : '1px solid rgba(34, 197, 94, 0.45)',
                color: corelBridgeStatus?.bridgeOnline ? '#4ade80' : '#86efac',
                fontWeight: 600,
                gap: 7,
                padding: '5px 11px',
                boxShadow: corelBridgeStatus?.bridgeOnline
                  ? '0 1px 8px rgba(34, 197, 94, 0.35)'
                  : '0 1px 6px rgba(34, 197, 94, 0.15)',
              }}
            >
              <span
                style={{
                  background: '#064e3b',
                  color: '#4ade80',
                  border: '1px solid #4ade80',
                  borderRadius: 3,
                  padding: '1px 3px',
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  lineHeight: 1,
                }}
              >
                Cdr
              </span>
              <span className="hide-on-mobile">
                {isOpeningCorelDraw
                  ? 'Conectando...'
                  : corelBridgeStatus?.bridgeOnline
                    ? 'CorelDRAW (Online)'
                    : 'CorelDRAW'}
              </span>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: corelBridgeStatus?.bridgeOnline ? '#22c55e' : '#f59e0b',
                  boxShadow: corelBridgeStatus?.bridgeOnline ? '0 0 6px #22c55e' : '0 0 4px #f59e0b',
                }}
                title={corelBridgeStatus?.bridgeOnline ? 'CorelDRAW Conectado e Online' : 'Clique para Ficar Online com o CorelDRAW'}
              />
            </button>

            {/* Botão de Download do Plugin Corel */}
            <a
              href="/downloads/Plugin_CorelDRAW_Primacor.zip"
              download="Plugin_CorelDRAW_Primacor.zip"
              className="cad-btn"
              title="Baixar Plugin Oficial PRIMACOR EMBALAGENS para CorelDRAW (.ZIP)"
              style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                color: '#4ade80',
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
        )}

        {/* Status de Autenticação / Pareamento da Bridge Local */}
        {isBridgeOnline && (
          <button
            type="button"
            onClick={() => setIsPairModalOpen(true)}
            className="cad-btn"
            title={
              isBridgePaired
                ? 'Bridge Local Autenticada (Porta 48123). Clique para gerenciar a sessão.'
                : 'Bridge Local Detectada! Clique para digitar o código OTP de pareamento.'
            }
            style={{
              background: isBridgePaired
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(245, 158, 11, 0.15)',
              border: isBridgePaired
                ? '1px solid rgba(16, 185, 129, 0.45)'
                : '1px solid rgba(245, 158, 11, 0.55)',
              color: isBridgePaired ? '#34d399' : '#fbbf24',
              padding: '5px 9px',
              fontSize: 11,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {isBridgePaired ? <Lock size={12} color="#34d399" /> : <Key size={12} color="#fbbf24" />}
            <span className="hide-on-mobile">{isBridgePaired ? 'Autenticada' : 'Parear OTP'}</span>
          </button>
        )}

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
                  <span style={{ fontWeight: 600 }}>Script Illustrator (.jsx)</span>
                </button>
              )}

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
                CorelDRAW Graphics Suite
              </div>

              <a
                href="/downloads/Plugin_CorelDRAW_Primacor.zip"
                download="Plugin_CorelDRAW_Primacor.zip"
                className="cad-btn"
                onClick={() => setIsExportMenuOpen(false)}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  color: '#4ade80',
                  fontSize: 12,
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <Download size={14} color="#4ade80" />
                <span style={{ fontWeight: 700 }}>Baixar Plugin CorelDRAW (.zip)</span>
              </a>

              {onOpenCorelPluginModal && (
                <button
                  type="button"
                  className="cad-btn"
                  onClick={() => {
                    onOpenCorelPluginModal();
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
                  <HelpCircle size={14} color="#4ade80" />
                  <span>Como Instalar no CorelDRAW...</span>
                </button>
              )}

              {onExportCorelScript && (
                <button
                  type="button"
                  className="cad-btn"
                  onClick={() => {
                    onExportCorelScript();
                    setIsExportMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    background: 'transparent',
                    border: 'none',
                    color: '#4ade80',
                    fontSize: 12,
                  }}
                >
                  <FileCode size={14} color="#4ade80" />
                  <span style={{ fontWeight: 600 }}>Script CorelDRAW (.ps1)</span>
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

      {/* Modal de Pareamento da Bridge (OTP de 6 Dígitos) */}
      {isPairModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setIsPairModalOpen(false)}
        >
          <div
            style={{
              background: '#131822',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: 24,
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              color: '#f8fafc',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: isBridgePaired ? '#10b981' : '#f59e0b',
                  }}
                />
                {isBridgePaired ? 'Bridge Autenticada' : 'Parear Bridge Local'}
              </h3>
              <button
                type="button"
                onClick={() => setIsPairModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 20,
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
              {isBridgePaired ? (
                <>
                  Sua sessão com a bridge local em <code>127.0.0.1:48123</code> está <strong>ativa e autenticada</strong>. O Illustrator e o CorelDRAW estão liberados para receber a faca e enviar a arte.
                </>
              ) : (
                <>
                  A bridge local foi detectada na porta 48123. Digite o código de <strong>6 dígitos (OTP)</strong> exibido no terminal para autorizar a sincronização:
                </>
              )}
            </p>

            {!isBridgePaired ? (
              <form onSubmit={handlePairSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <input
                    type="text"
                    maxLength={7}
                    placeholder="Ex: 482-915"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: 4,
                      textAlign: 'center',
                      background: '#0f172a',
                      border: pairError ? '1px solid #ef4444' : '1px solid #334155',
                      borderRadius: 8,
                      color: '#38bdf8',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    autoFocus
                  />
                  {pairError && (
                    <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                      {pairError}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setIsPairModalOpen(false)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #334155',
                      color: '#94a3b8',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPairing || otpInput.replace(/[-\s]/g, '').length !== 6}
                    style={{
                      background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '8px 18px',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: isPairing ? 'wait' : 'pointer',
                      opacity: otpInput.replace(/[-\s]/g, '').length !== 6 ? 0.6 : 1,
                    }}
                  >
                    {isPairing ? 'Conectando...' : 'Autorizar Conexão'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleRevokePairing}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    padding: '8px 16px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Desconectar Bridge
                </button>
                <button
                  type="button"
                  onClick={() => setIsPairModalOpen(false)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    padding: '8px 16px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
