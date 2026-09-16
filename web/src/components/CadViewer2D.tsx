import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { DielineResult, PackagingModel } from '../engine/types';
import { ZoomIn, ZoomOut, Maximize2, Grid, Ruler, RotateCcw } from 'lucide-react';

interface CadViewer2DProps {
  dieline: DielineResult;
  model?: PackagingModel;
  onViewportUpdate?: (info: { cursorMm: { x: number; y: number }; zoom: number }) => void;
}

export const CadViewer2D: React.FC<CadViewer2DProps> = ({ dieline, model: _model, onViewportUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Transformações da Câmera CAD (Pan e Zoom)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Opções visuais
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [mouseMm, setMouseMm] = useState({ x: 0, y: 0 });

  // Ajusta a visualização para enquadrar perfeitamente a faca
  const fitToScreen = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const padding = 70;
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;

    const b = dieline.bounds;
    const scaleX = availW / (b.width || 1);
    const scaleY = availH / (b.height || 1);
    const fitZoom = Math.min(scaleX, scaleY, 2.0);

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

    onViewportUpdate?.({ cursorMm: mouseMm, zoom: fitZoom });
  }, [dieline, mouseMm, onViewportUpdate]);

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

    // 1. Fundo Preto CAD de Alto Contraste (#060709)
    ctx.fillStyle = '#060709';
    ctx.fillRect(0, 0, width, height);

    // 2. Grade Milimétrica CAD Profissional com Subdivisões
    if (showGrid) {
      // Sub-grid fino (10mm) se o zoom for suficiente
      const subGridSize = 10 * zoom;
      if (subGridSize > 14) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const startX = pan.x % subGridSize;
        const startY = pan.y % subGridSize;
        for (let x = startX; x < width; x += subGridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let y = startY; y < height; y += subGridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();
      }

      // Grid Principal (50mm)
      const gridSize = 50 * zoom;
      if (gridSize > 10) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const startX = pan.x % gridSize;
        const startY = pan.y % gridSize;
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

    // 3. Eixo X / Y de Referência (Linhas de zero)
    const axisX = toScreenY(0);
    const axisY = toScreenX(0);
    if (axisX >= 0 && axisX <= height) {
      ctx.strokeStyle = 'rgba(0, 210, 180, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, axisX);
      ctx.lineTo(width, axisX);
      ctx.stroke();
    }
    if (axisY >= 0 && axisY <= width) {
      ctx.strokeStyle = 'rgba(0, 210, 180, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(axisY, 0);
      ctx.lineTo(axisY, height);
      ctx.stroke();
    }

    // 4. Desenho dos Segmentos da Faca
    for (const seg of dieline.segments) {
      const sx0 = toScreenX(seg.x0);
      const sy0 = toScreenY(seg.y0);
      const sx1 = toScreenX(seg.x1);
      const sy1 = toScreenY(seg.y1);

      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);

      if (seg.type === 'cut') {
        ctx.strokeStyle = '#ef4444'; // Vermelho Corte Primacor
        ctx.lineWidth = 1.6;
        ctx.setLineDash([]);
      } else if (seg.type === 'crease') {
        ctx.strokeStyle = '#00d2b4'; // Verde-água Vinco Primacor
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5 * Math.max(0.5, zoom * 0.4), 3 * Math.max(0.5, zoom * 0.4)]);
      } else if (seg.type === 'perfo') {
        ctx.strokeStyle = '#10b981'; // Verde Picote
        ctx.lineWidth = 1.3;
        ctx.setLineDash([2.5 * Math.max(0.5, zoom * 0.4), 2.5 * Math.max(0.5, zoom * 0.4)]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 5. Desenho dos Arcos da Faca com Tangência Perfeita
    if (dieline.arcs && dieline.arcs.length > 0) {
      for (const arc of dieline.arcs) {
        ctx.beginPath();
        const sx = toScreenX(arc.cx);
        const sy = toScreenY(arc.cy);
        const sr = arc.r * zoom;

        const isFull =
          Math.abs(Math.abs(arc.endAngle - arc.startAngle) - 360) < 1 ||
          (arc.startAngle === 0 && arc.endAngle === 360);

        if (isFull) {
          ctx.arc(sx, sy, sr, 0, Math.PI * 2, false);
        } else {
          let startAngle = arc.startAngle;
          let endAngle = arc.endAngle;
          while (endAngle < startAngle) {
            endAngle += 360;
          }
          const a0 = (-startAngle * Math.PI) / 180;
          const a1 = (-endAngle * Math.PI) / 180;
          ctx.arc(sx, sy, sr, a0, a1, true);
        }

        if (arc.type === 'cut') {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([]);
        } else if (arc.type === 'crease') {
          ctx.strokeStyle = '#00d2b4';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([5 * Math.max(0.5, zoom * 0.4), 3 * Math.max(0.5, zoom * 0.4)]);
        }
        ctx.stroke();
      }
    }

    // 6. Desenho de Cotas e Medidas Técnicas ISO
    if (showDimensions && dieline.dimensions) {
      ctx.font = 'bold 10px monospace';

      for (const dim of dieline.dimensions) {
        const sx0 = toScreenX(dim.x0);
        const sy0 = toScreenY(dim.y0);
        const sx1 = toScreenX(dim.x1);
        const sy1 = toScreenY(dim.y1);

        const off = (dim.offset || 14) * zoom;
        const cx0 = dim.isVertical ? sx0 + off : sx0;
        const cy0 = dim.isVertical ? sy0 : sy0 - off;
        const cx1 = dim.isVertical ? sx1 + off : sx1;
        const cy1 = dim.isVertical ? sy1 : sy1 - off;

        // Linhas de extensão e cota
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(cx0, cy0);
        ctx.lineTo(cx1, cy1);
        ctx.moveTo(sx0, sy0);
        ctx.lineTo(cx0, cy0);
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(cx1, cy1);

        // Tiques técnicos nas pontas
        const tick = 3;
        ctx.moveTo(cx0 - tick, cy0 + tick);
        ctx.lineTo(cx0 + tick, cy0 - tick);
        ctx.moveTo(cx1 - tick, cy1 + tick);
        ctx.lineTo(cx1 + tick, cy1 - tick);
        ctx.stroke();

        // Texto com caixa de alto contraste
        const textX = (cx0 + cx1) / 2;
        const textY = (cy0 + cy1) / 2;
        const metrics = ctx.measureText(dim.text);
        const bgW = metrics.width + 6;
        const bgH = 13;

        ctx.fillStyle = 'rgba(10, 12, 16, 0.9)';
        ctx.fillRect(textX - bgW / 2, textY - bgH / 2 - 1, bgW, bgH);

        ctx.fillStyle = '#f59e0b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dim.text, textX, textY - 1);
      }
    }

    // 7. Gizmo de Origem CAD (0,0)
    const ox = toScreenX(0);
    const oy = toScreenY(0);
    if (ox >= -40 && ox <= width + 40 && oy >= -40 && oy <= height + 40) {
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + 24, oy);
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox, oy - 24);
      ctx.stroke();

      ctx.font = '9px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('X', ox + 28, oy + 3);
      ctx.fillText('Y', ox - 2, oy - 28);
    }
  }, [dieline, zoom, pan, showGrid, showDimensions]);

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
      const newCoords = { x: Math.round(mmX * 10) / 10, y: Math.round(mmY * 10) / 10 };
      setMouseMm(newCoords);
      onViewportUpdate?.({ cursorMm: newCoords, zoom });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom com a roda do mouse centrado no cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.05), 15);

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPan({
        x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
        y: mouseY - (mouseY - pan.y) * (newZoom / zoom),
      });
      setZoom(newZoom);
      onViewportUpdate?.({ cursorMm: mouseMm, zoom: newZoom });
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
        background: 'var(--cad-bg-workspace)',
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
          cursor: isDragging ? 'grabbing' : 'crosshair',
        }}
      />

      {/* Toolbar Flutuante Superior Direita com Ferramentas Rápidas */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          gap: 4,
          padding: 4,
          borderRadius: 'var(--cad-radius-md)',
          background: 'var(--cad-bg-panel)',
          border: '1px solid var(--cad-border-default)',
          boxShadow: 'var(--cad-shadow-subtle)',
          zIndex: 15,
        }}
      >
        <button
          type="button"
          className="cad-tool-btn cad-tooltip"
          data-tooltip="Aproximar (+)"
          onClick={() => {
            const nz = Math.min(zoom * 1.25, 15);
            setZoom(nz);
            onViewportUpdate?.({ cursorMm: mouseMm, zoom: nz });
          }}
        >
          <ZoomIn size={15} />
        </button>

        <button
          type="button"
          className="cad-tool-btn cad-tooltip"
          data-tooltip="Afastar (-)"
          onClick={() => {
            const nz = Math.max(zoom * 0.8, 0.05);
            setZoom(nz);
            onViewportUpdate?.({ cursorMm: mouseMm, zoom: nz });
          }}
        >
          <ZoomOut size={15} />
        </button>

        <button
          type="button"
          className="cad-tool-btn cad-tooltip"
          data-tooltip="Enquadrar Faca (Fit)"
          onClick={fitToScreen}
        >
          <Maximize2 size={15} />
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--cad-border-subtle)', margin: 'auto 2px' }} />

        <button
          type="button"
          className={`cad-tool-btn cad-tooltip ${showGrid ? 'active' : ''}`}
          data-tooltip={showGrid ? 'Ocultar Grade' : 'Exibir Grade'}
          onClick={() => setShowGrid((g) => !g)}
        >
          <Grid size={15} />
        </button>

        <button
          type="button"
          className={`cad-tool-btn cad-tooltip ${showDimensions ? 'active' : ''}`}
          data-tooltip={showDimensions ? 'Ocultar Cotas' : 'Exibir Cotas'}
          onClick={() => setShowDimensions((d) => !d)}
        >
          <Ruler size={15} />
        </button>

        <button
          type="button"
          className="cad-tool-btn cad-tooltip"
          data-tooltip="Resetar Visão"
          onClick={() => {
            setPan({ x: 0, y: 0 });
            fitToScreen();
          }}
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Legenda Técnica de Cores no Canto Inferior Esquerdo */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '6px 12px',
          borderRadius: 'var(--cad-radius-sm)',
          background: 'var(--cad-bg-panel)',
          border: '1px solid var(--cad-border-subtle)',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--cad-text-secondary)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 2, background: '#ef4444', borderRadius: 1 }} />
          <span>Corte</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 2, borderTop: '2px dashed #00d2b4' }} />
          <span>Vinco</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 2, borderTop: '2px dotted #10b981' }} />
          <span>Picote</span>
        </div>

        <div style={{ width: 1, height: 12, background: 'var(--cad-border-subtle)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 2, background: '#f59e0b', borderRadius: 1 }} />
          <span>Cotas Técnicas</span>
        </div>
      </div>
    </div>
  );
};
