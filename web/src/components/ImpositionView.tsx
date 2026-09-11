import React, { useState, useMemo } from 'react';
import type { DielineResult } from '../engine/types';
import type { ImpositionParams, SheetFormat } from '../engine/imposition';
import {
  STANDARD_SHEETS,
  calculateImposition,
} from '../engine/imposition';
import { Percent, Box, Scissors } from 'lucide-react';

interface ImpositionViewProps {
  dieline: DielineResult;
}

export const ImpositionView: React.FC<ImpositionViewProps> = ({ dieline }) => {
  const [selectedSheetId, setSelectedSheetId] = useState<string>('chapa_800x1200');
  const [customSheet, setCustomSheet] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 800,
  });
  const [marginMargin, setMarginMargin] = useState<number>(15);
  const [gutter, setGutter] = useState<number>(5);
  const [allowRotation, setAllowRotation] = useState<boolean>(true);

  // Determina dimensões da folha
  const sheetDimensions = useMemo(() => {
    if (selectedSheetId === 'custom') {
      return customSheet;
    }
    const found = STANDARD_SHEETS.find((s) => s.id === selectedSheetId);
    return found ? { width: found.width, height: found.height } : customSheet;
  }, [selectedSheetId, customSheet]);

  // Executa o cálculo de imposição
  const imposition = useMemo(() => {
    const params: ImpositionParams = {
      sheetWidth: sheetDimensions.width,
      sheetHeight: sheetDimensions.height,
      marginMargin,
      gutter,
      allowRotation,
    };
    return calculateImposition(dieline.bounds, params);
  }, [dieline.bounds, sheetDimensions, marginMargin, gutter, allowRotation]);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* 1. Painel Esquerdo de Configuração de Imposição */}
      <div
        className="glass-panel"
        style={{
          width: 340,
          height: '100%',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          overflowY: 'auto',
          borderRight: '1px solid var(--border-color)',
        }}
      >
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scissors size={18} color="#3B82F6" />
            Aproveitamento & Imposição
          </h3>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            Distribuição de poses na chapa para corte e vinco na gráfica.
          </p>
        </div>

        {/* Seletor de Formato de Chapa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#94A3B8' }}>Formato da Chapa / Folha</label>
          <select
            value={selectedSheetId}
            onChange={(e) => setSelectedSheetId(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: '#1E293B',
              border: '1px solid #334155',
              color: '#F8FAFC',
              fontSize: 13,
            }}
          >
            {STANDARD_SHEETS.map((s: SheetFormat) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.width} x {s.height} mm)
              </option>
            ))}
          </select>
        </div>

        {selectedSheetId === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94A3B8' }}>Largura (mm)</label>
              <input
                type="number"
                value={customSheet.width}
                onChange={(e) => setCustomSheet({ ...customSheet, width: Number(e.target.value) })}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  background: '#1E293B',
                  border: '1px solid #334155',
                  color: '#FFF',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94A3B8' }}>Altura (mm)</label>
              <input
                type="number"
                value={customSheet.height}
                onChange={(e) => setCustomSheet({ ...customSheet, height: Number(e.target.value) })}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  background: '#1E293B',
                  border: '1px solid #334155',
                  color: '#FFF',
                }}
              />
            </div>
          </div>
        )}

        {/* Margens e Canaleta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: '#94A3B8' }}>Pinça / Margem</label>
            <input
              type="number"
              value={marginMargin}
              min={0}
              max={100}
              onChange={(e) => setMarginMargin(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '8px 10px',
                marginTop: 4,
                borderRadius: 6,
                background: '#1E293B',
                border: '1px solid #334155',
                color: '#FFF',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#94A3B8' }}>Canaleta (Espaço)</label>
            <input
              type="number"
              value={gutter}
              min={0}
              max={50}
              onChange={(e) => setGutter(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '8px 10px',
                marginTop: 4,
                borderRadius: 6,
                background: '#1E293B',
                border: '1px solid #334155',
                color: '#FFF',
              }}
            />
          </div>
        </div>

        {/* Opção de Rotação */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ fontSize: 13, color: '#E2E8F0' }}>Otimizar com rotação (90°)</span>
          <input
            type="checkbox"
            checked={allowRotation}
            onChange={(e) => setAllowRotation(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#3B82F6', cursor: 'pointer' }}
          />
        </div>

        <div style={{ borderTop: '1px solid #334155', paddingTop: 16 }}>
          <h4 style={{ fontSize: 13, color: '#94A3B8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Métricas de Rendimento
          </h4>

          {/* Cards de Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#1E293B', padding: 12, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38BDF8', fontSize: 12 }}>
                <Box size={14} /> Total Poses
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#FFF', marginTop: 4 }}>
                {imposition.totalPoses}
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                Grade: {imposition.posesX} x {imposition.posesY}
              </div>
            </div>

            <div style={{ background: '#1E293B', padding: 12, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10B981', fontSize: 12 }}>
                <Percent size={14} /> Rendimento
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#10B981', marginTop: 4 }}>
                {imposition.utilizationPercentage}%
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                Apara: {imposition.wastePercentage}%
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div>Área da Folha: <strong>{imposition.sheetAreaM2} m²</strong></div>
            <div>Área Útil Cortada: <strong>{imposition.usedAreaM2} m²</strong></div>
            <div>Orientação aplicada: <strong>{imposition.rotated ? 'Rotacionada 90°' : 'Padrão 0°'}</strong></div>
          </div>
        </div>
      </div>

      {/* 2. Área Central de Desenho da Chapa Imposta */}
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          background: '#0B0F17',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* SVG com a folha e todas as poses distribuídas */}
          <svg
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
              borderRadius: 8,
              border: '2px solid #334155',
              background: '#1E293B',
            }}
            viewBox={`0 0 ${imposition.sheetWidth} ${imposition.sheetHeight}`}
          >
            {/* Folha / Chapa */}
            <rect
              x="0"
              y="0"
              width={imposition.sheetWidth}
              height={imposition.sheetHeight}
              fill="#F8FAFC"
            />

            {/* Linha limite de sangria/margem */}
            <rect
              x={marginMargin}
              y={marginMargin}
              width={Math.max(0, imposition.sheetWidth - marginMargin * 2)}
              height={Math.max(0, imposition.sheetHeight - marginMargin * 2)}
              fill="none"
              stroke="#CBD5E1"
              strokeDasharray="6,4"
              strokeWidth="1.5"
            />

            {/* Cada Pose Individual da Faca */}
            {imposition.items.map((item, idx) => (
              <g key={idx}>
                {/* Retângulo de ocupação da embalagem */}
                <rect
                  x={item.x}
                  y={item.y}
                  width={item.width}
                  height={item.height}
                  fill="rgba(59, 130, 246, 0.08)"
                  stroke="#3B82F6"
                  strokeWidth="1"
                />

                {/* Perímetro da faca aberta simplificado */}
                <rect
                  x={item.x + 2}
                  y={item.y + 2}
                  width={Math.max(0, item.width - 4)}
                  height={Math.max(0, item.height - 4)}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="1.2"
                />

                {/* Número da Pose */}
                <text
                  x={item.x + item.width / 2}
                  y={item.y + item.height / 2 + 5}
                  fontSize={Math.max(12, Math.min(24, item.width * 0.06))}
                  fontWeight="bold"
                  fill="#1E293B"
                  textAnchor="middle"
                  opacity="0.75"
                >
                  #{idx + 1}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};
