import React, { useMemo } from 'react';
import type { PackagingModel, CardboardProfile, BoundingBox2D } from '../engine/types';
import type { HingeControlInfo } from '../engine/foldingEngine';
import { ParameterPanel } from './ParameterPanel';
import { FlapAngleInspector } from './FlapAngleInspector';
import { ChevronRight, Sliders } from 'lucide-react';

interface LeftSidebarProps {
  model: PackagingModel;
  params: Record<string, number>;
  selectedProfileId: string;
  onParamChange: (key: string, value: number) => void;
  onProfileChange: (profile: CardboardProfile) => void;
  bounds: BoundingBox2D;
  activeMode: '2d' | '3d' | 'imposition';
  hinges?: HingeControlInfo[];
  selectedPanelId?: string | null;
  onSelectPanel?: (panelId: string | null) => void;
  onAngleChange?: (panelId: string, angleDeg: number) => void;
  onResetAngle?: (panelId: string) => void;
  onResetAllAngles?: () => void;
  isParamsCollapsed: boolean;
  onToggleParamsCollapse: () => void;
  isFoldsCollapsed: boolean;
  onToggleFoldsCollapse: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  model,
  params,
  selectedProfileId,
  onParamChange,
  onProfileChange,
  bounds,
  activeMode,
  hinges = [],
  selectedPanelId = null,
  onSelectPanel,
  onAngleChange,
  onResetAngle,
  onResetAllAngles,
  isParamsCollapsed,
  onToggleParamsCollapse,
  isFoldsCollapsed,
  onToggleFoldsCollapse,
}) => {
  const is3D = activeMode === '3d';
  const showFoldsPanel = is3D;

  const modifiedCount = useMemo(() => {
    return hinges.filter((h) => h.isModified).length;
  }, [hinges]);

  // CASO 1: Ambos recolhidos (ou Parâmetros recolhido quando fora do 3D)
  // Exibe a barra vertical esguia de 32px com abas verticais para cada inspetor
  const isBothCollapsed = isParamsCollapsed && (!showFoldsPanel || isFoldsCollapsed);

  if (isBothCollapsed) {
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
          onClick={onToggleParamsCollapse}
          title="Expandir Parâmetros CAD"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '4px 0',
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
        {showFoldsPanel && (
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
              onClick={onToggleFoldsCollapse}
              title="Expandir Ângulos de Dobra (Graus)"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                padding: '4px 0',
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

  // CASO 2: Pelo menos um painel está expandido (largura de 340px)
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
      {/* SEÇÃO SUPERIOR: PARÂMETROS CAD */}
      {isParamsCollapsed ? (
        /* Barra compacta recolhida de Parâmetros CAD no topo */
        <div
          onClick={onToggleParamsCollapse}
          title="Expandir Parâmetros CAD"
          style={{
            height: 38,
            padding: '0 12px',
            background: 'var(--cad-bg-header)',
            borderBottom: '1px solid var(--cad-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={13} color="var(--cad-accent)" />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--cad-text-muted)' }}>
              PARÂMETROS CAD
            </span>
          </div>
          <button type="button" className="cad-tool-btn" style={{ width: 22, height: 22 }}>
            <ChevronRight size={13} />
          </button>
        </div>
      ) : (
        /* Conteúdo completo de Parâmetros CAD */
        <div
          style={{
            flex: showFoldsPanel && !isFoldsCollapsed ? 1 : 1,
            height: showFoldsPanel && !isFoldsCollapsed ? '50%' : '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <ParameterPanel
            model={model}
            params={params}
            selectedProfileId={selectedProfileId}
            onParamChange={onParamChange}
            onProfileChange={onProfileChange}
            bounds={bounds}
            isCollapsed={false}
            onToggleCollapse={onToggleParamsCollapse}
            activeMode={activeMode}
          />
        </div>
      )}

      {/* SEÇÃO INFERIOR: ÂNGULOS DE DOBRA (Abaixo de Parâmetros CAD no 3D) */}
      {showFoldsPanel && (
        <>
          {isFoldsCollapsed ? (
            /* Barra compacta recolhida de Ângulos de Dobra no rodapé da barra lateral */
            <div
              onClick={onToggleFoldsCollapse}
              title="Expandir Ângulos de Dobra (Graus)"
              style={{
                height: 38,
                padding: '0 12px',
                background: 'var(--cad-bg-header)',
                borderTop: '1px solid var(--cad-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sliders size={13} color="var(--cad-accent)" />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--cad-text-primary)' }}>
                  ÂNGULOS DE DOBRA (GRAUS)
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
                    }}
                  >
                    {modifiedCount}
                  </span>
                )}
              </div>
              <button type="button" className="cad-tool-btn" style={{ width: 22, height: 22 }}>
                <ChevronRight size={13} />
              </button>
            </div>
          ) : (
            /* Conteúdo completo de Ângulos de Dobra */
            <div
              style={{
                flex: !isParamsCollapsed ? 1 : 1,
                height: !isParamsCollapsed ? '50%' : 'calc(100% - 38px)',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderTop: !isParamsCollapsed ? '1px solid var(--cad-border-default)' : 'none',
              }}
            >
              <FlapAngleInspector
                embedded
                hinges={hinges}
                selectedPanelId={selectedPanelId}
                onSelectPanel={onSelectPanel || (() => {})}
                onAngleChange={onAngleChange || (() => {})}
                onResetAngle={onResetAngle || (() => {})}
                onResetAll={onResetAllAngles || (() => {})}
                onToggleCollapse={onToggleFoldsCollapse}
              />
            </div>
          )}
        </>
      )}
    </aside>
  );
};
