import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { DielineResult, PackagingModel, Segment2D } from '../engine/types';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Ruler,
  RotateCcw,
  Crop,
  Crosshair,
  Edit2,
  Undo2,
  Trash2,
  CheckSquare,
  X,
} from 'lucide-react';
import { generateCadAnnotations } from '../engine/cadMarks';

// Distance from point to segment (screen space)
function distPointToSeg(
  px: number, py: number,
  x0: number, y0: number,
  x1: number, y1: number
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

// Check if a line segment is inside or intersects a rectangular region (in mm coords)
function isSegmentInRect(
  x0: number, y0: number,
  x1: number, y1: number,
  rx0: number, ry0: number,
  rx1: number, ry1: number
): boolean {
  const minX = Math.min(rx0, rx1);
  const maxX = Math.max(rx0, rx1);
  const minY = Math.min(ry0, ry1);
  const maxY = Math.max(ry0, ry1);

  // 1. Either endpoint inside
  if ((x0 >= minX && x0 <= maxX && y0 >= minY && y0 <= maxY) ||
      (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY)) {
    return true;
  }

  // 2. Midpoint inside
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) {
    return true;
  }

  // 3. Line intersects any of the 4 bounding box sides
  const segIntersects = (
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number
  ) => {
    const det = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (det === 0) return false;
    const lambda = ((dy - cy) * (dx - ax) + (cx - dx) * (dy - ay)) / det;
    const gamma = ((ay - by) * (dx - ax) + (bx - ax) * (dy - ay)) / det;
    return (0 <= lambda && lambda <= 1) && (0 <= gamma && gamma <= 1);
  };

  return (
    segIntersects(x0, y0, x1, y1, minX, minY, maxX, minY) ||
    segIntersects(x0, y0, x1, y1, maxX, minY, maxX, maxY) ||
    segIntersects(x0, y0, x1, y1, maxX, maxY, minX, maxY) ||
    segIntersects(x0, y0, x1, y1, minX, maxY, minX, minY)
  );
}

const TYPE_OPTIONS: { type: Segment2D['type']; label: string; color: string }[] = [
  { type: 'cut',    label: 'CORTE',  color: '#ef4444' },
  { type: 'crease', label: 'VINCO',  color: '#00d2b4' },
  { type: 'perfo',  label: 'PICOTE', color: '#10b981' },
];

interface CadViewer2DProps {
  dieline: DielineResult;
  model?: PackagingModel;
  onViewportUpdate?: (info: { cursorMm: { x: number; y: number }; zoom: number }) => void;
  onDielineEdit?: (newDieline: DielineResult) => void;
}

