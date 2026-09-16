import React, { useState } from 'react';
import type { PackagingModel, CardboardProfile, BoundingBox2D } from '../engine/types';
import { STANDARD_PROFILES } from '../engine/types';
import {
  Sliders,
  Layers,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
} from 'lucide-react';

interface ParameterPanelProps {
  model: PackagingModel;
  params: Record<string, number>;
  selectedProfileId: string;
  onParamChange: (key: string, value: number) => void;
  onProfileChange: (profile: CardboardProfile) => void;
  bounds: BoundingBox2D;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  model,
  params,
  selectedProfileId,
  onParamChange,
  onProfileChange,
  bounds,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<'dims' | 'mat'>('dims');

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

  return (
    <aside
      className="cad-panel"
      style={{
        width: 'var(--cad-sidebar-width)',
        height: '100%',
        borderRight: '1px solid var(--cad-border-subtle)',
        userSelect: 'none',
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

      {/* 3. Card Industrial de Formato Mínimo da Faca Aberta */}
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
            }}
          >
            <span>Área da folha aberta:</span>
            <span className="cad-mono" style={{ color: 'var(--cad-text-secondary)' }}>
              {areaM2} m²
            </span>
          </div>
        </div>
      </div>

      {/* 4. Sub-Navegação Interna (Dimensões / Material) */}
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
          onClick={() => setActiveTab('dims')}
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
          onClick={() => setActiveTab('mat')}
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
          /* Parâmetros Dimensionais */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {model.paramDefs.map((def) => {
              const isEp = def.key === 'Ep';
              const val = params[def.key] ?? model.defaultParams[def.key] ?? 0;
              const minVal = isEp ? 0.1 : def.min;
              const stepVal = isEp ? 0.05 : def.step;

              const handleStep = (direction: 1 | -1) => {
                const nextVal = Math.max(minVal, Math.min(def.max, val + direction * stepVal));
                onParamChange(def.key, Math.round(nextVal * 100) / 100);
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
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cad-text-primary)' }}>
                        {def.label}
                      </span>
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
                          value={val}
                          onChange={(e) => {
                            const parsed = parseFloat(e.target.value);
                            onParamChange(def.key, isNaN(parsed) ? 0 : parsed);
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
                      value={val}
                      onChange={(e) => onParamChange(def.key, parseFloat(e.target.value))}
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
              <div style={{ fontWeight: 600, color: 'var(--cad-text-primary)', marginBottom: 4 }}>
                Especificação do Material:
              </div>
              <div>{currentProfile.description}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                <div>
                  <span style={{ color: 'var(--cad-text-dim)' }}>Espessura base: </span>
                  <span className="cad-mono" style={{ color: 'var(--cad-accent)', fontWeight: 600 }}>
                    {currentProfile.thickness} mm
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--cad-text-dim)' }}>Acabamento: </span>
                  <span style={{ color: 'var(--cad-text-secondary)' }}>Frente Couchê</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
