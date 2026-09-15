import React from 'react';
import type { PackagingModel, CardboardProfile, BoundingBox2D } from '../engine/types';
import { STANDARD_PROFILES } from '../engine/types';
import { Sliders, Layers } from 'lucide-react';

interface ParameterPanelProps {
  model: PackagingModel;
  params: Record<string, number>;
  selectedProfileId: string;
  onParamChange: (key: string, value: number) => void;
  onProfileChange: (profile: CardboardProfile) => void;
  bounds: BoundingBox2D;
}

export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  model,
  params,
  selectedProfileId,
  onParamChange,
  onProfileChange,
  bounds,
}) => {
  // Presets rápidos para facilitar o operador
  const applyPreset = (size: 'P' | 'M' | 'G') => {
    if (size === 'P') {
      onParamChange('L', 200);
      onParamChange('B', 150);
      onParamChange('H', 100);
    } else if (size === 'M') {
      onParamChange('L', 300);
      onParamChange('B', 200);
      onParamChange('H', 150);
    } else if (size === 'G') {
      onParamChange('L', 450);
      onParamChange('B', 300);
      onParamChange('H', 250);
    }
  };

  return (
    <div
      className="glass-panel"
      style={{
        width: 360,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 18px',
        gap: 20,
        overflowY: 'auto',
        borderRight: '1px solid var(--border-color)',
      }}
    >
      {/* 1. Header do Modelo */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 4,
              background: '#c53236',
              color: '#FFFFFF',
              letterSpacing: 0.5,
            }}
          >
            {model.code}
          </span>
          <span style={{ fontSize: 12, color: '#35a89e', fontWeight: 600 }}>{model.category}</span>
          {model.status === 'PASS' && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(53, 168, 158, 0.2)', color: '#35a89e', border: '1px solid rgba(53, 168, 158, 0.4)' }}>
              ✓ Ground Truth C# 100%
            </span>
          )}

        </div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#F8FAFC', marginTop: 6 }}>
          {model.name}
        </h2>
        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, lineHeight: 1.4 }}>
          {model.description}
        </p>

      </div>

      {/* 2. Resumo da Faca Aberta (Tamanho de Prancha) */}
      <div
        style={{
          background: '#0d1111',
          borderRadius: 8,
          padding: '12px 14px',
          border: '1px solid #1c2424',
        }}
      >
        <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Faca Aberta (Formato Mínimo)
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#35a89e', marginTop: 4 }}>
          {Math.round(bounds.width)} x {Math.round(bounds.height)} mm
        </div>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
          Área unitária: {((bounds.width * bounds.height) / 1_000_000).toFixed(3)} m²
        </div>
      </div>

      {/* 3. Seletor de Perfil de Papelão / Espessura */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Layers size={14} color="#35a89e" />
          Material & Espessura
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
            padding: '9px 12px',
            borderRadius: 8,
            background: '#121616',
            border: '1px solid #242c2c',
            color: '#F8FAFC',
            fontSize: 13,
          }}
        >
          {STANDARD_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.thickness} mm)
            </option>
          ))}
        </select>
        {(() => {
          const currentProf = STANDARD_PROFILES.find((p) => p.id === selectedProfileId);
          return currentProf ? (
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, lineHeight: 1.3 }}>
              {currentProf.description}
            </div>
          ) : null;
        })()}
      </div>

      {/* 4. Botões de Presets Rápidos */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={14} color="#35a89e" />
            Parâmetros Dimensionais
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['P', 'M', 'G'] as const).map((s) => (
              <button
                key={s}
                onClick={() => applyPreset(s)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  background: '#121616',
                  color: '#94A3B8',
                  border: '1px solid #242c2c',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders e Inputs de Cada Parâmetro */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {model.paramDefs.map((def) => {
            const isEp = def.key === 'Ep';
            const val = params[def.key] ?? model.defaultParams[def.key];
            const minVal = isEp ? 0.1 : def.min;
            const stepVal = isEp ? 0.05 : def.step;
            return (
              <div key={def.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#CBD5E1' }}>{def.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      min={minVal}
                      max={def.max}
                      step={stepVal}
                      value={val}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        onParamChange(def.key, isNaN(parsed) ? 0 : parsed);
                      }}
                      style={{
                        width: 72,
                        padding: '4px 6px',
                        textAlign: 'right',
                        borderRadius: 6,
                        background: '#121616',
                        border: '1px solid #242c2c',
                        color: '#FFF',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: 11, color: '#64748B' }}>{def.unit}</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={minVal}
                  max={def.max}
                  step={stepVal}
                  value={val}
                  onChange={(e) => onParamChange(def.key, parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    cursor: 'pointer',
                    accentColor: '#35a89e',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
