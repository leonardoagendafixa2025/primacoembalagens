import React, { useState, useMemo } from 'react';
import type { PackagingModel, DielineResult } from '../engine/types';
import type { ImpositionParams, SheetFormat, ImpositionLayoutPattern, StaggerMode } from '../engine/imposition';
import {
  STANDARD_SHEETS,
  calculateImpositionCAD,
} from '../engine/imposition';
import { toPackagingGeometry } from '../engine/geometry';
import { exportImpositionToDXF } from '../engine/dxfExporter';
import {
  Percent,
  Scissors,
  Download,
  Compass,
  Layers,
  Ruler,
  Lock,
  Unlock,
  RotateCcw,
  Sparkles,
  Grid,
  ArrowLeftRight,
  TrendingUp,
} from 'lucide-react';

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
  const [layoutPattern, setLayoutPattern] = useState<ImpositionLayoutPattern>('nested_auto');
  const [staggerMode, setStaggerMode] = useState<StaggerMode>('auto');
  const [customStaggerMm, setCustomStaggerMm] = useState<number>(0);

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

  // Executa o cálculo rigoroso de CAD para a imposição com Encaixe Inteligente
  const imposition = useMemo(() => {
    const impParams: ImpositionParams = {
      sheetWidth: sheetDimensions.width,
      sheetHeight: sheetDimensions.height,
      marginMargin,
      gutter,
      allowRotation: orientationMode !== '0',
      forceOrientation: orientationMode,
      layoutPattern,
      staggerMode,
      customStaggerMm,
    };
    return calculateImpositionCAD(packagingGeom, impParams);
  }, [packagingGeom, sheetDimensions, marginMargin, gutter, orientationMode, layoutPattern, staggerMode, customStaggerMm]);

  // Calcula solução em grade simples como linha de base para cálculo do ganho
  const baselineGrid = useMemo(() => {
    const impParams: ImpositionParams = {
      sheetWidth: sheetDimensions.width,
      sheetHeight: sheetDimensions.height,
      marginMargin,
      gutter,
      allowRotation: orientationMode !== '0',
      forceOrientation: orientationMode,
      layoutPattern: 'grid',
    };
    return calculateImpositionCAD(packagingGeom, impParams);
  }, [packagingGeom, sheetDimensions, marginMargin, gutter, orientationMode]);

  const posesGained = Math.max(0, imposition.totalPoses - baselineGrid.totalPoses);
  const percentPosesGain = baselineGrid.totalPoses > 0 ? Math.round((posesGained / baselineGrid.totalPoses) * 100) : 0;

  const handleExportDxf = () => {
    exportImpositionToDXF(imposition, `imposicao_${imposition.sheetWidth}x${imposition.sheetHeight}_${imposition.totalPoses}poses_${layoutPattern}.dxf`);
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

  // Coordenadas para cotas de bloco
  const poses = imposition.bestSolution.poses;
  const blockMinX = poses.length > 0 ? Math.min(...poses.map((p) => p.x)) : 0;
  const blockMaxX = poses.length > 0 ? Math.max(...poses.map((p) => p.x + p.width)) : 0;
  const blockMinY = poses.length > 0 ? Math.min(...poses.map((p) => p.y)) : 0;
  const blockMaxY = poses.length > 0 ? Math.max(...poses.map((p) => p.y + p.height)) : 0;
  const blockW = Math.round((blockMaxX - blockMinX) * 10) / 10;
  const blockH = Math.round((blockMaxY - blockMinY) * 10) / 10;

  const toSvgY = (cadY: number) => imposition.sheetHeight - cadY;

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
            Distribuição profissional de facas na folha gráfica com encaixe inteligente de alta eficiência.
          </p>
        </div>

        {/* PADRÃO DE ENCAIXE CAD INDUSTRIAL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--cad-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color="#35a89e" />
            Padrão de Encaixe CAD
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              type="button"
              onClick={() => setLayoutPattern('nested_auto')}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                border: layoutPattern === 'nested_auto' ? '1.5px solid #35a89e' : '1px solid #242c2c',
                background: layoutPattern === 'nested_auto' ? 'rgba(53, 168, 158, 0.18)' : '#121616',
                color: layoutPattern === 'nested_auto' ? '#35a89e' : '#94A3B8',
              }}
            >
              <span>🌟 Encaixe Inteligente Automático (Nesting)</span>
              {layoutPattern === 'nested_auto' && <span style={{ fontSize: 10, background: '#35a89e', color: '#000', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>AUTO</span>}
            </button>

            <button
              type="button"
              onClick={() => setLayoutPattern('head_to_foot_rows')}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                border: layoutPattern === 'head_to_foot_rows' ? '1.5px solid #35a89e' : '1px solid #242c2c',
                background: layoutPattern === 'head_to_foot_rows' ? 'rgba(53, 168, 158, 0.18)' : '#121616',
                color: layoutPattern === 'head_to_foot_rows' ? '#35a89e' : '#94A3B8',
              }}
            >
              <span>🔄 Cabeça com Pé - Linhas (180° alternado)</span>
              {layoutPattern === 'head_to_foot_rows' && <span style={{ fontSize: 10, background: '#35a89e', color: '#000', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>ATIVO</span>}
            </button>

            <button
              type="button"
              onClick={() => setLayoutPattern('grid')}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                border: layoutPattern === 'grid' ? '1.5px solid #35a89e' : '1px solid #242c2c',
                background: layoutPattern === 'grid' ? 'rgba(53, 168, 158, 0.18)' : '#121616',
                color: layoutPattern === 'grid' ? '#35a89e' : '#94A3B8',
              }}
            >
              <span>⏹️ Grade Simples Alinhada</span>
              {layoutPattern === 'grid' && <span style={{ fontSize: 10, background: '#35a89e', color: '#000', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>ATIVO</span>}
            </button>
          </div>
        </div>

        {/* DEFASAGEM HORIZONTAL (STAGGER) */}
        {layoutPattern !== 'grid' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#121616', border: '1px solid #242c2c', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#35a89e', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowLeftRight size={13} /> Defasagem do Encaixe (Stagger)
              </label>
              <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>
                {imposition.bestSolution.staggerMm} mm
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <button
                type="button"
                onClick={() => setStaggerMode('auto')}
                style={{
                  padding: '5px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  border: staggerMode === 'auto' ? '1px solid #35a89e' : '1px solid #242c2c',
                  background: staggerMode === 'auto' ? 'rgba(53, 168, 158, 0.2)' : '#0d1010',
                  color: staggerMode === 'auto' ? '#35a89e' : '#94A3B8',
                  cursor: 'pointer',
                }}
              >
                Auto (Máx)
              </button>
              <button
                type="button"
                onClick={() => setStaggerMode('half')}
                style={{
                  padding: '5px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  border: staggerMode === 'half' ? '1px solid #35a89e' : '1px solid #242c2c',
                  background: staggerMode === 'half' ? 'rgba(53, 168, 158, 0.2)' : '#0d1010',
                  color: staggerMode === 'half' ? '#35a89e' : '#94A3B8',
                  cursor: 'pointer',
                }}
              >
                Meio Passo (50%)
              </button>
              <button
                type="button"
                onClick={() => setStaggerMode('none')}
                style={{
                  padding: '5px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  border: staggerMode === 'none' ? '1px solid #35a89e' : '1px solid #242c2c',
                  background: staggerMode === 'none' ? 'rgba(53, 168, 158, 0.2)' : '#0d1010',
                  color: staggerMode === 'none' ? '#35a89e' : '#94A3B8',
                  cursor: 'pointer',
                }}
              >
                Alinhado (0%)
              </button>
            </div>
          </div>
        )}

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: '#94A3B8' }}>Canaleta (mm)</label>
              <button
                type="button"
                onClick={() => setGutter(gutter === 0 ? 5 : 0)}
                style={{
                  fontSize: 10,
                  color: gutter === 0 ? '#35a89e' : '#64748B',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {gutter === 0 ? 'Faca Unificada' : 'Faca Compartilhada?'}
              </button>
            </div>
            <input
              type="number"
              value={gutter}
              min={0}
              max={50}
              onChange={(e) => setGutter(Math.max(0, Number(e.target.value)))}
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

        {/* Opção de Orientação da Folha */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Compass size={14} color="#35a89e" /> Orientação da Chapa
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
              Auto (Melhor)
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
              Padrão 0°
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
              Rotacionada 90°
            </button>
          </div>
        </div>

        {/* Resumo de Rendimento e Ganho de Produção */}
        <div
          style={{
            background: '#121616',
            border: '1px solid #242c2c',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>Total de Poses</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: '#35a89e' }}>{imposition.totalPoses}</span>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>({imposition.posesX} col × {imposition.posesY} lin)</span>
            </div>
          </div>

          {posesGained > 0 && (
            <div
              style={{
                background: 'rgba(53, 168, 158, 0.12)',
                border: '1px solid rgba(53, 168, 158, 0.35)',
                borderRadius: 6,
                padding: '6px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: '#35a89e',
                fontWeight: 600,
              }}
            >
              <TrendingUp size={14} color="#35a89e" />
              <span>+{posesGained} poses adicionais (+{percentPosesGain}%) via encaixe!</span>
            </div>
          )}

          {imposition.bestSolution.interlockGainMm > 0 && (
            <div style={{ fontSize: 11, color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
              <span>Ganho de Penetração:</span>
              <strong style={{ color: '#10B981' }}>{imposition.bestSolution.interlockGainMm} mm / par</strong>
            </div>
          )}

          {/* Barra de Aproveitamento da Chapa */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: '#94A3B8' }}>
              <span>Aproveitamento da Chapa</span>
              <strong style={{ color: '#FFFFFF' }}>{imposition.utilizationPercentage}%</strong>
            </div>
            <div style={{ width: '100%', height: 6, background: '#242c2c', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${imposition.utilizationPercentage}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #35a89e 0%, #10B981 100%)',
                }}
              />
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid #1c2222', paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Área da Chapa:</span>
              <strong style={{ color: '#FFFFFF' }}>{imposition.sheetAreaM2} m²</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Área das Caixas:</span>
              <strong style={{ color: '#FFFFFF' }}>{imposition.usedAreaM2} m²</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Dimensões do Bloco:</span>
              <strong style={{ color: '#FFFFFF' }}>{blockW} × {blockH} mm</strong>
            </div>
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
            viewBox={`-50 -50 ${imposition.sheetWidth + 100} ${imposition.sheetHeight + 100}`}
          >
            {/* Definições de Marcadores de Cotas */}
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#a855f7" />
              </marker>
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
              const isRotated180 = pose.rotationAngle === 180 || pose.rotationAngle === 270;

              return (
                <g key={`pose-${pose.index}`} id={`pose-${pose.index}`}>
                  {/* Fundo sutil de bounding box da pose */}
                  <rect
                    x={pose.x}
                    y={toSvgY(pose.y + pose.height)}
                    width={pose.width}
                    height={pose.height}
                    fill={isRotated180 ? 'rgba(168, 85, 247, 0.03)' : 'rgba(53, 168, 158, 0.03)'}
                    stroke={isRotated180 ? 'rgba(168, 85, 247, 0.18)' : 'rgba(53, 168, 158, 0.18)'}
                    strokeWidth="0.5"
                  />

                  {/* Linhas Reais da Faca (Corte, Vinco, Picote) */}
                  {geom.segments.map((seg, sIdx) => {
                    const isCrease = seg.type === 'crease';
                    const isPerfo = seg.type === 'perfo';
                    const strokeColor = isCrease ? '#10b981' : isPerfo ? '#06b6d4' : '#ef4444';
                    const strokeDash = isCrease ? '4,3' : isPerfo ? '2,2' : undefined;

                    return (
                      <line
                        key={`seg-${sIdx}`}
                        x1={seg.x0}
                        y1={toSvgY(seg.y0)}
                        x2={seg.x1}
                        y2={toSvgY(seg.y1)}
                        stroke={strokeColor}
                        strokeWidth="1.2"
                        strokeDasharray={strokeDash}
                      />
                    );
                  })}

                  {/* Arcos Reais da Faca */}
                  {geom.arcs && geom.arcs.map((arc, aIdx) => {
                    const isCrease = arc.type === 'crease';
                    const isPerfo = arc.type === 'perfo';
                    const strokeColor = isCrease ? '#10b981' : isPerfo ? '#06b6d4' : '#ef4444';

                    let delta = arc.endAngle - arc.startAngle;
                    while (delta < 0) delta += 360;
                    while (delta > 360) delta -= 360;

                    if (Math.abs(delta - 360) < 1e-3 || delta === 0) {
                      return (
                        <circle
                          key={`arc-${aIdx}`}
                          cx={arc.cx}
                          cy={toSvgY(arc.cy)}
                          r={arc.r}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="1.2"
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

                    return (
                      <path
                        key={`arc-${aIdx}`}
                        d={`M ${x1} ${y1} A ${arc.r} ${arc.r} 0 ${largeArc} 0 ${x2} ${y2}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="1.2"
                      />
                    );
                  })}

                  {/* Etiqueta com Número da Pose e Indicador de Rotação */}
                  <text
                    x={pose.x + pose.width / 2}
                    y={toSvgY(pose.y + pose.height / 2) + 4}
                    fontSize={Math.max(10, Math.min(18, pose.width * 0.045))}
                    fontWeight="800"
                    fill={isRotated180 ? '#9333ea' : '#334155'}
                    textAnchor="middle"
                    opacity="0.45"
                    pointerEvents="none"
                  >
                    #{pose.index} {isRotated180 ? '🔄 180°' : ''}
                  </text>
                </g>
              );
            })}

            {/* Linhas de Cota Técnica Industrial */}
            {poses.length > 0 && (
              <g id="imposition-dimensions" opacity="0.85">
                {/* Cota Superior de Largura Total do Bloco */}
                {(() => {
                  const dimY = Math.max(10, toSvgY(blockMaxY) - 16);
                  return (
                    <g>
                      <line x1={blockMinX} y1={dimY} x2={blockMaxX} y2={dimY} stroke="#a855f7" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                      <line x1={blockMinX} y1={dimY - 6} x2={blockMinX} y2={toSvgY(blockMaxY)} stroke="#a855f7" strokeWidth="0.5" strokeDasharray="2,2" />
                      <line x1={blockMaxX} y1={dimY - 6} x2={blockMaxX} y2={toSvgY(blockMaxY)} stroke="#a855f7" strokeWidth="0.5" strokeDasharray="2,2" />
                      <text x={(blockMinX + blockMaxX) / 2} y={dimY - 4} fill="#a855f7" fontSize="11" fontWeight="700" textAnchor="middle">
                        {blockW} mm
                      </text>
                    </g>
                  );
                })()}

                {/* Cota Direita de Altura Total do Bloco */}
                {(() => {
                  const dimX = Math.min(imposition.sheetWidth - 6, blockMaxX + 16);
                  const yTop = toSvgY(blockMaxY);
                  const yBottom = toSvgY(blockMinY);
                  return (
                    <g>
                      <line x1={dimX} y1={yTop} x2={dimX} y2={yBottom} stroke="#a855f7" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                      <line x1={blockMaxX} y1={yTop} x2={dimX + 6} y2={yTop} stroke="#a855f7" strokeWidth="0.5" strokeDasharray="2,2" />
                      <line x1={blockMaxX} y1={yBottom} x2={dimX + 6} y2={yBottom} stroke="#a855f7" strokeWidth="0.5" strokeDasharray="2,2" />
                      <text x={dimX + 8} y={(yTop + yBottom) / 2} fill="#a855f7" fontSize="11" fontWeight="700" dominantBaseline="middle">
                        {blockH} mm
                      </text>
                    </g>
                  );
                })()}
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};