export const CadViewer2D: React.FC<CadViewer2DProps> = ({
  dieline,
  model: _model,
  onViewportUpdate,
  onDielineEdit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Camera
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Visual options
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showBleed, setShowBleed] = useState(true);
  const [showRegMarks, setShowRegMarks] = useState(true);
  const [mouseMm, setMouseMm] = useState({ x: 0, y: 0 });

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [localSegs, setLocalSegs] = useState<Segment2D[]>([]);
  const [selectedSegIndices, setSelectedSegIndices] = useState<number[]>([]);
  const [hoveredSegIdx, setHoveredSegIdx] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<Segment2D[][]>([]);
  const [draggingEndpoint, setDraggingEndpoint] = useState<{
    segIdx: number;
    endpoint: 'p0' | 'p1';
  } | null>(null);

  // Box (rubber-band) selection state
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    shiftHeld?: boolean;
  } | null>(null);

  // Sync localSegs whenever the dieline changes from outside (model / params change)
  useEffect(() => {
    setLocalSegs(dieline.segments.map((s, i) => ({ ...s, id: s.id ?? i })));
    setSelectedSegIndices([]);
    setHoveredSegIdx(null);
    setUndoStack([]);
    setDraggingEndpoint(null);
    setSelectionBox(null);
  }, [dieline]);

  // Which segments to display
  const displaySegs = editMode ? localSegs : dieline.segments;

  // Fit to screen
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
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const dielineCenterX = b.minX + modelW / 2;
    const dielineCenterY = b.minY + modelH / 2;
    setPan({
      x: centerX - dielineCenterX * fitZoom,
      y: centerY + dielineCenterY * fitZoom,
    });
    onViewportUpdate?.({ cursorMm: { x: 0, y: 0 }, zoom: fitZoom });
  }, [dieline, onViewportUpdate]);

  useEffect(() => { fitToScreen(); }, [fitToScreen]);
  useEffect(() => {
    const h = () => fitToScreen();
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [fitToScreen]);

  // ─── Edit helpers ───────────────────────────────────────────────────────────
  const findClosestSeg = useCallback(
    (screenX: number, screenY: number, threshold = 10): number | null => {
      let best: number | null = null;
      let bestDist = threshold;
      for (let i = 0; i < localSegs.length; i++) {
        const s = localSegs[i];
        const sx0 = pan.x + s.x0 * zoom; const sy0 = pan.y - s.y0 * zoom;
        const sx1 = pan.x + s.x1 * zoom; const sy1 = pan.y - s.y1 * zoom;
        const d = distPointToSeg(screenX, screenY, sx0, sy0, sx1, sy1);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    },
    [localSegs, pan, zoom]
  );

  const findClosestEndpoint = useCallback(
    (screenX: number, screenY: number, segIdx: number, threshold = 10): 'p0' | 'p1' | null => {
      const s = localSegs[segIdx];
      if (!s) return null;
      const sx0 = pan.x + s.x0 * zoom; const sy0 = pan.y - s.y0 * zoom;
      const sx1 = pan.x + s.x1 * zoom; const sy1 = pan.y - s.y1 * zoom;
      const d0 = Math.hypot(screenX - sx0, screenY - sy0);
      const d1 = Math.hypot(screenX - sx1, screenY - sy1);
      if (d0 <= threshold && d0 <= d1) return 'p0';
      if (d1 <= threshold) return 'p1';
      return null;
    },
    [localSegs, pan, zoom]
  );

  const pushUndo = (segs: Segment2D[]) => {
    setUndoStack((prev) => [...prev.slice(-19), [...segs]]);
  };

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setLocalSegs(prev);
    setUndoStack((s) => s.slice(0, -1));
    setSelectedSegIndices([]);
    onDielineEdit?.({ ...dieline, segments: prev });
  }, [undoStack, dieline, onDielineEdit]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedSegIndices.length === 0) return;
    pushUndo(localSegs);
    const set = new Set(selectedSegIndices);
    const next = localSegs.filter((_, i) => !set.has(i));
    setLocalSegs(next);
    setSelectedSegIndices([]);
    onDielineEdit?.({ ...dieline, segments: next });
  }, [selectedSegIndices, localSegs, dieline, onDielineEdit]);

  const handleChangeType = useCallback((type: Segment2D['type']) => {
    if (selectedSegIndices.length === 0) return;
    pushUndo(localSegs);
    const set = new Set(selectedSegIndices);
    const next = localSegs.map((s, i) => (set.has(i) ? { ...s, type } : s));
    setLocalSegs(next);
    onDielineEdit?.({ ...dieline, segments: next });
  }, [selectedSegIndices, localSegs, dieline, onDielineEdit]);

  const handleSelectAll = useCallback(() => {
    setSelectedSegIndices(localSegs.map((_, i) => i));
  }, [localSegs]);

  const handleClearSelection = useCallback(() => {
    setSelectedSegIndices([]);
  }, []);

  // Keyboard Shortcuts (Delete, Ctrl+A, Ctrl+Z, Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if focus is in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (editMode) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          handleSelectAll();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          handleUndo();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          handleDeleteSelected();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (selectedSegIndices.length > 0) {
            handleClearSelection();
          } else {
            setEditMode(false);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editMode, selectedSegIndices, handleSelectAll, handleUndo, handleDeleteSelected, handleClearSelection]);

  // ─── Canvas Render ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width  = Math.max(1, canvas.clientWidth  || 300);
    const height = Math.max(1, canvas.clientHeight || 300);
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const scX = (mmX: number) => pan.x + mmX * zoom;
    const scY = (mmY: number) => pan.y - mmY * zoom;

    const selectedSet = new Set(selectedSegIndices);

    // Background
    ctx.fillStyle = '#060709';
    ctx.fillRect(0, 0, width, height);

    // Sub-grid 10mm
    if (showGrid) {
      const subGridSize = 10 * zoom;
      if (subGridSize > 14) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const startX = pan.x % subGridSize;
        const startY = pan.y % subGridSize;
        for (let x = startX; x < width; x += subGridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = startY; y < height; y += subGridSize) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();
      }
      // Grid 50mm
      const gridSize = 50 * zoom;
      if (gridSize > 10) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const startX = pan.x % gridSize;
        const startY = pan.y % gridSize;
        for (let x = startX; x < width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = startY; y < height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();
      }
    }

    // Axis
    const axisX = scY(0);
    const axisY = scX(0);
    if (axisX >= 0 && axisX <= height) {
      ctx.strokeStyle = 'rgba(0, 210, 180, 0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, axisX); ctx.lineTo(width, axisX); ctx.stroke();
    }
    if (axisY >= 0 && axisY <= width) {
      ctx.strokeStyle = 'rgba(0, 210, 180, 0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(axisY, 0); ctx.lineTo(axisY, height); ctx.stroke();
    }

    // Bleed + registration marks
    if (dieline.bounds && (showBleed || showRegMarks)) {
      const annotations = generateCadAnnotations(dieline.bounds, { bleedOffset: 5 });
      if (showBleed) {
        ctx.save();
        ctx.strokeStyle = '#22c55e';
        ctx.fillStyle = 'rgba(34, 197, 94, 0.035)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4 * Math.max(0.5, zoom * 0.4), 4 * Math.max(0.5, zoom * 0.4)]);
        const b2 = annotations.bleedBox;
        const bx = scX(b2.minX); const by = scY(b2.maxY);
        const bw = b2.width * zoom; const bh = b2.height * zoom;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#22c55e';
        ctx.textAlign = 'left'; ctx.fillText('SANGRIA (+5mm)', bx + 4, by - 5);
        ctx.restore();
      }
      if (showRegMarks) {
        ctx.save();
        ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 1.2; ctx.setLineDash([]);
        for (const rm of annotations.registrationMarks) {
          const rcx = scX(rm.center.x); const rcy = scY(rm.center.y);
          const sr = Math.max(1.5, rm.radius * zoom);
          ctx.beginPath(); ctx.arc(rcx, rcy, sr, 0, Math.PI * 2); ctx.stroke();
          for (const rseg of rm.segments) {
            ctx.beginPath(); ctx.moveTo(scX(rseg.x0), scY(rseg.y0)); ctx.lineTo(scX(rseg.x1), scY(rseg.y1)); ctx.stroke();
          }
        }
        for (const cm of annotations.centerMarks) {
          ctx.beginPath(); ctx.moveTo(scX(cm.x0), scY(cm.y0)); ctx.lineTo(scX(cm.x1), scY(cm.y1)); ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ── Segments ──
    for (let i = 0; i < displaySegs.length; i++) {
      const seg = displaySegs[i];
      const sx0 = scX(seg.x0); const sy0 = scY(seg.y0);
      const sx1 = scX(seg.x1); const sy1 = scY(seg.y1);
      if (!isFinite(sx0) || !isFinite(sy0) || !isFinite(sx1) || !isFinite(sy1)) continue;

      const isSelected = editMode && selectedSet.has(i);
      const isHovered  = editMode && hoveredSegIdx === i && !isSelected;

      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);

      if (isSelected) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = selectedSegIndices.length === 1 ? 3.5 : 3.0;
        ctx.setLineDash([]);
      } else if (isHovered) {
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
      } else if (seg.type === 'cut') {
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.6; ctx.setLineDash([]);
      } else if (seg.type === 'crease') {
        ctx.strokeStyle = '#00d2b4'; ctx.lineWidth = 1.4;
        ctx.setLineDash([5 * Math.max(0.5, zoom * 0.4), 3 * Math.max(0.5, zoom * 0.4)]);
      } else if (seg.type === 'perfo') {
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1.3;
        ctx.setLineDash([2.5 * Math.max(0.5, zoom * 0.4), 2.5 * Math.max(0.5, zoom * 0.4)]);
      }
      ctx.stroke();

      // Endpoint handles
      if (isSelected) {
        ctx.setLineDash([]);
        if (selectedSegIndices.length === 1) {
          // Draggable handles for single selected segment
          for (const [hx, hy] of [[sx0, sy0], [sx1, sy1]] as [number, number][]) {
            ctx.beginPath();
            ctx.arc(hx, hy, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#fbbf24';
            ctx.fill();
            ctx.strokeStyle = '#0a0c10';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        } else {
          // Small dots for multi-selected lines
          for (const [hx, hy] of [[sx0, sy0], [sx1, sy1]] as [number, number][]) {
            ctx.beginPath();
            ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#fbbf24';
            ctx.fill();
          }
        }
      }
    }
    ctx.setLineDash([]);

    // Arcs
    if (dieline.arcs && dieline.arcs.length > 0) {
      for (const arc of dieline.arcs) {
        const ax = scX(arc.cx); const ay = scY(arc.cy);
        const ar = Math.max(0.1, Math.abs(arc.r * zoom));
        if (!isFinite(ax) || !isFinite(ay) || !isFinite(ar) || ar <= 0) continue;
        ctx.beginPath();
        const isFull =
          Math.abs(Math.abs(arc.endAngle - arc.startAngle) - 360) < 1 ||
          (arc.startAngle === 0 && arc.endAngle === 360);
        if (isFull) {
          ctx.arc(ax, ay, ar, 0, Math.PI * 2, false);
        } else {
          let sa = arc.startAngle; let ea = arc.endAngle;
          while (ea < sa) ea += 360;
          ctx.arc(ax, ay, ar, (-sa * Math.PI) / 180, (-ea * Math.PI) / 180, true);
        }
        if (arc.type === 'cut')    { ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.6; ctx.setLineDash([]); }
        else if (arc.type === 'crease') { ctx.strokeStyle = '#00d2b4'; ctx.lineWidth = 1.4; ctx.setLineDash([5 * Math.max(0.5, zoom * 0.4), 3 * Math.max(0.5, zoom * 0.4)]); }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Dimensions
    if (showDimensions && dieline.dimensions) {
      ctx.font = 'bold 10px monospace';
      for (const dim of dieline.dimensions) {
        const dx0 = scX(dim.x0); const dy0 = scY(dim.y0);
        const dx1 = scX(dim.x1); const dy1 = scY(dim.y1);
        const off = (dim.offset || 14) * zoom;
        const cx0 = dim.isVertical ? dx0 + off : dx0; const cy0 = dim.isVertical ? dy0 : dy0 - off;
        const cx1 = dim.isVertical ? dx1 + off : dx1; const cy1 = dim.isVertical ? dy1 : dy1 - off;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)'; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(cx0, cy0); ctx.lineTo(cx1, cy1);
        ctx.moveTo(dx0, dy0); ctx.lineTo(cx0, cy0);
        ctx.moveTo(dx1, dy1); ctx.lineTo(cx1, cy1);
        const tick = 3;
        ctx.moveTo(cx0 - tick, cy0 + tick); ctx.lineTo(cx0 + tick, cy0 - tick);
        ctx.moveTo(cx1 - tick, cy1 + tick); ctx.lineTo(cx1 + tick, cy1 - tick);
        ctx.stroke();
        const textX = (cx0 + cx1) / 2; const textY = (cy0 + cy1) / 2;
        const metrics = ctx.measureText(dim.text);
        const bgW = metrics.width + 6; const bgH = 13;
        ctx.fillStyle = 'rgba(10, 12, 16, 0.9)';
        ctx.fillRect(textX - bgW / 2, textY - bgH / 2 - 1, bgW, bgH);
        ctx.fillStyle = '#f59e0b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dim.text, textX, textY - 1);
      }
    }

    // Origin gizmo
    const ox = scX(0); const oy = scY(0);
    if (ox >= -40 && ox <= width + 40 && oy >= -40 && oy <= height + 40) {
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + 24, oy);
      ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - 24); ctx.stroke();
      ctx.font = '9px monospace'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('X', ox + 28, oy + 3); ctx.fillText('Y', ox - 2, oy - 28);
    }

    // ── Rubber-Band Selection Box ──
    if (editMode && selectionBox) {
      const bx = Math.min(selectionBox.startX, selectionBox.currentX);
      const by = Math.min(selectionBox.startY, selectionBox.currentY);
      const bw = Math.abs(selectionBox.currentX - selectionBox.startX);
      const bh = Math.abs(selectionBox.currentY - selectionBox.startY);
      if (bw > 3 || bh > 3) {
        ctx.save();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.restore();
      }
    }

    // Edit mode banner
    if (editMode) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 17, 22, 0.88)';
      ctx.fillRect(0, 0, width, 32);
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        '✏  MODO EDIÇÃO — Clique ou Arraste para selecionar • Shift+Clique para múltiplos • Ctrl+A todos • Del excluir',
        12,
        16
      );
      ctx.restore();
    }
  }, [
    displaySegs,
    dieline,
    zoom,
    pan,
    showGrid,
    showDimensions,
    showBleed,
    showRegMarks,
    editMode,
    selectedSegIndices,
    hoveredSegIdx,
    selectionBox,
  ]);

  // ─── Mouse handlers ─────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (editMode) {
      // 1. Check endpoint of single selected segment first
      if (selectedSegIndices.length === 1) {
        const ep = findClosestEndpoint(screenX, screenY, selectedSegIndices[0], 10);
        if (ep) {
          pushUndo(localSegs);
          setDraggingEndpoint({ segIdx: selectedSegIndices[0], endpoint: ep });
          return;
        }
      }

      // 2. Check if clicked directly on a line segment
      const clickedIdx = findClosestSeg(screenX, screenY, 12);
      const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;

      if (clickedIdx !== null) {
        if (isShiftOrCtrl) {
          // Toggle segment in multi-selection
          setSelectedSegIndices((prev) =>
            prev.includes(clickedIdx) ? prev.filter((i) => i !== clickedIdx) : [...prev, clickedIdx]
          );
        } else {
          // Single select or keep selection if clicked on an already multi-selected element
          if (selectedSegIndices.includes(clickedIdx) && selectedSegIndices.length > 1) {
            // Keep current multi-selection or select single
            setSelectedSegIndices([clickedIdx]);
          } else {
            setSelectedSegIndices([clickedIdx]);
          }
        }
        return;
      }

      // 3. Clicked empty space -> start Box Selection
      if (!isShiftOrCtrl) {
        setSelectedSegIndices([]);
      }
      setSelectionBox({
        startX: screenX,
        startY: screenY,
        currentX: screenX,
        currentY: screenY,
        shiftHeld: isShiftOrCtrl,
      });
      return;
    }

    // Normal pan (view mode)
    if (e.button === 0 || e.button === 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Drag endpoint
    if (editMode && draggingEndpoint) {
      const mmX = (screenX - pan.x) / zoom;
      const mmY = (pan.y - screenY) / zoom;
      setLocalSegs((prev) =>
        prev.map((s, i) => {
          if (i !== draggingEndpoint.segIdx) return s;
          if (draggingEndpoint.endpoint === 'p0') return { ...s, x0: mmX, y0: mmY };
          return { ...s, x1: mmX, y1: mmY };
        })
      );
      return;
    }

    // Box selection dragging
    if (editMode && selectionBox) {
      setSelectionBox((prev) => (prev ? { ...prev, currentX: screenX, currentY: screenY } : null));
      return;
    }

    // Hover highlight in edit mode
    if (editMode) {
      setHoveredSegIdx(findClosestSeg(screenX, screenY, 12));
    }

    // Normal pan
    if (isDragging && !editMode) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }

    // Update cursor coords
    const mmX = (screenX - pan.x) / zoom;
    const mmY = (pan.y - screenY) / zoom;
    const newCoords = { x: Math.round(mmX * 10) / 10, y: Math.round(mmY * 10) / 10 };
    setMouseMm(newCoords);
    onViewportUpdate?.({ cursorMm: newCoords, zoom });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // 1. Endpoint drag finish
    if (draggingEndpoint) {
      setDraggingEndpoint(null);
      onDielineEdit?.({ ...dieline, segments: localSegs });
      return;
    }

    // 2. Box selection finish
    if (editMode && selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);

      const widthPx = maxX - minX;
      const heightPx = maxY - minY;

      // Only perform area selection if the user dragged more than 4px
      if (widthPx > 4 || heightPx > 4) {
        // Convert screen box to mm coords
        const rectMmMinX = (minX - pan.x) / zoom;
        const rectMmMaxX = (maxX - pan.x) / zoom;
        const rectMmMinY = (pan.y - maxY) / zoom;
        const rectMmMaxY = (pan.y - minY) / zoom;

        const insideIndices: number[] = [];
        for (let i = 0; i < localSegs.length; i++) {
          const s = localSegs[i];
          if (isSegmentInRect(s.x0, s.y0, s.x1, s.y1, rectMmMinX, rectMmMinY, rectMmMaxX, rectMmMaxY)) {
            insideIndices.push(i);
          }
        }

        if (selectionBox.shiftHeld || e.shiftKey || e.ctrlKey || e.metaKey) {
          // Merge with existing
          setSelectedSegIndices((prev) => Array.from(new Set([...prev, ...insideIndices])));
        } else {
          setSelectedSegIndices(insideIndices);
        }
      }
      setSelectionBox(null);
      return;
    }

    setIsDragging(false);
  };

  // Wheel zoom
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

  // Touch
  const lastTouchPosRef  = useRef<{ x: number; y: number } | null>(null);
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
        const mx = touch.clientX - rect.left;
        const my = touch.clientY - rect.top;
        const newCoords = { x: Math.round(((mx - pan.x) / zoom) * 10) / 10, y: Math.round(((pan.y - my) / zoom) * 10) / 10 };
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
          const mx = midX - rect.left;
          const my = midY - rect.top;
          setPan({ x: mx - (mx - pan.x) * (newZoom / zoom), y: my - (my - pan.y) * (newZoom / zoom) });
          setZoom(newZoom);
          onViewportUpdate?.({ cursorMm: mouseMm, zoom: newZoom });
        }
      }
      lastTouchDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastTouchPosRef.current  = null;
    lastTouchDistRef.current = null;
  };

  // Floating panel position calculation
  const floatingPanelPos = (() => {
    if (selectedSegIndices.length === 0 || !editMode) return null;

    if (selectedSegIndices.length === 1) {
      const s = localSegs[selectedSegIndices[0]];
      if (!s) return null;
      const midMmX = (s.x0 + s.x1) / 2;
      const midMmY = (s.y0 + s.y1) / 2;
      return {
        x: pan.x + midMmX * zoom,
        y: pan.y - midMmY * zoom,
      };
    }

    // For multi-selection, calculate centroid of all selected segments
    let sumX = 0;
    let sumY = 0;
    let validCount = 0;
    for (const idx of selectedSegIndices) {
      const s = localSegs[idx];
      if (s) {
        sumX += (s.x0 + s.x1) / 2;
        sumY += (s.y0 + s.y1) / 2;
        validCount++;
      }
    }
    if (validCount === 0) return null;
    return {
      x: pan.x + (sumX / validCount) * zoom,
      y: pan.y - (sumY / validCount) * zoom,
    };
  })();

  const containerW = containerRef.current?.clientWidth ?? 900;

  // Aggregate stats for multi-selection
  const multiTypeCounts = (() => {
    const counts = { cut: 0, crease: 0, perfo: 0 };
    for (const idx of selectedSegIndices) {
      const s = localSegs[idx];
      if (s && s.type in counts) counts[s.type as keyof typeof counts]++;
    }
    return counts;
  })();

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
          cursor: editMode
            ? draggingEndpoint
              ? 'grabbing'
              : selectionBox
              ? 'crosshair'
              : hoveredSegIdx !== null
              ? 'pointer'
              : 'crosshair'
            : isDragging
            ? 'grabbing'
            : 'crosshair',
          touchAction: 'none',
        }}
      />

      {/* ── Floating Edit Panel ── */}
      {editMode && selectedSegIndices.length > 0 && floatingPanelPos && (() => {
        const isSingle = selectedSegIndices.length === 1;
        const singleSeg = isSingle ? localSegs[selectedSegIndices[0]] : null;
        const panelW = isSingle ? 260 : 300;
        const rawLeft = floatingPanelPos.x - panelW / 2;
        const left = Math.max(8, Math.min(rawLeft, containerW - panelW - 8));
        const top = Math.max(40, floatingPanelPos.y - 150);

        return (
          <div
            style={{
              position: 'absolute',
              left,
              top,
              width: panelW,
              background: 'var(--cad-bg-panel, #1e222b)',
              border: '1.5px solid #fbbf24',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              zIndex: 40,
              boxShadow: '0 8px 32px rgba(0,0,0,0.85)',
              pointerEvents: 'all',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', letterSpacing: 0.5 }}>
                {isSingle
                  ? `LINHA ${selectedSegIndices[0] + 1} / ${localSegs.length}`
                  : `✦ ${selectedSegIndices.length} LINHAS SELECIONADAS`}
              </span>
              {isSingle && singleSeg && (
                <span
                  style={{
                    fontSize: 9,
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: (TYPE_OPTIONS.find((o) => o.type === singleSeg.type)?.color ?? '#999') + '22',
                    color: TYPE_OPTIONS.find((o) => o.type === singleSeg.type)?.color,
                    fontWeight: 700,
                    border: `1px solid ${(TYPE_OPTIONS.find((o) => o.type === singleSeg.type)?.color ?? '#999')}55`,
                  }}
                >
                  {singleSeg.type.toUpperCase()}
                </span>
              )}
              {!isSingle && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  title="Desmarcar seleção (Esc)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Multi-selection summary counts */}
            {!isSingle && (
              <div style={{ display: 'flex', gap: 6, fontSize: 10, color: '#94a3b8' }}>
                {multiTypeCounts.cut > 0 && (
                  <span style={{ color: '#ef4444' }}>{multiTypeCounts.cut} Corte</span>
                )}
                {multiTypeCounts.crease > 0 && (
                  <span style={{ color: '#00d2b4' }}>{multiTypeCounts.crease} Vinco</span>
                )}
                {multiTypeCounts.perfo > 0 && (
                  <span style={{ color: '#10b981' }}>{multiTypeCounts.perfo} Picote</span>
                )}
              </div>
            )}

            {/* Type buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {isSingle ? 'Alterar Tipo:' : 'Alterar Todas Para:'}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleChangeType(opt.type)}
                    style={{
                      flex: 1,
                      padding: '7px 4px',
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 5,
                      border: isSingle && singleSeg?.type === opt.type
                        ? `2px solid ${opt.color}`
                        : '1px solid rgba(255,255,255,0.12)',
                      background: isSingle && singleSeg?.type === opt.type
                        ? `${opt.color}22`
                        : 'rgba(255,255,255,0.05)',
                      color: opt.color,
                      cursor: 'pointer',
                      transition: 'all 0.1s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Coordinates (single select only) */}
            {isSingle && singleSeg && (
              <div style={{ fontSize: 10, color: '#9aa5b9', fontFamily: 'monospace', lineHeight: 1.6 }}>
                <div>P0: ({singleSeg.x0.toFixed(1)}, {singleSeg.y0.toFixed(1)}) mm</div>
                <div>P1: ({singleSeg.x1.toFixed(1)}, {singleSeg.y1.toFixed(1)}) mm</div>
                <div style={{ color: '#ddd', marginTop: 2 }}>
                  Comprimento: {Math.hypot(singleSeg.x1 - singleSeg.x0, singleSeg.y1 - singleSeg.y0).toFixed(1)} mm
                </div>
              </div>
            )}

            {/* Tip */}
            <div style={{ fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>
              {isSingle
                ? '💡 Arraste os círculos amarelos para mover os pontos'
                : '💡 Shift+Clique ou arraste caixa para adicionar/remover'}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)',
                  color: undoStack.length === 0 ? '#444' : '#e2e8f0',
                  cursor: undoStack.length === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <Undo2 size={12} />
                Desfazer
              </button>

              <button
                type="button"
                onClick={handleDeleteSelected}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 5,
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.12)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <Trash2 size={12} />
                {isSingle ? 'Excluir' : `Excluir (${selectedSegIndices.length})`}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Toolbar ── */}
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
          border: editMode ? '1px solid #fbbf24' : '1px solid var(--cad-border-default)',
          boxShadow: editMode ? '0 0 12px rgba(251,191,36,0.3)' : 'var(--cad-shadow-subtle)',
          zIndex: 15,
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {/* Edit mode toggle */}
        <button
          type="button"
          className={`cad-tool-btn cad-tooltip ${editMode ? 'active' : ''}`}
          data-tooltip={editMode ? 'Sair do Modo Edição (Esc)' : 'Editar Linhas da Faca'}
          onClick={() => {
            setEditMode((e) => !e);
            setSelectedSegIndices([]);
            setHoveredSegIdx(null);
            setDraggingEndpoint(null);
            setSelectionBox(null);
          }}
          style={{
            color: editMode ? '#fbbf24' : undefined,
            borderColor: editMode ? '#fbbf24' : undefined,
            background: editMode ? 'rgba(251,191,36,0.12)' : undefined,
          }}
        >
          <Edit2 size={15} />
        </button>

        {/* Select All shortcut in toolbar */}
        {editMode && (
          <button
            type="button"
            className="cad-tool-btn cad-tooltip"
            data-tooltip="Selecionar Todas as Linhas (Ctrl+A)"
            onClick={handleSelectAll}
          >
            <CheckSquare size={15} />
          </button>
        )}

        {/* Undo shortcut in toolbar */}
        {editMode && (
          <button
            type="button"
            className="cad-tool-btn cad-tooltip"
            data-tooltip={`Desfazer (${undoStack.length} ações)`}
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            style={{ opacity: undoStack.length === 0 ? 0.35 : 1 }}
          >
            <Undo2 size={15} />
          </button>
        )}

        <div style={{ width: 1, height: 18, background: 'var(--cad-border-subtle)', margin: 'auto 2px' }} />

        <button
          type="button"
          className="cad-tool-btn cad-tooltip"
          data-tooltip="Aproximar (+)"
          onClick={() => { const nz = Math.min(zoom * 1.25, 15); setZoom(nz); onViewportUpdate?.({ cursorMm: mouseMm, zoom: nz }); }}
        >
          <ZoomIn size={15} />
        </button>

        <button
          type="button"
          className="cad-tool-btn cad-tooltip"
          data-tooltip="Afastar (-)"
          onClick={() => { const nz = Math.max(zoom * 0.8, 0.05); setZoom(nz); onViewportUpdate?.({ cursorMm: mouseMm, zoom: nz }); }}
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
          onClick={() => { setPan({ x: 0, y: 0 }); fitToScreen(); }}
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* ── Legend ── */}
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
          flexWrap: 'wrap',
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
        {editMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 3, background: '#fbbf24', borderRadius: 2 }} />
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>
              {selectedSegIndices.length > 0
                ? `${selectedSegIndices.length} Selecionada${selectedSegIndices.length > 1 ? 's' : ''}`
                : 'Selecionado'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
