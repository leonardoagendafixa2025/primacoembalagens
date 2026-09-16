import React from 'react';
import {
  Maximize,
  ZoomIn,
  ZoomOut,
  Grid,
  Ruler,
  RotateCcw,
  Download,
} from 'lucide-react';

interface CadToolbarProps {
  onFitToScreen: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showDimensions: boolean;
  onToggleDimensions: () => void;
  onExportDXF?: () => void;
  onExportSVG?: () => void;
}

export const CadToolbar: React.FC<CadToolbarProps> = ({
  onFitToScreen,
  onZoomIn,
  onZoomOut,
  onResetView,
  showGrid,
  onToggleGrid,
  showDimensions,
  onToggleDimensions,
  onExportDXF,
}) => {
  return (
    <aside
      style={{
        width: 'var(--cad-toolbar-width)',
        background: 'var(--cad-bg-panel)',
        borderRight: '1px solid var(--cad-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0',
        gap: 6,
        zIndex: 35,
        userSelect: 'none',
      }}
    >
      {/* 1. Ferramenta de Ajuste e Enquadramento */}
      <button
        type="button"
        className="cad-tool-btn cad-tooltip"
        data-tooltip="Ajustar Faca na Tela (Fit)"
        onClick={onFitToScreen}
      >
        <Maximize size={16} />
      </button>

      {/* 2. Zoom In / Out */}
      <button
        type="button"
        className="cad-tool-btn cad-tooltip"
        data-tooltip="Aproximar Zoom (+)"
        onClick={onZoomIn}
      >
        <ZoomIn size={16} />
      </button>

      <button
        type="button"
        className="cad-tool-btn cad-tooltip"
        data-tooltip="Afastar Zoom (-)"
        onClick={onZoomOut}
      >
        <ZoomOut size={16} />
      </button>

      {/* Divisor Técnico */}
      <div style={{ width: 24, height: 1, background: 'var(--cad-border-subtle)', margin: '4px 0' }} />

      {/* 3. Alternador de Grade */}
      <button
        type="button"
        className={`cad-tool-btn cad-tooltip ${showGrid ? 'active' : ''}`}
        data-tooltip={showGrid ? 'Ocultar Grade Milimétrica' : 'Exibir Grade Milimétrica'}
        onClick={onToggleGrid}
      >
        <Grid size={16} />
      </button>

      {/* 4. Alternador de Cotas Técnicas */}
      <button
        type="button"
        className={`cad-tool-btn cad-tooltip ${showDimensions ? 'active' : ''}`}
        data-tooltip={showDimensions ? 'Ocultar Cotas Técnicas' : 'Exibir Cotas Técnicas'}
        onClick={onToggleDimensions}
      >
        <Ruler size={16} />
      </button>

      {/* 5. Resetar Câmera / Posição Original */}
      <button
        type="button"
        className="cad-tool-btn cad-tooltip"
        data-tooltip="Resetar Visualização Original"
        onClick={onResetView}
      >
        <RotateCcw size={16} />
      </button>

      {/* Divisor Técnico Inferior */}
      <div style={{ flex: 1 }} />

      {/* Exportação Rápida DXF / SVG */}
      {onExportDXF && (
        <button
          type="button"
          className="cad-tool-btn cad-tooltip"
          data-tooltip="Download Faca DXF (Corte/Vinco)"
          onClick={onExportDXF}
          style={{ color: 'var(--cad-accent)' }}
        >
          <Download size={16} />
        </button>
      )}
    </aside>
  );
};
