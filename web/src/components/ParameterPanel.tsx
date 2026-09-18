import React, { useState, useMemo } from 'react';
import type { PackagingModel, CardboardProfile, BoundingBox2D, DielineResult } from '../engine/types';
import { STANDARD_PROFILES } from '../engine/types';
import { computeDielineMetrics } from '../engine/geometry';
import { calculateDimensionMatrix } from '../engine/dimensionConverter';
import type { DimensionMode } from '../engine/dimensionConverter';
import {
  Sliders,
  Layers,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  ArrowRightLeft,
  Box,
  Truck,
  Ruler,
} from 'lucide-react';

interface ParameterPanelProps {
  model: PackagingModel;
  params: Record<string, number>;
  selectedProfileId: string;
  onParamChange: (key: string, value: number) => void;
  onProfileChange: (profile: CardboardProfile) => void;
  bounds: BoundingBox2D;
  dieline?: DielineResult;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  activeMode?: '2d' | '3d' | 'imposition';
  activeSubTab?: 'dims' | 'mat';
  onSubTabChange?: (tab: 'dims' | 'mat') => void;
}

export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  model,
  params,
  selectedProfileId,
  onParamChange,
  onProfileChange,
  bounds,
  dieline,
  isCollapsed = false,
  onToggleCollapse,
  activeSubTab,
  onSubTabChange,
}) => {
  const [localTab, setLocalTab] = useState<'dims' | 'mat'>('dims');
  const activeTab = activeSubTab || localTab;

  const handleTabChange = (tab: 'dims' | 'mat') => {
    setLocalTab(tab);
    onSubTabChange?.(tab);
  };

  if (isCollapsed) {
    return (
      <div
        style={{
          width: 32,
          height: '100%',
          background: 'var(--cad-bg-panel)',
          borderRight: '1px solid var(--cad-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          cursor: 'pointer',
        }}
        onClick={onToggleCollapse}
        title="Expandir Painel de Parâmetros CAD"
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
            marginTop: 20,
            textTransform: 'uppercase',
          }}
        >
          Parâmetros CAD
        </span>
      </div>
    );
  }

  const areaM2 = ((bounds.width * bounds.height) / 1_000_000).toFixed(3);
  const currentProfile = STANDARD_PROFILES.find((p) => p.id === selectedProfileId) || STANDARD_PROFILES[0];
  const metrics = useMemo(() => dieline ? computeDielineMetrics(dieline) : null, [dieline]);

  // Modo de Referência Dimensional (Interna vs Faca vs Externa)
  const [dimMode, setDimMode] = useState<DimensionMode>('dieline');

  const epVal = params.Ep ?? currentProfile.thickness ?? 0.4;
  const lVal = params.L ?? model.defaultParams.L ?? 200;
  const bVal = params.B ?? params.W ?? model.defaultParams.B ?? model.defaultParams.W ?? 150;
  const hVal = params.H ?? model.defaultParams.H ?? 100;

  const dimMatrix = useMemo(() => {
    return calculateDimensionMatrix({ L: lVal, B: bVal, H: hVal }, 'dieline', epVal);
  }, [lVal, bVal, hVal, epVal]);

  return (
    <aside
      className="cad-panel"
      style={{
        width: '100%',
        height: '100%',
        borderRight: 'none',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 1. Header do Painel de Propriedades */}
      <div className="cad-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sliders size={13} color="var(--cad-accent)" />
          <span>INSPETOR DE PARÂMETROS</span>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            className="cad-tool-btn"
            style={{ width: 22, height: 22 }}
            onClick={onToggleCollapse}
            title="Recolher Painel"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* 2. Informações Técnicas do Modelo Ativo */}
      <div
        style={{
          padding: '12px 14px',
          background: 'var(--cad-bg-app)',
          borderBottom: '1px solid var(--cad-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 'var(--cad-radius-xs)',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              letterSpacing: 0.5,
            }}
          >
            {model.code}
          </span>
          <span style={{ fontSize: 11, color: 'var(--cad-accent)', fontWeight: 600 }}>
            {model.category}
          </span>
        </div>

        <h3
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--cad-text-primary)',
            marginTop: 6,
            lineHeight: 1.3,
          }}
        >
          {model.name}
        </h3>

        {model.description && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--cad-text-muted)',
              marginTop: 4,
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {model.description}
          </p>
        )}
      </div>

      {/* 3. Card Industrial de Formato Mínimo da Faca Aberta & Métricas de Aço */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--cad-border-subtle)' }}>
        <div
          style={{
            background: 'var(--cad-bg-input)',
            border: '1px solid var(--cad-border-subtle)',
            borderRadius: 'var(--cad-radius-sm)',
            padding: '10px 12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--cad-text-muted)',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            <span>Formato Mínimo da Faca</span>
            <span style={{ color: 'var(--cad-accent)' }}>1 : 1</span>
          </div>

          <div
            className="cad-mono"
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--cad-accent)',
              marginTop: 3,
              display: 'flex',
              alignItems: 'baseline',
              gap: 4,
            }}
          >
            <span>{Math.round(bounds.width)}</span>
            <span style={{ fontSize: 12, color: 'var(--cad-text-muted)' }}>×</span>
            <span>{Math.round(bounds.height)}</span>
            <span style={{ fontSize: 11, color: 'var(--cad-text-secondary)', fontWeight: 500, marginLeft: 2 }}>
              mm
            </span>
          </div>

          <div
            style={{
              fontSize: 10,
              color: 'var(--cad-text-dim)',
              marginTop: 3,
              display: 'flex',
              justifyContent: 'space-between',
              borderBottom: metrics ? '1px solid var(--cad-border-subtle)' : 'none',
              paddingBottom: metrics ? 8 : 0,
              marginBottom: metrics ? 8 : 0,
            }}
          >
            <span>Área da folha aberta:</span>
            <span className="cad-mono" style={{ color: 'var(--cad-text-secondary)' }}>
              {areaM2} m²
            </span>
          </div>

          {metrics && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: 'var(--cad-text-dim)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                  <span>Aço de Corte:</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="cad-mono" style={{ color: '#ef4444', fontWeight: 600 }}>
                    {metrics.totalCutM} m
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--cad-text-dim)' }}>
                    ({metrics.totalCutMm} mm)
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: 'var(--cad-text-dim)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
                  <span>Aço de Vinco:</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="cad-mono" style={{ color: '#3b82f6', fontWeight: 600 }}>
                    {metrics.totalCreaseM} m
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--cad-text-dim)' }}>
                    ({metrics.totalCreaseMm} mm)
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  marginTop: 2,
                  paddingTop: 6,
                  borderTop: '1px dashed var(--cad-border-subtle)',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--cad-text-secondary)' }}>
                  Total Lâminas de Aço:
                </span>
                <span className="cad-mono" style={{ fontWeight: 700, color: 'var(--cad-accent)' }}>
                  {metrics.totalSteelM} m
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Sub-Navegação Interna (Dimensões / Material / Dobras 3D) */}
      <div
        style={{
          display: 'flex',
          padding: '6px 14px',
          gap: 6,
          background: 'var(--cad-bg-panel)',
          borderBottom: '1px solid var(--cad-border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={() => handleTabChange('dims')}
          className="cad-btn"
          style={{
            flex: 1,
            padding: '5px 0',
            fontSize: 11,
            fontWeight: 600,
            background: activeTab === 'dims' ? 'var(--cad-bg-input)' : 'transparent',
            borderColor: activeTab === 'dims' ? 'var(--cad-accent-border)' : 'transparent',
            color: activeTab === 'dims' ? 'var(--cad-accent)' : 'var(--cad-text-muted)',
          }}
        >
          <Sliders size={12} />
          <span>Dimensões</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('mat')}
          className="cad-btn"
          style={{
            flex: 1,
            padding: '5px 0',
            fontSize: 11,
            fontWeight: 600,
            background: activeTab === 'mat' ? 'var(--cad-bg-input)' : 'transparent',
            borderColor: activeTab === 'mat' ? 'var(--cad-accent-border)' : 'transparent',
            color: activeTab === 'mat' ? 'var(--cad-accent)' : 'var(--cad-text-muted)',
          }}
        >
          <Layers size={12} />
          <span>Material</span>
        </button>

      </div>

      {/* 5. Conteúdo com Scroll */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {activeTab === 'dims' ? (
          /* Parâmetros Dimensionais com Conversão de Medidas */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Seletor de Modo de Medida (Interna / Faca / Externa) */}
            <div
              style={{
                background: 'var(--cad-bg-panel-elevated)',
                border: '1px solid var(--cad-border-subtle)',
                borderRadius: 'var(--cad-radius-sm)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArrowRightLeft size={13} color="var(--cad-accent)" />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--cad-text-primary)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    Referência de Medidas
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--cad-text-muted)',
                    fontFamily: 'monospace',
                  }}
                >
                  e = {dimMatrix.caliper} mm
                </span>
              </div>

              {/* Segmented Control 3 Modos */}
              <div
                style={{
                  display: 'flex',
                  background: 'var(--cad-bg-app)',
                  padding: 3,
                  borderRadius: 'var(--cad-radius-xs)',
                  gap: 3,
                }}
              >
                <button
                  type="button"
                  onClick={() => setDimMode('internal')}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 3,
                    border: 'none',
                    cursor: 'pointer',
                    background: dimMode === 'internal' ? 'var(--cad-accent)' : 'transparent',
                    color: dimMode === 'internal' ? '#000000' : 'var(--cad-text-secondary)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                  title="Medida do espaço interior livre (tamanho do produto)"
                >
                  <Box size={11} />
                  <span>Interna</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDimMode('dieline')}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 3,
                    border: 'none',
                    cursor: 'pointer',
                    background: dimMode === 'dieline' ? 'var(--cad-accent)' : 'transparent',
                    color: dimMode === 'dieline' ? '#000000' : 'var(--cad-text-secondary)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                  title="Medida centro-a-centro dos vincos de aço da faca"
                >
                  <Ruler size={11} />
                  <span>Faca</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDimMode('external')}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 3,
                    border: 'none',
                    cursor: 'pointer',
                    background: dimMode === 'external' ? 'var(--cad-accent)' : 'transparent',
                    color: dimMode === 'external' ? '#000000' : 'var(--cad-text-secondary)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                  title="Medida externa total da caixa fechada (logística / paletização)"
                >
                  <Truck size={11} />
                  <span>Externa</span>
                </button>
              </div>

              {/* Matriz Comparativa em Tempo Real */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  background: 'var(--cad-bg-input)',
                  padding: '7px 9px',
                  borderRadius: 'var(--cad-radius-xs)',
                  fontSize: 10,
                  fontFamily: 'monospace',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: dimMode === 'internal' ? 'var(--cad-accent)' : 'var(--cad-text-dim)',
                  }}
                >
                  <span>📦 Interna:</span>
                  <span style={{ fontWeight: dimMode === 'internal' ? 700 : 500 }}>
                    {dimMatrix.internal.L} × {dimMatrix.internal.B} × {dimMatrix.internal.H} mm
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: dimMode === 'dieline' ? 'var(--cad-accent)' : 'var(--cad-text-dim)',
                  }}
                >
                  <span>📏 Faca (Vinco):</span>
                  <span style={{ fontWeight: dimMode === 'dieline' ? 700 : 500 }}>
                    {dimMatrix.dieline.L} × {dimMatrix.dieline.B} × {dimMatrix.dieline.H} mm
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: dimMode === 'external' ? 'var(--cad-accent)' : 'var(--cad-text-dim)',
                  }}
                >
                  <span>🚚 Externa:</span>
                  <span style={{ fontWeight: dimMode === 'external' ? 700 : 500 }}>
                    {dimMatrix.external.L} × {dimMatrix.external.B} × {dimMatrix.external.H} mm
                  </span>
                </div>
              </div>
            </div>

            {model.paramDefs.map((def) => {
              const isEp = def.key === 'Ep';
              const isDim = def.key === 'L' || def.key === 'B' || def.key === 'W' || def.key === 'H';
              const rawVal = params[def.key] ?? model.defaultParams[def.key] ?? 0;
              const minVal = isEp ? 0.1 : def.min;
              const stepVal = isEp ? 0.05 : def.step;

              // Calcula valor aparente baseado no modo ativo
              let displayVal = rawVal;
              if (isDim) {
                if (dimMode === 'internal') {
                  if (def.key === 'L') displayVal = dimMatrix.internal.L;
                  else if (def.key === 'B' || def.key === 'W') displayVal = dimMatrix.internal.B;
                  else if (def.key === 'H') displayVal = dimMatrix.internal.H;
                } else if (dimMode === 'external') {
                  if (def.key === 'L') displayVal = dimMatrix.external.L;
                  else if (def.key === 'B' || def.key === 'W') displayVal = dimMatrix.external.B;
                  else if (def.key === 'H') displayVal = dimMatrix.external.H;
                }
              }

              const updateParamValue = (inputVal: number) => {
                if (!isDim || dimMode === 'dieline') {
                  onParamChange(def.key, inputVal);
                  return;
                }
                let targetFaca = inputVal;
                if (dimMode === 'internal') {
                  if (def.key === 'L' || def.key === 'B' || def.key === 'W') {
                    targetFaca = inputVal + epVal;
                  } else if (def.key === 'H') {
                    targetFaca = inputVal + 2 * epVal;
                  }
                } else if (dimMode === 'external') {
                  if (def.key === 'L' || def.key === 'B' || def.key === 'W') {
                    targetFaca = Math.max(5, inputVal - epVal);
                  } else if (def.key === 'H') {
                    targetFaca = Math.max(5, inputVal - 2 * epVal);
                  }
                }
                onParamChange(def.key, Math.round(targetFaca * 10) / 10);
              };

              const handleStep = (direction: 1 | -1) => {
                const nextVal = Math.max(minVal, Math.min(def.max, displayVal + direction * stepVal));
                updateParamValue(Math.round(nextVal * 100) / 100);
              };

              return (
                <div
                  key={def.key}
                  style={{
                    background: 'var(--cad-bg-panel-elevated)',
                    border: '1px solid var(--cad-border-subtle)',
                    borderRadius: 'var(--cad-radius-sm)',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {/* Linha Superior: Label & Input de Precisão */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cad-text-primary)' }}>
                          {def.label}
                        </span>
                        {isDim && dimMode !== 'dieline' && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: 2,
                              background: 'rgba(0, 210, 180, 0.15)',
                              color: 'var(--cad-accent)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {dimMode === 'internal' ? 'Int' : 'Ext'}
                          </span>
                        )}
                      </div>
                      {def.description && (
                        <span style={{ fontSize: 10, color: 'var(--cad-text-muted)', marginTop: 1 }}>
                          {def.description}
                        </span>
                      )}
                    </div>

                    {/* Stepper Numérico CAD */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <button
                        type="button"
                        onClick={() => handleStep(-1)}
                        className="cad-tool-btn"
                        style={{ width: 22, height: 26, borderRadius: 3 }}
                        title="Diminuir"
                      >
                        <Minus size={11} />
                      </button>

                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="number"
                          className="cad-input-number"
                          min={minVal}
                          max={def.max}
                          step={stepVal}
                          value={displayVal}
                          onChange={(e) => {
                            const parsed = parseFloat(e.target.value);
                            updateParamValue(isNaN(parsed) ? 0 : parsed);
                          }}
                          style={{
                            width: 68,
                            paddingRight: 22,
                          }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            right: 6,
                            fontSize: 10,
                            color: 'var(--cad-text-muted)',
                            pointerEvents: 'none',
                          }}
                        >
                          {def.unit}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStep(1)}
                        className="cad-tool-btn"
                        style={{ width: 22, height: 26, borderRadius: 3 }}
                        title="Aumentar"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Slider Contínuo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="cad-mono" style={{ fontSize: 10, color: 'var(--cad-text-dim)' }}>
                      {minVal}
                    </span>
                    <input
                      type="range"
                      className="cad-slider"
                      min={minVal}
                      max={def.max}
                      step={stepVal}
                      value={displayVal}
                      onChange={(e) => updateParamValue(parseFloat(e.target.value))}
                    />
                    <span className="cad-mono" style={{ fontSize: 10, color: 'var(--cad-text-dim)' }}>
                      {def.max}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Material & Espessura */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--cad-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Substrato Gráfico
              </label>

              <select
                value={selectedProfileId}
                onChange={(e) => {
                  const prof = STANDARD_PROFILES.find((p) => p.id === e.target.value);
                  if (prof) {
                    onProfileChange(prof);
                    onParamChange('Ep', prof.thickness);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--cad-radius-sm)',
                  background: 'var(--cad-bg-input)',
                  border: '1px solid var(--cad-border-default)',
                  color: 'var(--cad-text-primary)',
                  fontSize: 12,
                  outline: 'none',
                }}
              >
                {STANDARD_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.thickness} mm)
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                background: 'var(--cad-bg-input)',
                border: '1px solid var(--cad-border-subtle)',
                borderRadius: 'var(--cad-radius-sm)',
                padding: '10px 12px',
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--cad-text-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontWeight: 600, color: 'var(--cad-text-primary)' }}>
                  Especificação do Material:
                </div>
                {currentProfile.outerColor && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--cad-text-dim)' }}>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: currentProfile.outerColor,
                        border: '1px solid rgba(255,255,255,0.25)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                        display: 'inline-block',
                      }}
                    />
                    <span>Visual 3D</span>
                  </div>
                )}
              </div>
              <div>{currentProfile.description}</div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <span style={{ color: 'var(--cad-text-dim)' }}>Espessura base: </span>
                  <span className="cad-mono" style={{ color: 'var(--cad-accent)', fontWeight: 600 }}>
                    {currentProfile.thickness} mm
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--cad-text-dim)' }}>Acabamento: </span>
                  <span style={{ color: 'var(--cad-text-secondary)', fontWeight: 500 }}>
                    {currentProfile.finish || 'Padrão'}
                  </span>
                </div>
                {currentProfile.grammage && (
                  <div>
                    <span style={{ color: 'var(--cad-text-dim)' }}>Gramatura: </span>
                    <span style={{ color: 'var(--cad-text-secondary)', fontWeight: 500 }}>
                      {currentProfile.grammage}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                background: 'var(--cad-bg-input)',
                border: '1px solid var(--cad-border-subtle)',
                borderRadius: 'var(--cad-radius-sm)',
                padding: '10px 12px',
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--cad-text-secondary)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--cad-text-primary)', marginBottom: 4 }}>
                Compensação de Dobra (Norma DIN 55437 / FEFCO):
              </div>
              <div style={{ color: 'var(--cad-text-muted)', fontSize: 10 }}>
                A cada dobra de 90°, o vinco perde metade da espessura do material para dentro do canalete. O gerador compensa automaticamente:
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, fontFamily: 'monospace' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Ganho por par de paredes (L e B):</span>
                  <span style={{ color: 'var(--cad-accent)', fontWeight: 600 }}>+{currentProfile.thickness} mm</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Ganho na altura com abas (H):</span>
                  <span style={{ color: 'var(--cad-accent)', fontWeight: 600 }}>+{(currentProfile.thickness * 2).toFixed(1)} mm</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
