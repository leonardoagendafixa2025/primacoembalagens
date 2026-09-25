import React, { useMemo } from 'react';
import type { PackagingModel, CardboardProfile, BoundingBox2D, DielineResult } from '../engine/types';
import type { HingeControlInfo } from '../engine/foldingEngine';
import { ParameterPanel } from './ParameterPanel';
import { FlapAngleInspector } from './FlapAngleInspector';
import { ChevronRight, ChevronLeft, Sliders } from 'lucide-react';

interface LeftSidebarProps {
  model: PackagingModel;
  params: Record<string, number>;
  selectedProfileId: string;
  onParamChange: (key: string, value: number, extraParams?: Record<string, number>) => void;
  onProfileChange: (profile: CardboardProfile) => void;
  bounds: BoundingBox2D;
  dieline?: DielineResult;
  activeMode: '2d' | '3d' | 'imposition';
  hinges?: HingeControlInfo[];
  selectedPanelId?: string | null;
  onSelectPanel?: (panelId: string | null) => void;
  onAngleChange?: (panelId: string, angleDeg: number) => void;
  onResetAngle?: (panelId: string) => void;
  onResetAllAngles?: () => void;
  activePanel: 'params' | 'folds' | null;
  onSelectActivePanel: (panel: 'params' | 'folds' | null) => void;
  onOpenImportModal?: () => void;
  onResetToCatalog?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  model,
  params,
  selectedProfileId,
  onParamChange,
  onProfileChange,
  bounds,
  dieline,
  activeMode,
  hinges = [],
  selectedPanelId = null,
  onSelectPanel,
  onAngleChange,
  onResetAngle,
  onResetAllAngles,
  activePanel,
  onSelectActivePanel,
  onOpenImportModal,
  onResetToCatalog,
}) => {
  const is3D = activeMode === '3d';

  const modifiedCount = useMemo(() => {
    return hinges.filter((h) => h.isModified).length;
  }, [hinges]);

  // Se estiver fora do 3D e o painel ativo for 'folds', força 'params'
  const currentPanel = !is3D && activePanel === 'folds' ? 'params' : activePanel;

  // ESTADO 1: Recolhido (Barra lateral de 32px com abas verticais)
  if (!currentPanel) {
    return (
      <aside
        style={{
          width: 32,
          height: '100%',
          background: 'var(--cad-bg-panel)',
          borderRight: '1px solid var(--cad-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          userSelect: 'none',
          zIndex: 30,
        }}
      >
        {/* Aba Vertical 1: Parâmetros CAD */}
        <div
          onClick={() => onSelectActivePanel('params')}
          title="Abrir Inspetor de Parâmetros CAD"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '6px 0',
            width: '100%',
          }}
        >
          <button type="button" className="cad-tool-btn" style={{ width: 24, height: 24 }}>
            <ChevronRight size={14} />
          </button>
          <span
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              color: 'var(--cad-text-muted)',
              marginTop: 18,
              textTransform: 'uppercase',
            }}
          >
            Parâmetros CAD
          </span>
        </div>

        {/* Separador e Aba Vertical 2: Ângulos de Dobra (abaixo de Parâmetros CAD no 3D) */}
        {is3D && (
          <>
            <div
              style={{
                width: 18,
                height: 1,
                background: 'var(--cad-border-default)',
                margin: '24px 0 16px',
              }}
            />
            <div
              onClick={() => onSelectActivePanel('folds')}
              title="Abrir Ângulos de Dobra (Graus)"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                padding: '6px 0',
                width: '100%',
              }}
            >
              <button type="button" className="cad-tool-btn" style={{ width: 24, height: 24 }}>
                <ChevronRight size={14} />
              </button>
              <span
                style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                  color: 'var(--cad-accent)',
                  marginTop: 18,
                  textTransform: 'uppercase',
                }}
              >
                Ângulos de Dobra
              </span>
              {modifiedCount > 0 && (
                <span
                  className="cad-mono"
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: 8,
                    background: 'var(--cad-accent)',
                    color: '#000000',
                    marginTop: 10,
                  }}
                >
                  {modifiedCount}
                </span>
              )}
            </div>
          </>
        )}
      </aside>
    );
  }

  // ESTADO 2: Expandido (Largura CAD de 340px com abas superiores limpas e sem conflito)
  return (
    <aside
      className="cad-panel"
      style={{
        width: 'var(--cad-sidebar-width)',
        height: '100%',
        borderRight: '1px solid var(--cad-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        zIndex: 30,
      }}
    >
      {/* Cabeçalho Unificado com Seleção de Aba e Botão de Recolher */}
      <div
        style={{
          padding: '8px 10px 8px 12px',
          background: 'var(--cad-bg-header)',
          borderBottom: '1px solid var(--cad-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        {/* Abas de Navegação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => onSelectActivePanel('params')}
            className="cad-btn"
            style={{
              padding: '4px 9px',
              fontSize: 11,
              fontWeight: 700,
              background: currentPanel === 'params' ? 'var(--cad-bg-input)' : 'transparent',
              borderColor: currentPanel === 'params' ? 'var(--cad-accent-border)' : 'transparent',
              color: currentPanel === 'params' ? 'var(--cad-accent)' : 'var(--cad-text-muted)',
              gap: 6,
            }}
          >
            <Sliders size={12} />
            <span>Parâmetros</span>
          </button>

          {is3D && (
            <button
              type="button"
              onClick={() => onSelectActivePanel('folds')}
              className="cad-btn"
              style={{
                padding: '4px 9px',
                fontSize: 11,
                fontWeight: 700,
                background: currentPanel === 'folds' ? 'var(--cad-bg-input)' : 'transparent',
                borderColor: currentPanel === 'folds' ? 'var(--cad-accent-border)' : 'transparent',
                color: currentPanel === 'folds' ? 'var(--cad-accent)' : 'var(--cad-text-muted)',
                gap: 6,
                position: 'relative',
              }}
            >
              <Sliders size={12} />
              <span>Dobras (°)</span>
              {modifiedCount > 0 && (
                <span
                  className="cad-mono"
                  style={{
                    fontSize: 8.5,
                    fontWeight: 800,
                    padding: '0 4px',
                    borderRadius: 6,
                    background: 'var(--cad-accent)',
                    color: '#000000',
                  }}
                >
                  {modifiedCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Botão de Recolher para a Barra Lateral */}
        <button
          type="button"
          className="cad-tool-btn"
          style={{ width: 24, height: 24, flexShrink: 0, marginLeft: 6 }}
          onClick={() => onSelectActivePanel(null)}
          title="Recolher Painel Lateral"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Conteúdo 100% Dedicado à Aba Ativa (Zero Conflito, Zero Sobreposição!) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {currentPanel === 'params' ? (
          <ParameterPanel
            model={model}
            params={params}
            selectedProfileId={selectedProfileId}
            onParamChange={onParamChange}
            onProfileChange={onProfileChange}
            bounds={bounds}
            dieline={dieline}
            isCollapsed={false}
            activeMode={activeMode}
            onOpenImportModal={onOpenImportModal}
            onResetToCatalog={onResetToCatalog}
          />
        ) : (
          <FlapAngleInspector
            embedded
            hinges={hinges}
            selectedPanelId={selectedPanelId}
            onSelectPanel={onSelectPanel || (() => {})}
            onAngleChange={onAngleChange || (() => {})}
            onResetAngle={onResetAngle || (() => {})}
            onResetAll={onResetAllAngles || (() => {})}
          />
        )}
      </div>
    </aside>
  );
};
