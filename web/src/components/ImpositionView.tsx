import React, { useState, useMemo } from 'react';
import type { DielineResult } from '../engine/types';
import type { ImpositionParams, SheetFormat } from '../engine/imposition';
import {
  STANDARD_SHEETS,
  calculateImpositionCAD,
} from '../engine/imposition';
import { toPackagingGeometry } from '../engine/geometry';
import { exportImpositionToDXF } from '../engine/dxfExporter';
import { Percent, Box, Scissors, Download, Compass, Layers } from 'lucide-react';

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
  const [orientationMode, setOrientationMode] = useState<'auto' | '0' | '90'>('auto');

  // Determina dimensões da folha
  const sheetDimensions = useMemo(() => {
    if (selectedSheetId === 'custom') {
      return customSheet;
    }
    const found = STANDARD_SHEETS.find((s) => s.id === selectedSheetId);
    return found ? { width: found.width, height: found.height } : customSheet;
  }, [selectedSheetId, customSheet]);

  // Converte a faca para a estrutura geométrica unificada PackagingGeometry
  const packagingGeom = useMemo(() => {
    return toPackagingGeometry(dieline);
  }, [dieline]);

  // Executa o cálculo rigoroso de CAD para a imposição
  const imposition = useMemo(() => {
    const params: ImpositionParams = {
      sheetWidth: sheetDimensions.width,
      sheetHeight: sheetDimensions.height,
      marginMargin,
      gutter,
      allowRotation: orientationMode !== '0',
      forceOrientation: orientationMode,
    };
    return calculateImpositionCAD(packagingGeom, params);
  }, [packagingGeom, sheetDimensions, marginMargin, gutter, orientationMode]);

  const handleExportDxf = () => {
    exportImpositionToDXF(imposition, `imposicao_${imposition.sheetWidth}x${imposition.sheetHeight}_${imposition.totalPoses}poses.dxf`);
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* 1. Painel Esquerdo de Configuração de Imposição */}
      <div
        className="glass-panel"
        style={{
          width: 360,
          height: '100%',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          overflowY: 'auto',
          borderRight: '1px solid var(--border-color)',
        }}
      >
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scissors size={18} color="#35a89e" />
            Imposição Técnica na Chapa
          </h3>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            Distribuição de facas com geometria vetorial real na chapa/folha.
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
              background: '#121616',
              border: '1px solid #242c2c',
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
              <label style={{ fontSize: 11, color: '#94A3B8' }}>Largura X (mm)</label>
              <input
                type="number"
                value={customSheet.width}
                onChange={(e) => setCustomSheet({ ...customSheet, width: Number(e.target.value) })}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  background: '#121616',
                  border: '1px solid #242c2c',
                  color: '#FFF',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94A3B8' }}>Altura Y (mm)</label>
              <input
                type="number"
                value={customSheet.height}
                onChange={(e) => setCustomSheet({ ...customSheet, height: Number(e.target.value) })}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  background: '#121616',
                  border: '1px solid #242c2c',
                  color: '#FFF',
                }}
              />
            </div>
          </div>
        )}

        {/* Margens e Canaleta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: '#94A3B8' }}>Pinça / Margem (mm)</label>
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
                background: '#121616',
                border: '1px solid #242c2c',
                color: '#FFF',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#94A3B8' }}>Canaleta (mm)</label>
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
                background: '#121616',
                border: '1px solid #242c2c',
                color: '#FFF',
              }}
            />
          </div>
        </div>

        {/* Opção de Orientação e Comparação PLMPackLib */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Compass size={14} color="#35a89e" /> Orientação das Poses
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button
              type="button"
              onClick={() => setOrientationMode('auto')}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: orientationMode === 'auto' ? '1px solid #35a89e' : '1px solid #242c2c',
                background: orientationMode === 'auto' ? 'rgba(53, 168, 158, 0.2)' : '#121616',
                color: orientationMode === 'auto' ? '#35a89e' : '#94A3B8',
              }}
            >
              Auto (PLM)
            </button>
            <button
              type="button"
              onClick={() => setOrientationMode('0')}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: orientationMode === '0' ? '1px solid #35a89e' : '1px solid #242c2c',
                background: orientationMode === '0' ? 'rgba(53, 168, 158, 0.2)' : '#121616',
                color: orientationMode === '0' ? '#35a89e' : '#94A3B8',
              }}
            >
              Forçar 0°
            </button>
            <button
              type="button"
              onClick={() => setOrientationMode('90')}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: orientationMode === '90' ? '1px solid #35a89e' : '1px solid #242c2c',
                background: orientationMode === '90' ? 'rgba(53, 168, 158, 0.2)' : '#121616',
                color: orientationMode === '90' ? '#35a89e' : '#94A3B8',
              }}
            >
              Forçar 90°
            </button>
          </div>
        </div>

        {/* Comparativo de Soluções (0° vs 90°) */}
        <div
          style={{
            background: '#121616',
            border: '1px solid #242c2c',
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ color: '#94A3B8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Layers size={13} color="#35a89e" /> Análise Comparativa
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#E2E8F0' }}>
            <span>Solução 0°:</span>
            <strong>{imposition.solution0.totalPoses} poses ({imposition.solution0.utilizationPercentage}%)</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#E2E8F0' }}>
            <span>Solução 90°:</span>
            <strong>{imposition.solution90.totalPoses} poses ({imposition.solution90.utilizationPercentage}%)</strong>
          </div>
        </div>

        {/* Cards de Métricas */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: 14 }}>
          <h4 style={{ fontSize: 13, color: '#94A3B8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Rendimento da Produção
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#121616', padding: 12, borderRadius: 8, border: '1px solid #242c2c' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#35a89e', fontSize: 12 }}>
                <Box size={14} /> Poses na Chapa
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#FFF', marginTop: 4 }}>
                {imposition.totalPoses}
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                Grade: {imposition.posesX} X × {imposition.posesY} Y
              </div>
            </div>

            <div style={{ background: '#121616', padding: 12, borderRadius: 8, border: '1px solid #242c2c' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#35a89e', fontSize: 12 }}>
                <Percent size={14} /> Aproveitamento
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#35a89e', marginTop: 4 }}>
                {imposition.utilizationPercentage}%
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                Apara: {imposition.wastePercentage}%
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div>Área Total da Chapa: <strong>{imposition.sheetAreaM2} m²</strong></div>
            <div>Área das Embalagens: <strong>{imposition.usedAreaM2} m²</strong></div>
            <div>Tamanho Unitário Faca: <strong>{Math.round(imposition.itemWidth)} × {Math.round(imposition.itemHeight)} mm</strong></div>
            <div>Orientação Escolhida: <strong>{imposition.selectedOrientation === '90' ? 'Rotacionada 90°' : 'Padrão 0°'}</strong></div>
          </div>
        </div>

        {/* Botão de Exportação DXF da Imposição */}
        <button
          type="button"
          onClick={handleExportDxf}
          style={{
            marginTop: 'auto',
            padding: '12px 16px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #35a89e 0%, #1f6e67 100%)',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(53, 168, 158, 0.3)',
          }}
        >
          <Download size={16} /> Exportar Imposição DXF
        </button>
      </div>

      {/* 2. Área Central de Desenho da Chapa Imposta com Geometria Real */}
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 30,
          background: '#000000',
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
          {/* SVG com a folha e todas as poses distribuídas com geometria real */}
          <svg
            style={{
              maxWidth: '92%',
              maxHeight: '92%',
              filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.7))',
            }}
            viewBox={`-20 -20 ${imposition.sheetWidth + 40} ${imposition.sheetHeight + 40}`}
          >
            {/* Definições de Estilos */}
            <defs>
              <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#F1F5F9" strokeWidth="0.5" />
              </pattern>
            </defs>

            {/* Folha Base / Prancha Gráfica */}
            <rect
              x={0}
              y={0}
              width={imposition.sheetWidth}
              height={imposition.sheetHeight}
              fill="#FFFFFF"
              stroke="#64748B"
              strokeWidth="2"
              rx="4"
            />

            {/* Linha Tracejada de Margem / Pinça */}
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

            {/* Cada Pose Individual com a GEOMETRIA REAL da Faca CAD */}
            {imposition.bestSolution.poses.map((pose) => {
              const geom = pose.geometry;
              // Para converter coordenadas de CAD (Y para cima) para SVG (Y para baixo) dentro da chapa:
              const toSvgY = (cadY: number) => imposition.sheetHeight - cadY;

              return (
                <g key={`pose-${pose.index}`} id={`pose-${pose.index}`}>
                  {/* Fundo sutil de bounding box da pose */}
                  <rect
                    x={pose.x}
                    y={toSvgY(pose.y + pose.height)}
                    width={pose.width}
                    height={pose.height}
                    fill="rgba(53, 168, 158, 0.04)"
                    stroke="rgba(53, 168, 158, 0.25)"
                    strokeWidth="0.5"
                  />

                  {/* Linhas Reais da Faca (Corte, Vinco, Picote) */}
                  {geom.segments.map((seg, sIdx) => {
                    const isCrease = seg.type === 'crease';
                    const isPerfo = seg.type === 'perfo';
                    const strokeColor = isCrease ? '#35a89e' : isPerfo ? '#10B981' : '#c53236';
                    const strokeDash = isCrease ? '4,3' : isPerfo ? '2,2' : undefined;

                    return (
                      <line
                        key={`seg-${sIdx}`}
                        x1={seg.x0}
                        y1={toSvgY(seg.y0)}
                        x2={seg.x1}
                        y2={toSvgY(seg.y1)}
                        stroke={strokeColor}
                        strokeWidth="1"
                        strokeDasharray={strokeDash}
                      />
                    );
                  })}

                  {/* Arcos Reais da Faca */}
                  {geom.arcs && geom.arcs.map((arc, aIdx) => {
                    const isCrease = arc.type === 'crease';
                    const isPerfo = arc.type === 'perfo';
                    const strokeColor = isCrease ? '#35a89e' : isPerfo ? '#10B981' : '#c53236';
                    const radBeg = (arc.startAngle * Math.PI) / 180;
                    const radEnd = (arc.endAngle * Math.PI) / 180;
                    const x1 = arc.cx + arc.r * Math.cos(radBeg);
                    const y1 = toSvgY(arc.cy + arc.r * Math.sin(radBeg));
                    const x2 = arc.cx + arc.r * Math.cos(radEnd);
                    const y2 = toSvgY(arc.cy + arc.r * Math.sin(radEnd));
                    const largeArc = Math.abs(arc.endAngle - arc.startAngle) > 180 ? 1 : 0;

                    return (
                      <path
                        key={`arc-${aIdx}`}
                        d={`M ${x1} ${y1} A ${arc.r} ${arc.r} 0 ${largeArc} 1 ${x2} ${y2}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="1"
                      />
                    );
                  })}

                  {/* Etiqueta Discreta com Número da Pose */}
                  <text
                    x={pose.x + pose.width / 2}
                    y={toSvgY(pose.y + pose.height / 2) + 4}
                    fontSize={Math.max(10, Math.min(20, pose.width * 0.05))}
                    fontWeight="700"
                    fill="#475569"
                    textAnchor="middle"
                    opacity="0.6"
                    pointerEvents="none"
                  >
                    #{pose.index}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
