import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { DielineResult, PackagingModel } from '../engine/types';
import { ZoomIn, ZoomOut, Maximize2, Eye, Compass, Terminal, ShieldCheck } from 'lucide-react';
import { fefco0429 } from '../engine/models/fefco0429';

interface CadViewer2DProps {
  dieline: DielineResult;
  model?: PackagingModel;
}

export const CadViewer2D: React.FC<CadViewer2DProps> = ({ dieline, model }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Modo Diagnóstico (TEST E / TEST F):
  // 'flow'   = Fluxo normal da aplicação (Catálogo -> Registry -> Model -> Params -> calculate) [PADRÃO OPERACIONAL]
  // 'direct' = Bypass total do catálogo (fefco0429.calculate puro L300 B200 H150 Ep3 H7=100) [DIAGNÓSTICO C#]
  const [diagMode, setDiagMode] = useState<'flow' | 'direct'>('flow');

  // 1. Geometria Direta C#-Parity (Bypass total de catálogo, registry, UI)
  const directDieline = useMemo(() => {
    return fefco0429.calculate({
      L: 300,
      B: 200,
      H: 150,
      Ep: 3.0,
      H7: 100,
    });
  }, []);

  // 2. Geometria ativa para desenho e visualização
  const activeDieline = diagMode === 'direct' ? directDieline : dieline;

  // Transformações da Câmera CAD (Pan e Zoom)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Opções visuais
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showDebug, setShowDebug] = useState(true);
  const [mouseMm, setMouseMm] = useState({ x: 0, y: 0 });

  // TESTE C — COMPARAÇÃO MATEMÁTICA DIRETA (A vs B)
  const comparison = useMemo(() => {
    let maxErr = 0;
    const vSegs = dieline.segments || [];
    const vArcs = dieline.arcs || [];
    const dSegs = directDieline.segments;
    const dArcs = directDieline.arcs || [];

    for (let i = 0; i < dSegs.length; i++) {
      const a = dSegs[i];
      const b = vSegs[i];
      if (!b) continue;
      const err0 = Math.hypot(a.x0 - b.x0, a.y0 - b.y0);
      const err1 = Math.hypot(a.x1 - b.x1, a.y1 - b.y1);
      const err = Math.max(err0, err1);
      if (err > maxErr) maxErr = err;
    }

    for (let i = 0; i < dArcs.length; i++) {
      const a = dArcs[i];
      const b = vArcs[i];
      if (!b) continue;
      const errC = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      const errR = Math.abs(a.r - b.r);
      const errA0 = Math.abs(a.startAngle - b.startAngle);
      const errA1 = Math.abs(a.endAngle - b.endAngle);
      const err = Math.max(errC, errR, errA0, errA1);
      if (err > maxErr) maxErr = err;
    }

    const totalA = dSegs.length + dArcs.length;
    const totalB = vSegs.length + vArcs.length;
    const isMatch = totalA === totalB && maxErr <= 0.001;

    return {
      totalA,
      totalB,
      segmentsA: dSegs.length,
      segmentsB: vSegs.length,
      arcsA: dArcs.length,
      arcsB: vArcs.length,
      isMatch,
      maxErrorMm: maxErr,
    };
  }, [directDieline, dieline]);

  // Logs Forenses no Console (TESTE A & TESTE B) - Apenas quando requisitado ou no modo direto
  useEffect(() => {
    if (diagMode === 'direct') {
      console.log('==================================================');
      console.log('[DIRECT TEST] Modo Bypass Direto Ativado');
      console.log('model = fefco_f429');
      console.log('source = fefco0429.calculate');
      console.log('parameters = L300 B200 H150 Ep3 H7=100');
      console.log(`segments = ${directDieline.segments.length}`);
      console.log(`arcs = ${directDieline.arcs.length}`);
      console.log(`total = ${directDieline.segments.length + directDieline.arcs.length}`);
      console.log('boundingBox:', directDieline.bounds);
    }
  }, [diagMode, directDieline]);

  // Ajusta a visualização para enquadrar perfeitamente a faca
  const fitToScreen = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const padding = 60;
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;

    const b = activeDieline.bounds;
    const scaleX = availW / (b.width || 1);
    const scaleY = availH / (b.height || 1);
    const fitZoom = Math.min(scaleX, scaleY, 1.8);

    setZoom(fitZoom);
    // Centraliza o ponto médio do dieline no centro do canvas
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const dielineCenterX = b.minX + b.width / 2;
    const dielineCenterY = b.minY + b.height / 2;

    setPan({
      x: centerX - dielineCenterX * fitZoom,
      y: centerY + dielineCenterY * fitZoom, // No canvas Y cresce para baixo
    });
  }, [activeDieline]);

  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  // Render Loop Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 1. Limpa fundo (Preto puro Primacor #000000)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // 2. Grade Milimétrica CAD
    if (showGrid) {
      const gridSize = 50 * zoom; // Grid a cada 50mm
      if (gridSize > 12) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;

        const startX = pan.x % gridSize;
        const startY = pan.y % gridSize;

        ctx.beginPath();
        for (let x = startX; x < width; x += gridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let y = startY; y < height; y += gridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();
      }
    }

    // Função de conversão Coordenadas Mundo (mm) -> Coordenadas Tela (px)
    const toScreenX = (mmX: number) => pan.x + mmX * zoom;
    const toScreenY = (mmY: number) => pan.y - mmY * zoom; // Inverte Y para CAD padrão

    // 3. Desenho dos Segmentos da Faca (109 segmentos)
    for (const seg of activeDieline.segments) {
      const sx0 = toScreenX(seg.x0);
      const sy0 = toScreenY(seg.y0);
      const sx1 = toScreenX(seg.x1);
      const sy1 = toScreenY(seg.y1);

      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);

      if (seg.type === 'cut') {
        ctx.strokeStyle = '#c53236'; // Vermelho Corte Primacor
        ctx.lineWidth = 1.8;
        ctx.setLineDash([]);
      } else if (seg.type === 'crease') {
        ctx.strokeStyle = '#35a89e'; // Verde-água Vinco Primacor
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6 * Math.max(0.5, zoom * 0.5), 4 * Math.max(0.5, zoom * 0.5)]);
      } else if (seg.type === 'perfo') {
        ctx.strokeStyle = '#10B981'; // Verde Picote
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3 * Math.max(0.5, zoom * 0.5), 3 * Math.max(0.5, zoom * 0.5)]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 3.1 Desenho dos Arcos da Faca (6 arcos de concordância / aba frontal)
    if (activeDieline.arcs && activeDieline.arcs.length > 0) {
      for (const arc of activeDieline.arcs) {
        ctx.beginPath();
        const sx = toScreenX(arc.cx);
        const sy = toScreenY(arc.cy);
        const sr = arc.r * zoom;

        // No CAD cartesiano (+Y para cima), ângulos crescem anti-horário.
        // No Canvas (+Y para baixo), o ângulo de tela correspondente é invertido: -theta.
        // O sentido anti-horário do CAD vira anti-horário no canvas com anticlockwise=true.
        const a0 = (-arc.startAngle * Math.PI) / 180;
        const a1 = (-arc.endAngle * Math.PI) / 180;
        ctx.arc(sx, sy, sr, a0, a1, true);

        if (arc.type === 'cut') {
          ctx.strokeStyle = '#c53236'; // Vermelho Corte Primacor
          ctx.lineWidth = 1.8;
          ctx.setLineDash([]);
        } else if (arc.type === 'crease') {
          ctx.strokeStyle = '#35a89e'; // Verde-água Vinco Primacor
          ctx.lineWidth = 1.6;
          ctx.setLineDash([6 * Math.max(0.5, zoom * 0.5), 4 * Math.max(0.5, zoom * 0.5)]);
        }
        ctx.stroke();
      }
    }

    // 4. Desenho de Cotas e Medidas
    if (showDimensions && activeDieline.dimensions) {
      ctx.font = '11px monospace';
      ctx.fillStyle = '#F59E0B';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1;

      for (const dim of activeDieline.dimensions) {
        const sx0 = toScreenX(dim.x0);
        const sy0 = toScreenY(dim.y0);
        const sx1 = toScreenX(dim.x1);
        const sy1 = toScreenY(dim.y1);

        const off = (dim.offset || 15) * zoom;
        const cx0 = dim.isVertical ? sx0 + off : sx0;
        const cy0 = dim.isVertical ? sy0 : sy0 - off;
        const cx1 = dim.isVertical ? sx1 + off : sx1;
        const cy1 = dim.isVertical ? sy1 : sy1 - off;

        // Linha da cota
        ctx.beginPath();
        ctx.moveTo(cx0, cy0);
        ctx.lineTo(cx1, cy1);
        // Extensões
        ctx.moveTo(sx0, sy0);
        ctx.lineTo(cx0, cy0);
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(cx1, cy1);
        ctx.stroke();

        // Texto da cota
        const textX = (cx0 + cx1) / 2;
        const textY = (cy0 + cy1) / 2 - 4;
        ctx.textAlign = 'center';
        ctx.fillText(dim.text, textX, textY);
      }
    }

    // 5. Origem (Eixo X/Y)
    const ox = toScreenX(0);
    const oy = toScreenY(0);
    if (ox >= -50 && ox <= width + 50 && oy >= -50 && oy <= height + 50) {
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + 30, oy);
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox, oy - 30);
      ctx.stroke();

      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('X', ox + 35, oy + 4);
      ctx.fillText('Y', ox - 3, oy - 35);
    }
  }, [activeDieline, zoom, pan, showGrid, showDimensions]);

  // Interação Mouse: Drag Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }

    // Atualiza coordenadas em mm
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const mmX = (mouseX - pan.x) / zoom;
      const mmY = (pan.y - mouseY) / zoom;
      setMouseMm({ x: Math.round(mmX), y: Math.round(mmY) });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom com a roda do mouse centrado no cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.1), 10);

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPan({
        x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
        y: mouseY - (mouseY - pan.y) * (newZoom / zoom),
      });
      setZoom(newZoom);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        background: '#0F172A',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      />

      {/* Toolbar Flutuante de Controle do Canvas */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 6,
          padding: '6px 8px',
          borderRadius: 8,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.25, 10))}
          title="Zoom In"
          style={{ padding: 6, color: '#94A3B8', borderRadius: 4 }}
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z * 0.8, 0.1))}
          title="Zoom Out"
          style={{ padding: 6, color: '#94A3B8', borderRadius: 4 }}
        >
          <ZoomOut size={18} />
        </button>
        <button
          onClick={fitToScreen}
          title="Ajustar à Tela"
          style={{ padding: 6, color: '#94A3B8', borderRadius: 4 }}
        >
          <Maximize2 size={18} />
        </button>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 4px' }} />
        <button
          onClick={() => setShowGrid((g) => !g)}
          title="Alternar Grade"
          style={{ padding: 6, color: showGrid ? '#35a89e' : '#64748B', borderRadius: 4 }}
        >
          <Compass size={18} />
        </button>
        <button
          onClick={() => setShowDimensions((d) => !d)}
          title="Alternar Cotas"
          style={{ padding: 6, color: showDimensions ? '#F59E0B' : '#64748B', borderRadius: 4 }}
        >
          <Eye size={18} />
        </button>
        <button
          onClick={() => setShowDebug((dbg) => !dbg)}
          title="Alternar Auditoria Forense CAD"
          style={{ padding: 6, color: showDebug ? '#35a89e' : '#64748B', borderRadius: 4 }}
        >
          <Terminal size={18} />
        </button>
      </div>

      {/* Painel de Auditoria Forense CAD & Diagnóstico (TEST E / TEST F) */}
      {showDebug && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            background: 'rgba(5, 8, 15, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #1E293B',
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#94A3B8',
            zIndex: 15,
            lineHeight: 1.5,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            maxWidth: 400,
          }}
        >
          {/* Header do HUD */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ color: '#35a89e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} color="#35a89e" />
              <span>DIAGNÓSTICO FORENSE CAD (C# PARITY)</span>
            </div>
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: comparison.isMatch ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: comparison.isMatch ? '#10B981' : '#EF4444',
                fontWeight: 700,
              }}
            >
              {comparison.isMatch ? 'MATCH: YES' : 'MATCH: NO'}
            </span>
          </div>

          {/* Botões de Alternância de Modo (TEST E / TEST F) */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setDiagMode('direct')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                background: diagMode === 'direct' ? '#35a89e' : '#141818',
                color: diagMode === 'direct' ? '#000000' : '#94A3B8',
                border: diagMode === 'direct' ? '1px solid #35a89e' : '1px solid #242c2c',
                transition: 'all 0.15s ease',
              }}
            >
              DIRECT C#-PARITY GEOMETRY
            </button>
            <button
              type="button"
              onClick={() => setDiagMode('flow')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                background: diagMode === 'flow' ? '#35a89e' : '#141818',
                color: diagMode === 'flow' ? '#000000' : '#94A3B8',
                border: diagMode === 'flow' ? '1px solid #35a89e' : '1px solid #242c2c',
                transition: 'all 0.15s ease',
              }}
            >
              REAL APPLICATION FLOW
            </button>
          </div>

          {/* Informações Técnicas do Modelo e Origem */}
          <div><strong style={{ color: '#E2E8F0' }}>MODEL:</strong> {diagMode === 'direct' ? 'fefco_0429 (FEFCO 0429)' : `${model?.id || 'fefco_0429'} (${model?.code || 'FEFCO 0429'})`}</div>
          <div><strong style={{ color: '#E2E8F0' }}>SOURCE:</strong> {diagMode === 'direct' ? 'fefco0429.calculate (Bypass Direto C#)' : `Catalog -> Registry -> ${model?.code || 'Model'}`}</div>
          <div><strong style={{ color: '#E2E8F0' }}>MODO ATIVO:</strong> {diagMode === 'flow' ? 'FLUXO REAL OPERACIONAL' : 'DIAGNÓSTICO ISOLADO C#'}</div>

          <div style={{ margin: '6px 0', borderTop: '1px solid #1E293B' }} />

          {/* Contagem de Entidades do Canvas Ativo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div><strong style={{ color: '#E2E8F0' }}>SEGMENTS:</strong> {activeDieline.segments.length}</div>
            <div><strong style={{ color: '#E2E8F0' }}>ARCS:</strong> {activeDieline.arcs?.length || 0}</div>
            <div><strong style={{ color: '#35a89e' }}>TOTAL RENDERED:</strong> {activeDieline.segments.length + (activeDieline.arcs?.length || 0)}</div>
            <div><strong style={{ color: '#E2E8F0' }}>TIPO:</strong> {diagMode === 'direct' ? '100% C# Parity' : 'Paramétrico Interativo'}</div>
          </div>

          <div style={{ margin: '6px 0', borderTop: '1px solid #1E293B' }} />

          {/* Comparativo Forense C# Parity (quando FEFCO 0429 ou modo direto) */}
          <div><strong style={{ color: '#E2E8F0' }}>REF DIRETA 0429:</strong> 115 entities (109 seg + 6 arcs)</div>
          <div><strong style={{ color: '#E2E8F0' }}>CANVAS ATUAL:</strong> {activeDieline.segments.length + (activeDieline.arcs?.length || 0)} entities ({activeDieline.segments.length} seg + {activeDieline.arcs?.length || 0} arcs)</div>
          {(model?.code?.includes('0429') || diagMode === 'direct') && (
            <div><strong style={{ color: comparison.isMatch ? '#10B981' : '#EF4444' }}>PARIDADE C#:</strong> {comparison.isMatch ? '100% IDÊNTICA (Erro <= 0.001 mm)' : 'DIVERGÊNCIA DETECTADA'}</div>
          )}

          <div style={{ margin: '6px 0', borderTop: '1px solid #1E293B' }} />

          {/* Bounding Box do Modelo Ativo */}
          <div><strong style={{ color: '#E2E8F0' }}>BBOX:</strong> X[{activeDieline.bounds.minX.toFixed(1)} a {activeDieline.bounds.maxX.toFixed(1)}] Y[{activeDieline.bounds.minY.toFixed(1)} a {activeDieline.bounds.maxY.toFixed(1)}]</div>
          <div><strong style={{ color: '#E2E8F0' }}>WIDTH:</strong> {activeDieline.bounds.width.toFixed(2)} mm | <strong style={{ color: '#E2E8F0' }}>HEIGHT:</strong> {activeDieline.bounds.height.toFixed(2)} mm</div>
        </div>
      )}

      {/* Legenda de Tipos de Linha CAD e Coordenadas */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 14px',
          borderRadius: 8,
          fontSize: 12,
          color: '#CBD5E1',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 16, height: 3, background: '#c53236', borderRadius: 2 }} />
          <span>Corte</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 16, height: 3, borderTop: '3px dashed #35a89e' }} />
          <span>Vinco</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 16, height: 3, borderTop: '3px dotted #10B981' }} />
          <span>Picote</span>
        </div>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
        <div style={{ fontFamily: 'monospace', color: '#94A3B8' }}>
          X: {mouseMm.x} mm | Y: {mouseMm.y} mm | Zoom: {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  );
};
