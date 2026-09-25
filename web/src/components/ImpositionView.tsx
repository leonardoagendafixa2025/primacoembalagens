import React, { useState, useMemo } from 'react';
import type { PackagingModel, DielineResult } from '../engine/types';
import type { ImpositionParams, SheetFormat } from '../engine/imposition';
import {
  STANDARD_SHEETS,
  calculateImpositionCAD,
} from '../engine/imposition';
import { toPackagingGeometry } from '../engine/geometry';
import { exportImpositionToDXF } from '../engine/dxfExporter';
import { Percent, Box, Scissors, Download, Compass, Layers, Ruler, Lock, Unlock, RotateCcw } from 'lucide-react';

interface ImpositionViewProps {
  dieline: DielineResult;
  model?: PackagingModel;
  params?: Record<string, number>;
  onParamChange?: (key: string, value: number, extraParams?: Record<string, number>) => void;
}

export const ImpositionView: React.FC<ImpositionViewProps> = ({
  dieline,
  model,
  params,
  onParamChange,
}) => {
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

  // Parâmetros e manipuladores de escala da faca
  const origL = params?.origL || model?.defaultParams?.origL || model?.defaultParams?.L || dieline.bounds.width || 300;
  const origB = params?.origB || model?.defaultParams?.origB || model?.defaultParams?.B || dieline.bounds.height || 200;
  const currentL = params?.L ?? Math.round(dieline.bounds.width * 10) / 10;
  const currentB = params?.B ?? Math.round(dieline.bounds.height * 10) / 10;
  const currentScale = params?.scale ?? (origL > 0 ? Math.round((currentL / origL) * 1000) / 10 : 100);
  const lockRatio = (params?.lockRatio ?? 1) === 1;

  const handleToggleLockRatio = () => {
    onParamChange?.('lockRatio', lockRatio ? 0 : 1);
  };

  const handleWidthChange = (newL: number) => {
    const val = Math.max(10, Math.min(10000, Number(newL) || 10));
    if (lockRatio && origL > 0) {
      const ratio = origB / origL;
      const newB = Math.round(val * ratio * 10) / 10;
      const newScale = Math.round((val / origL) * 1000) / 10;
      onParamChange?.('L', val, { B: newB, scale: newScale });
    } else {
      const newScale = origL > 0 ? Math.round((val / origL) * 1000) / 10 : 100;
      onParamChange?.('L', val, { scale: newScale });
    }
  };

  const handleHeightChange = (newB: number) => {
    const val = Math.max(10, Math.min(10000, Number(newB) || 10));
    if (lockRatio && origB > 0) {
      const invRatio = origL / origB;
      const newL = Math.round(val * invRatio * 10) / 10;
      const newScale = Math.round((val / origB) * 1000) / 10;
      onParamChange?.('B', val, { L: newL, scale: newScale });
    } else {
      const newScale = origB > 0 ? Math.round((val / origB) * 1000) / 10 : 100;
      onParamChange?.('B', val, { scale: newScale });
    }
  };

  const handleScalePercent = (targetScale: number) => {
    const sc = Math.max(5, Math.min(1000, Number(targetScale) || 100));
    const newL = Math.round(origL * (sc / 100) * 10) / 10;
    const newB = Math.round(origB * (sc / 100) * 10) / 10;
    onParamChange?.('scale', sc, { L: newL, B: newB });
  };

  const handleDeltaScale = (deltaPercent: number) => {
    const newScale = Math.round((currentScale + deltaPercent) * 10) / 10;
    handleScalePercent(newScale);
  };

  const handleResetToOriginal = () => {
    onParamChange?.('scale', 100, { L: origL, B: origB });
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--cad-bg-app)' }}>
      {/* 1. Painel Esquerdo de Configuração de Imposição */}
      <div
        className="cad-panel"
        style={{
          width: 'var(--cad-sidebar-width)',
          height: '100%',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflowY: 'auto',
          borderRight: '1px solid var(--cad-border-subtle)',
          userSelect: 'none',
        }}
      >
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--cad-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scissors size={15} color="var(--cad-accent)" />
            Imposição Técnica na Chapa
          </h3>
          <p style={{ fontSize: 11, color: 'var(--cad-text-muted)', marginTop: 4, lineHeight: 1.4 }}>
            Distribuição e aproveitamento de facas na folha gráfica com rotação e encaixe ótimo.
          </p>
        </div>

        {/* Seletor de Formato de Chapa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--cad-text-secondary)' }}>Formato da Chapa / Folha</label>
          <select
            value={selectedSheetId}
            onChange={(e) => setSelectedSheetId(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: 'var(--cad-radius-sm)',
              background: 'var(--cad-bg-input)',
              border: '1px solid var(--cad-border-default)',
              color: 'var(--cad-text-primary)',
              fontSize: 12,
              outline: 'none',
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

        {/* Dimensões da Faca (Unitária) e Ajuste Rápido de Escala na Folha */}
        <div
          style={{
            background: '#121616',
            border: '1px solid #242c2c',
            borderRadius: 8,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#35a89e', fontSize: 12, fontWeight: 700 }}>
              <Ruler size={13} color="#35a89e" />
              <span>Dimensões da Faca (Pose)</span>
            </div>
            {onParamChange && (
              <button
                type="button"
                onClick={handleToggleLockRatio}
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  border: lockRatio ? '1px solid #35a89e' : '1px solid #242c2c',
                  background: lockRatio ? 'rgba(53, 168, 158, 0.2)' : 'transparent',
                  color: lockRatio ? '#35a89e' : '#64748B',
                  cursor: 'pointer',
                }}
                title={lockRatio ? 'Proporção travada (L e B escalam juntos)' : 'Proporção livre'}
              >
                {lockRatio ? <Lock size={10} color="#35a89e" /> : <Unlock size={10} />}
                <span>{lockRatio ? 'Proporcional' : 'Livre'}</span>
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: '#94A3B8', display: 'block', marginBottom: 2 }}>Largura X (mm)</label>
              <input
                type="number"
                value={currentL}
                onChange={(e) => handleWidthChange(parseFloat(e.target.value))}
                disabled={!onParamChange}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 4,
                  background: '#0d1010',
                  border: '1px solid #242c2c',
                  color: '#FFF',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#94A3B8', display: 'block', marginBottom: 2 }}>Altura Y (mm)</label>
              <input
                type="number"
                value={currentB}
                onChange={(e) => handleHeightChange(parseFloat(e.target.value))}
                disabled={!onParamChange}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 4,
                  background: '#0d1010',
                  border: '1px solid #242c2c',
                  color: '#FFF',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>

          {onParamChange && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 4, borderTop: '1px solid #1c2222' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#94A3B8' }}>
                <span>Escala: <strong style={{ color: '#35a89e' }}>{currentScale}%</strong></span>
                {(Math.abs(currentL - origL) > 0.5 || Math.abs(currentB - origB) > 0.5) && (
                  <button
                    type="button"
                    onClick={handleResetToOriginal}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#35a89e',
                      fontSize: 10,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    title="Restaurar tamanho original 1:1"
                  >
                    <RotateCcw size={10} /> Reset 1:1 ({origL} × {origB})
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {[-5, -2, 0, 2, 5].map((delta) => {
                  const isZero = delta === 0;
                  return (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => (isZero ? handleResetToOriginal() : handleDeltaScale(delta))}
                      style={{
                        padding: '4px 0',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 3,
                        border: '1px solid #242c2c',
                        background: '#0d1010',
                        color: isZero ? '#35a89e' : '#94A3B8',
                        cursor: 'pointer',
                      }}
                      title={isZero ? 'Redefinir para 100%' : `${delta > 0 ? '+' : ''}${delta}%`}
                    >
                      {isZero ? '100%' : `${delta > 0 ? '+' : ''}${delta}%`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

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

                    let delta = arc.endAngle - arc.startAngle;
                    while (delta < 0) delta += 360;
                    while (delta > 360) delta -= 360;

                    // C?rculo completo (360?)
                    if (Math.abs(delta - 360) < 1e-3 || delta === 0) {
                      return (
                        <circle
                          key={`arc-${aIdx}`}
                          cx={arc.cx}
                          cy={toSvgY(arc.cy)}
                          r={arc.r}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="1"
                        />
                      );
                    }

                    const radBeg = (arc.startAngle * Math.PI) / 180;
                    const radEnd = (arc.endAngle * Math.PI) / 180;
                    const x1 = arc.cx + arc.r * Math.cos(radBeg);
                    const y1 = toSvgY(arc.cy + arc.r * Math.sin(radBeg));
                    const x2 = arc.cx + arc.r * Math.cos(radEnd);
                    const y2 = toSvgY(arc.cy + arc.r * Math.sin(radEnd));
                    const largeArc = delta > 180 ? 1 : 0;

                    // sweep-flag = 0 porque toSvgY inverte o eixo vertical Y
                    return (
                      <path
                        key={`arc-${aIdx}`}
                        d={`M ${x1} ${y1} A ${arc.r} ${arc.r} 0 ${largeArc} 0 ${x2} ${y2}`}
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
