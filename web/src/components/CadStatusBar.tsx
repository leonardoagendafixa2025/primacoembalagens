import React from 'react';
import type { PackagingModel, BoundingBox2D } from '../engine/types';
import { Cpu, Maximize2, Compass, Layers } from 'lucide-react';

interface CadStatusBarProps {
  model: PackagingModel;
  bounds: BoundingBox2D;
  cursorMm?: { x: number; y: number };
  zoomLevel?: number;
  segmentsCount?: number;
  arcsCount?: number;
  activeTab: '2d' | '3d' | 'imposition';
}

export const CadStatusBar: React.FC<CadStatusBarProps> = ({
  model,
  bounds,
  cursorMm = { x: 0, y: 0 },
  zoomLevel = 1.0,
  segmentsCount = 0,
  arcsCount = 0,
  activeTab,
}) => {
  const areaM2 = ((bounds.width * bounds.height) / 1_000_000).toFixed(3);

  return (
    <footer
      style={{
        height: 'var(--cad-status-height)',
        background: 'var(--cad-bg-status)',
        borderTop: '1px solid var(--cad-border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 11,
        color: 'var(--cad-text-muted)',
        fontFamily: 'var(--cad-font-ui)',
        zIndex: 40,
        userSelect: 'none',
      }}
    >
      {/* 1. Coordenadas e Modo de Visualização */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Compass size={12} color="var(--cad-accent)" />
          <span style={{ color: 'var(--cad-text-secondary)' }}>CURSOR:</span>
          <span className="cad-mono" style={{ color: 'var(--cad-text-primary)', fontWeight: 600 }}>
            X: {cursorMm.x.toFixed(1)} mm
          </span>
          <span style={{ color: 'var(--cad-border-default)' }}>|</span>
          <span className="cad-mono" style={{ color: 'var(--cad-text-primary)', fontWeight: 600 }}>
            Y: {cursorMm.y.toFixed(1)} mm
          </span>
        </div>

        <span style={{ color: 'var(--cad-border-default)' }}>|</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Maximize2 size={11} color="var(--cad-text-muted)" />
          <span>ZOOM:</span>
          <span className="cad-mono" style={{ color: 'var(--cad-text-secondary)', fontWeight: 600 }}>
            {Math.round(zoomLevel * 100)}%
          </span>
        </div>
      </div>

      {/* 2. Dimensões de Faca Aberta e Vetores */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>FACA ABERTA:</span>
          <span className="cad-mono" style={{ color: 'var(--cad-accent)', fontWeight: 700 }}>
            {Math.round(bounds.width)} × {Math.round(bounds.height)} mm
          </span>
          <span style={{ color: 'var(--cad-text-dim)' }}>({areaM2} m²)</span>
        </div>

        {activeTab === '2d' && (
          <>
            <span style={{ color: 'var(--cad-border-default)' }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={11} color="var(--cad-text-muted)" />
              <span>VETORES:</span>
              <span className="cad-mono" style={{ color: 'var(--cad-text-secondary)' }}>
                {segmentsCount} segs {arcsCount > 0 ? `+ ${arcsCount} arcos` : ''}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 3. Status do Motor CAD */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Cpu size={12} color={model.status === 'PASS' ? '#00d2b4' : '#94a3b8'} />
          <span style={{ color: 'var(--cad-text-secondary)', fontWeight: 500 }}>
            {model.code}
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: 3,
              background: model.status === 'PASS' ? 'rgba(0, 210, 180, 0.15)' : 'rgba(148, 163, 184, 0.15)',
              color: model.status === 'PASS' ? '#00d2b4' : '#94a3b8',
              border: `1px solid ${model.status === 'PASS' ? 'rgba(0, 210, 180, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
            }}
          >
            {model.implementationType === 'NATIVE_TS' ? 'CAD NATIVO' : 'PARAMÉTRICO'}
          </span>
        </div>
      </div>
    </footer>
  );
};
