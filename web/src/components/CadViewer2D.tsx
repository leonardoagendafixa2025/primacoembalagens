import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { DielineResult, PackagingModel } from '../engine/types';
import { ZoomIn, ZoomOut, Maximize2, Grid, Ruler, RotateCcw, Crop, Crosshair } from 'lucide-react';
import { generateCadAnnotations } from '../engine/cadMarks';

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
  const [showBleed, setShowBleed] = useState(true);
  const [showRegMarks, setShowRegMarks] = useState(true);
  const [mouseMm, setMouseMm] = useState({ x: 0, y: 0 });

  // Ajusta a visualização para enquadrar perfeitamente a faca
  const fitToScreen = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    if (!rect.width || !rect.height || rect.width < 10 || rect.height < 10) return;

    const padding = Math.min(30, Math.max(10, Math.min(rect.width, rect.height) * 0.08));
    const availW = Math.max(30, rect.width - padding * 2);
    const availH = Math.max(30, rect.height - padding * 2);

    const b = dieline.bounds || { minX: -150, minY: -100, maxX: 150, maxY: 100, width: 300, height: 200 };
    const modelW = Math.max(1, b.width || 300);
    const modelH = Math.max(1, b.height || 200);
    const scaleX = availW / modelW;
    const scaleY = availH / modelH;
    const fitZoom = Math.max(0.02, Math.min(scaleX, scaleY, 2.0));

    setZoom(fitZoom);
    // Centraliza o ponto médio do dieline no centro do canvas
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const dielineCenterX = b.minX + modelW / 2;
    const dielineCenterY = b.minY + modelH / 2;

    setPan({
      x: centerX - dielineCenterX * fitZoom,
      y: centerY + dielineCenterY * fitZoom, // No canvas Y cresce para baixo
    });

    onViewportUpdate?.({ cursorMm: { x: 0, y: 0 }, zoom: fitZoom });
  }, [dieline, onViewportUpdate]);

  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  // Listener para redimensionamento e rotação em dispositivos móveis
  useEffect(() => {
    const handleResize = () => {
      fitToScreen();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitToScreen]);

  // Render Loop Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.clientWidth || 300);
    const height = Math.max(1, canvas.clientHeight || 300);

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

    // 3.5. Camadas de Sangria (Bleed) e Cruzes de Registro Óptico CNC
    if (dieline.bounds && (showBleed || showRegMarks)) {
      const annotations = generateCadAnnotations(dieline.bounds, { bleedOffset: 5 });

      // Sangria Gráfica (+5mm)
      if (showBleed) {
        ctx.save();
        ctx.strokeStyle = '#22c55e'; // Verde Sangria
        ctx.fillStyle = 'rgba(34, 197, 94, 0.035)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4 * Math.max(0.5, zoom * 0.4), 4 * Math.max(0.5, zoom * 0.4)]);

        const b = annotations.bleedBox;
        const sx = toScreenX(b.minX);
        const sy = toScreenY(b.maxY);
        const sw = b.width * zoom;
        const sh = b.height * zoom;

        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeRect(sx, sy, sw, sh);

        // Rótulo técnico no canto superior da sangria
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#22c55e';
        ctx.textAlign = 'left';
        ctx.fillText('SANGRIA (+5mm)', sx + 4, sy - 5);
        ctx.restore();
      }

      // Marcas de Registro Óptico CNC
      if (showRegMarks) {
        ctx.save();
        ctx.strokeStyle = '#c084fc'; // Magenta / Roxo Registro
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);

        for (const rm of annotations.registrationMarks) {
          const scx = toScreenX(rm.center.x);
          const scy = toScreenY(rm.center.y);
          const sr = Math.max(1.5, rm.radius * zoom);

          // Círculo central do alvo
          ctx.beginPath();
          ctx.arc(scx, scy, sr, 0, Math.PI * 2);
          ctx.stroke();

          // Segmentos da cruz de registro
          for (const seg of rm.segments) {
            ctx.beginPath();
            ctx.moveTo(toScreenX(seg.x0), toScreenY(seg.y0));
            ctx.lineTo(toScreenX(seg.x1), toScreenY(seg.y1));
            ctx.stroke();
          }
        }

        // Marcas nos centros cardeais
        for (const cm of annotations.centerMarks) {
          ctx.beginPath();
          ctx.moveTo(toScreenX(cm.x0), toScreenY(cm.y0));
          ctx.lineTo(toScreenX(cm.x1), toScreenY(cm.y1));
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 4. Desenho dos Segmentos da Faca
    for (const seg of dieline.segments) {
      const sx0 = toScreenX(seg.x0);
      const sy0 = toScreenY(seg.y0);
      const sx1 = toScreenX(seg.x1);
      const sy1 = toScreenY(seg.y1);

      if (!isFinite(sx0) || !isFinite(sy0) || !isFinite(sx1) || !isFinite(sy1)) continue;

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
        const sx = toScreenX(arc.cx);
        const sy = toScreenY(arc.cy);
        const sr = Math.max(0.1, Math.abs(arc.r * zoom));

        if (!isFinite(sx) || !isFinite(sy) || !isFinite(sr) || sr <= 0) continue;

        ctx.beginPath();
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
  }, [dieline, zoom, pan, showGrid, showDimensions, showBleed, showRegMarks]);

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

  // Touch gestures para Smartphones e Tablets
  const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchDistRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      lastTouchPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastTouchDistRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistRef.current = Math.hypot(dx, dy);
      lastTouchPosRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && lastTouchPosRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - lastTouchPosRef.current.x;
      const dy = touch.clientY - lastTouchPosRef.current.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = touch.clientX - rect.left;
        const mouseY = touch.clientY - rect.top;
        const mmX = (mouseX - pan.x) / zoom;
        const mmY = (pan.y - mouseY) / zoom;
        const newCoords = { x: Math.round(mmX * 10) / 10, y: Math.round(mmY * 10) / 10 };
        setMouseMm(newCoords);
        onViewportUpdate?.({ cursorMm: newCoords, zoom });
      }
    } else if (e.touches.length === 2 && lastTouchDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / lastTouchDistRef.current;
      if (factor > 0.6 && factor < 1.8) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const newZoom = Math.min(Math.max(zoom * factor, 0.05), 15);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const mouseX = midX - rect.left;
          const mouseY = midY - rect.top;
          setPan({
            x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
            y: mouseY - (mouseY - pan.y) * (newZoom / zoom),
          });
          setZoom(newZoom);
          onViewportUpdate?.({ cursorMm: mouseMm, zoom: newZoom });
        }
      }
      lastTouchDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastTouchPosRef.current = null;
    lastTouchDistRef.current = null;
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: isDragging ? 'grabbing' : 'crosshair',
          touchAction: 'none',
        }}
      />

      {/* Toolbar Flutuante Inferior Direita com Ferramentas Rápidas (sem sobreposição com Exportar) */}
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          right: 14,
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
          className={`cad-tool-btn cad-tooltip ${showBleed ? 'active' : ''}`}
          data-tooltip={showBleed ? 'Ocultar Sangria (Bleed)' : 'Exibir Sangria (+5mm)'}
          onClick={() => setShowBleed((b) => !b)}
        >
          <Crop size={15} />
        </button>

        <button
          type="button"
          className={`cad-tool-btn cad-tooltip ${showRegMarks ? 'active' : ''}`}
          data-tooltip={showRegMarks ? 'Ocultar Registro CNC' : 'Exibir Registro CNC'}
          onClick={() => setShowRegMarks((m) => !m)}
        >
          <Crosshair size={15} />
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
          <span>Cotas</span>
        </div>

        <div style={{ width: 1, height: 12, background: 'var(--cad-border-subtle)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 2, borderTop: '2px dashed #22c55e' }} />
          <span>Sangria (+5mm)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 3, height: 3, background: '#c084fc', borderRadius: '50%' }} />
          </div>
          <span>Registro CNC</span>
        </div>
      </div>
    </div>
  );
};
