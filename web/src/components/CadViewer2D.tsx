import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { DielineResult } from '../engine/types';
import { ZoomIn, ZoomOut, Maximize2, Eye, Compass } from 'lucide-react';

interface CadViewer2DProps {
  dieline: DielineResult;
}

export const CadViewer2D: React.FC<CadViewer2DProps> = ({ dieline }) => {
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

    const padding = 60;
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;

    const b = dieline.bounds;
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
  }, [dieline]);

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

    // 3. Desenho dos Segmentos da Faca
    for (const seg of dieline.segments) {
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

    // 4. Desenho de Cotas e Medidas
    if (showDimensions && dieline.dimensions) {
      ctx.font = '11px monospace';
      ctx.fillStyle = '#F59E0B';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1;

      for (const dim of dieline.dimensions) {
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
      </div>

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
