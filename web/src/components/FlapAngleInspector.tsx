import React, { useState, useMemo } from 'react';
import type { HingeControlInfo } from '../engine/foldingEngine';
import {
  Sliders,
  RotateCcw,
  X,
  Search,
  MousePointerClick,
  Info,
} from 'lucide-react';

interface FlapAngleInspectorProps {
  hinges: HingeControlInfo[];
  selectedPanelId: string | null;
  onSelectPanel: (panelId: string | null) => void;
  onAngleChange: (panelId: string, angleDeg: number) => void;
  onResetAngle: (panelId: string) => void;
  onResetAll: () => void;
  onClose: () => void;
  isOpen: boolean;
}

const PRESET_ANGLES = [
  { label: '-180°', val: -180 },
  { label: '-90°', val: -90 },
  { label: '-45°', val: -45 },
  { label: '0° Plano', val: 0 },
  { label: '+45°', val: 45 },
  { label: '+90° Reto', val: 90 },
  { label: '+180°', val: 180 },
];

export const FlapAngleInspector: React.FC<FlapAngleInspectorProps> = ({
  hinges,
  selectedPanelId,
  onSelectPanel,
  onAngleChange,
  onResetAngle,
  onResetAll,
  onClose,
  isOpen,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const selectedHinge = useMemo(() => {
    return hinges.find((h) => h.panelId === selectedPanelId) || null;
  }, [hinges, selectedPanelId]);

  const modifiedCount = useMemo(() => {
    return hinges.filter((h) => h.isModified).length;
  }, [hinges]);

  const filteredHinges = useMemo(() => {
    if (!searchTerm.trim()) return hinges;
    const term = searchTerm.toLowerCase();
    return hinges.filter(
      (h) =>
        h.panelName.toLowerCase().includes(term) ||
        (h.parentName && h.parentName.toLowerCase().includes(term)) ||
        h.panelId.toLowerCase().includes(term)
    );
  }, [hinges, searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        bottom: 14,
        width: 380,
        maxWidth: 'calc(100% - 28px)',
        background: 'var(--cad-bg-panel)',
        border: '1px solid var(--cad-border-default)',
        borderRadius: 'var(--cad-radius-md)',
        boxShadow: 'var(--cad-shadow-panel)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* 1. Header do Inspetor */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--cad-bg-header)',
          borderBottom: '1px solid var(--cad-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sliders size={15} color="var(--cad-accent)" />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--cad-text-primary)' }}>
              ÂNGULOS DE DOBRA (GRAUS)
            </div>
            <div style={{ fontSize: 10, color: 'var(--cad-text-muted)' }}>
              Padrão ArtiosCAD & Prinect Package Design
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {modifiedCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(0, 210, 180, 0.15)',
                color: 'var(--cad-accent)',
                border: '1px solid rgba(0, 210, 180, 0.3)',
              }}
            >
              {modifiedCount} modif.
            </span>
          )}
          <button
            type="button"
            className="cad-tool-btn"
            style={{ width: 24, height: 24 }}
            onClick={onClose}
            title="Fechar Inspetor"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 2. Dica Rápida de Interatividade 3D */}
      <div
        style={{
          padding: '8px 14px',
          background: 'rgba(0, 210, 180, 0.04)',
          borderBottom: '1px solid var(--cad-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 10.5,
          color: 'var(--cad-text-secondary)',
        }}
      >
        <MousePointerClick size={13} color="var(--cad-accent)" />
        <span>Clique diretamente em qualquer aba 3D para editá-la</span>
      </div>

      {/* 3. Painel de Controle da Aba Selecionada */}
      <div
        style={{
          padding: 14,
          background: selectedHinge ? 'var(--cad-bg-panel-elevated)' : 'transparent',
          borderBottom: '1px solid var(--cad-border-subtle)',
        }}
      >
        {selectedHinge ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Título e Info do Vinco */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cad-accent)' }}>
                  {selectedHinge.panelName}
                </div>
                <div style={{ fontSize: 10, color: 'var(--cad-text-muted)', marginTop: 2 }}>
                  Vinco: {selectedHinge.creaseLength} mm • Conectado à {selectedHinge.parentName || 'Base'}
                </div>
              </div>

              {selectedHinge.isModified && (
                <button
                  type="button"
                  onClick={() => onResetAngle(selectedHinge.panelId)}
                  className="cad-btn"
                  style={{
                    padding: '3px 7px',
                    fontSize: 10,
                    gap: 4,
                    color: 'var(--cad-accent)',
                    borderColor: 'var(--cad-accent-border)',
                  }}
                  title="Restaurar ângulo nominal do projeto"
                >
                  <RotateCcw size={10} />
                  <span>Nominal ({selectedHinge.nominalAngleDeg}°)</span>
                </button>
              )}
            </div>

            {/* Input Numérico Direto em Graus */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--cad-text-secondary)', fontWeight: 600 }}>
                Ângulo:
              </span>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--cad-bg-input)',
                  border: '1px solid var(--cad-border-default)',
                  borderRadius: 'var(--cad-radius-sm)',
                  padding: '3px 8px',
                }}
              >
                <input
                  type="number"
                  min="-180"
                  max="180"
                  step="0.5"
                  value={selectedHinge.currentAngleDeg}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      onAngleChange(selectedHinge.panelId, Math.max(-180, Math.min(180, val)));
                    }
                  }}
                  className="cad-mono"
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 14,
                    fontWeight: 700,
                    color: selectedHinge.isModified ? 'var(--cad-accent)' : 'var(--cad-text-primary)',
                  }}
                />
                <span className="cad-mono" style={{ fontSize: 12, color: 'var(--cad-text-muted)', fontWeight: 600 }}>
                  °
                </span>
              </div>

              {/* Botões de Micro-Ajuste (+/-) */}
              <div style={{ display: 'flex', gap: 3 }}>
                {[-5, -1, 1, 5].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => {
                      const next = Math.max(-180, Math.min(180, selectedHinge.currentAngleDeg + delta));
                      onAngleChange(selectedHinge.panelId, Math.round(next * 10) / 10);
                    }}
                    className="cad-btn"
                    style={{ padding: '4px 6px', fontSize: 10, minWidth: 26 }}
                  >
                    {delta > 0 ? `+${delta}` : delta}°
                  </button>
                ))}
              </div>
            </div>

            {/* Slider Contínuo de -180° a +180° */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                type="range"
                className="cad-slider"
                min="-180"
                max="180"
                step="0.5"
                value={selectedHinge.currentAngleDeg}
                onChange={(e) => {
                  onAngleChange(selectedHinge.panelId, parseFloat(e.target.value));
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 9,
                  color: 'var(--cad-text-muted)',
                  fontFamily: 'var(--cad-font-mono)',
                }}
              >
                <span>-180°</span>
                <span>-90°</span>
                <span style={{ color: 'var(--cad-text-secondary)' }}>0°</span>
                <span>+90°</span>
                <span>+180°</span>
              </div>
            </div>

            {/* Presets Rápidos de Ângulo (1 Clique) */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              {PRESET_ANGLES.map((preset) => {
                const isActive = Math.abs(selectedHinge.currentAngleDeg - preset.val) < 0.2;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onAngleChange(selectedHinge.panelId, preset.val)}
                    className="cad-btn"
                    style={{
                      flex: '1 1 auto',
                      padding: '3px 6px',
                      fontSize: 10,
                      fontWeight: 600,
                      background: isActive ? 'var(--cad-accent-dim)' : 'transparent',
                      borderColor: isActive ? 'var(--cad-accent)' : 'var(--cad-border-subtle)',
                      color: isActive ? 'var(--cad-accent)' : 'var(--cad-text-muted)',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 10px',
              textAlign: 'center',
              color: 'var(--cad-text-muted)',
              gap: 6,
            }}
          >
            <Info size={20} color="var(--cad-text-dim)" />
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cad-text-secondary)' }}>
              Nenhuma aba selecionada
            </div>
            <div style={{ fontSize: 10 }}>
              Selecione uma aba na lista abaixo ou clique diretamente sobre ela no modelo 3D para ajustar seus graus.
            </div>
          </div>
        )}
      </div>

      {/* 4. Barra de Busca e Ação Global */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--cad-border-subtle)',
          background: 'var(--cad-bg-panel)',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--cad-bg-input)',
            border: '1px solid var(--cad-border-subtle)',
            borderRadius: 'var(--cad-radius-sm)',
            padding: '4px 8px',
          }}
        >
          <Search size={12} color="var(--cad-text-muted)" />
          <input
            type="text"
            placeholder="Filtrar abas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 11,
              width: '100%',
              color: 'var(--cad-text-primary)',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{ color: 'var(--cad-text-muted)', cursor: 'pointer' }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {modifiedCount > 0 && (
          <button
            type="button"
            onClick={onResetAll}
            className="cad-btn"
            style={{
              padding: '4px 8px',
              fontSize: 10,
              gap: 4,
              borderColor: 'var(--cad-border-subtle)',
            }}
            title="Restaurar todas as abas para os ângulos nominais de projeto"
          >
            <RotateCcw size={11} />
            <span>Resetar Todas</span>
          </button>
        )}
      </div>

      {/* 5. Lista de Todas as Abas Articuladas */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {filteredHinges.map((h) => {
          const isSelected = h.panelId === selectedPanelId;
          return (
            <div
              key={h.panelId}
              onClick={() => onSelectPanel(h.panelId)}
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--cad-radius-sm)',
                background: isSelected
                  ? 'var(--cad-accent-dim)'
                  : 'rgba(255, 255, 255, 0.015)',
                border: isSelected
                  ? '1px solid var(--cad-accent)'
                  : '1px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? 'var(--cad-accent)' : 'var(--cad-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {h.panelName}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--cad-text-muted)', marginTop: 1 }}>
                  Vinco: {h.creaseLength} mm • Ordem {h.foldOrder}
                </div>
              </div>

              {/* Badge de Ângulo Atual */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span
                  className="cad-mono"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: h.isModified ? 'rgba(0, 210, 180, 0.2)' : 'var(--cad-bg-input)',
                    color: h.isModified ? 'var(--cad-accent)' : 'var(--cad-text-secondary)',
                    border: `1px solid ${h.isModified ? 'var(--cad-accent-border)' : 'var(--cad-border-subtle)'}`,
                  }}
                >
                  {h.currentAngleDeg > 0 ? `+${h.currentAngleDeg}°` : `${h.currentAngleDeg}°`}
                </span>
              </div>
            </div>
          );
        })}

        {filteredHinges.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--cad-text-muted)',
              fontSize: 11,
            }}
          >
            Nenhuma aba encontrada com "{searchTerm}".
          </div>
        )}
      </div>
    </div>
  );
};
