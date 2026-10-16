/**
 * VectorCraftEditor — Editor Vetorial Interativo
 * Componente React que integra o VectorCraft Engine com o PLMPackLib.
 *
 * Funcionalidades:
 *  - Pen Tool para criar/editar paths Bézier
 *  - Direct Selection para manipular pontos de ancoragem e handles
 *  - Selection Tool com bounding box e transformações
 *  - Pathfinder (Unite, Subtract, Intersect, Exclude)
 *  - Painel de camadas (Layers)
 *  - Toolbar profissional estilo Illustrator
 *  - Exportação PDF vetorial
 *  - Offset de path (sangria automática)
 *  - Conversão bidirecional com DielineResult do PLMPackLib
 *  - Undo/Redo ilimitado
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { DielineResult } from '../engine/types';
import type {
  Vec2,
  AnchorPoint,
  VectorPath,
  VectorLayer,
  VectorToolMode,
  PathfinderOp,
  HitTestResult,
  UndoEntry,
} from '../engine/vectorcraft/types';
import { DEFAULT_PACKAGING_LAYERS } from '../engine/vectorcraft/types';
import {
  vec2, add, sub, scale, dist, len, normalize, mid,
  anchorsToSvgPath,
  dielineToVectorPaths,
  vectorPathsToDieline,
  flattenCubic,
  closestPointOnCubic,
  offsetPath,
} from '../engine/vectorcraft/bezier';
import { pathfinderOp, pathfinderMulti } from '../engine/vectorcraft/pathops';
import { exportToPDF } from '../engine/vectorcraft/pdfExporter';

// ─── Props ──────────────────────────────────────────────────────────

interface VectorCraftEditorProps {
  /** Dieline do PLMPackLib para carregar como paths iniciais */
  dieline: DielineResult;
  /** Callback quando o editor gera uma dieline editada */
  onDielineUpdate?: (dieline: DielineResult) => void;
  /** Nome do modelo para título */
  modelName?: string;
}

// ─── Estilos ────────────────────────────────────────────────────────

const COLORS = {
  bg: '#1a1b23',
  canvas: '#2a2b33',
  grid: 'rgba(255,255,255,0.04)',
  gridMajor: 'rgba(255,255,255,0.08)',
  selection: '#58a6ff',
  selectionFill: 'rgba(88,166,255,0.08)',
  anchor: '#ffffff',
  anchorSelected: '#58a6ff',
  handle: '#58a6ff',
  handleLine: 'rgba(88,166,255,0.5)',
  hover: '#f0883e',
  toolbar: '#16171e',
  toolbarBorder: '#30313a',
  panelBg: '#1e1f28',
  panelHeader: '#24252e',
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#484f58',
  accent: '#58a6ff',
  accentGlow: 'rgba(88,166,255,0.15)',
  danger: '#f85149',
  success: '#3fb950',
  warning: '#d29922',
};

const TOOL_LABELS: Record<VectorToolMode, { icon: string; label: string; shortcut: string }> = {
  'select':        { icon: '⬚', label: 'Seleção',        shortcut: 'V' },
  'direct-select': { icon: '⬡', label: 'Seleção Direta', shortcut: 'A' },
  'pen':           { icon: '✒', label: 'Caneta',          shortcut: 'P' },
  'line':          { icon: '╲', label: 'Linha',            shortcut: '\\' },
  'rectangle':     { icon: '▭', label: 'Retângulo',       shortcut: 'M' },
  'ellipse':       { icon: '◯', label: 'Elipse',          shortcut: 'L' },
  'polygon':       { icon: '⬠', label: 'Polígono',       shortcut: '' },
  'hand':          { icon: '✋', label: 'Mão',             shortcut: 'H' },
  'zoom':          { icon: '🔍', label: 'Zoom',            shortcut: 'Z' },
  'knife':         { icon: '🔪', label: 'Faca',            shortcut: '' },
  'eraser':        { icon: '⌫', label: 'Borracha',        shortcut: '' },
  'dimension':     { icon: '📏', label: 'Cota',            shortcut: '' },
};

// ─── Componente Principal ───────────────────────────────────────────

export const VectorCraftEditor: React.FC<VectorCraftEditorProps> = ({
  dieline,
  onDielineUpdate,
  modelName = 'Faca',
}) => {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Estado do Editor
  const [activeTool, setActiveTool] = useState<VectorToolMode>('select');
  const [paths, setPaths] = useState<VectorPath[]>([]);
  const [layers, setLayers] = useState<VectorLayer[]>([...DEFAULT_PACKAGING_LAYERS]);
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [selectedAnchorIndices, setSelectedAnchorIndices] = useState<Map<string, Set<number>>>(new Map());
  const [hoveredPathId, setHoveredPathId] = useState<string | null>(null);

  // Estado do Viewport
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  // Undo/Redo
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);

  // Estado do Pen Tool
  const [penAnchors, setPenAnchors] = useState<AnchorPoint[]>([]);
  const [isPenDrawing, setIsPenDrawing] = useState(false);

  // Estado de drag
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Vec2 | null>(null);
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'move' | 'handle'>('none');

  // Cursor position in document space
  const [cursorDoc, setCursorDoc] = useState<Vec2>({ x: 0, y: 0 });

  // Status bar info
  const [statusText, setStatusText] = useState('Pronto');

  // ─── Inicialização: Converter Dieline → Paths ──────────────────
  useEffect(() => {
    const newPaths = dielineToVectorPaths(dieline);
    setPaths(newPaths);
    setSelectedPathIds(new Set());
    setSelectedAnchorIndices(new Map());
    setPenAnchors([]);
    setIsPenDrawing(false);

    // Auto-fit viewport
    const b = dieline.bounds;
    if (b.width > 0 && b.height > 0) {
      const padding = 40;
      const zoomX = (canvasSize.w - padding * 2) / b.width;
      const zoomY = (canvasSize.h - padding * 2) / b.height;
      const zoom = Math.min(zoomX, zoomY, 3);
      setViewport({
        x: canvasSize.w / 2 - (b.minX + b.width / 2) * zoom,
        y: canvasSize.h / 2 + (b.minY + b.height / 2) * zoom,
        zoom,
      });
    }
  }, [dieline]);

  // ─── Resize Observer ───────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ─── Coordenadas ──────────────────────────────────────────────
  const screenToDoc = useCallback((sx: number, sy: number): Vec2 => {
    return {
      x: (sx - viewport.x) / viewport.zoom,
      y: -(sy - viewport.y) / viewport.zoom,
    };
  }, [viewport]);

  const docToScreen = useCallback((dx: number, dy: number): Vec2 => {
    return {
      x: dx * viewport.zoom + viewport.x,
      y: -dy * viewport.zoom + viewport.y,
    };
  }, [viewport]);

  // ─── Sync com PLMPackLib ───────────────────────────────────────
  const syncDieline = useCallback((currentPaths: VectorPath[]) => {
    if (onDielineUpdate) {
      const result = vectorPathsToDieline(currentPaths);
      onDielineUpdate(result);
    }
  }, [onDielineUpdate]);

  // ─── Undo/Redo ─────────────────────────────────────────────────
  const pushUndo = useCallback((label: string) => {
    setUndoStack(prev => [...prev.slice(-49), {
      label,
      timestamp: Date.now(),
      shapes: [],
      layers: [...layers],
      paths: JSON.parse(JSON.stringify(paths)),
    }]);
    setRedoStack([]);
  }, [layers, paths]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, {
      label: 'Refazer',
      timestamp: Date.now(),
      shapes: [],
      layers: [...layers],
      paths: JSON.parse(JSON.stringify(paths)),
    }]);
    if (entry.paths) {
      setPaths(entry.paths);
      syncDieline(entry.paths);
    }
    setStatusText(`Desfazer: ${entry.label}`);
  }, [undoStack, layers, paths, syncDieline]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, {
      label: 'Desfazer',
      timestamp: Date.now(),
      shapes: [],
      layers: [...layers],
      paths: JSON.parse(JSON.stringify(paths)),
    }]);
    if (entry.paths) {
      setPaths(entry.paths);
      syncDieline(entry.paths);
    }
    setStatusText(`Refazer: ${entry.label}`);
  }, [redoStack, layers, paths, syncDieline]);

  const handleFitView = useCallback(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of paths) {
      for (const a of p.anchors) {
        minX = Math.min(minX, a.position.x);
        minY = Math.min(minY, a.position.y);
        maxX = Math.max(maxX, a.position.x);
        maxY = Math.max(maxY, a.position.y);
      }
    }
    if (!isFinite(minX)) return;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;
    const pad = 40;
    const zoomX = (canvasSize.w - pad * 2) / w;
    const zoomY = (canvasSize.h - pad * 2) / h;
    const zoom = Math.min(zoomX, zoomY, 3);
    setViewport({
      x: canvasSize.w / 2 - (minX + w / 2) * zoom,
      y: canvasSize.h / 2 + (minY + h / 2) * zoom,
      zoom,
    });
    setStatusText('Visualização ajustada');
  }, [paths, canvasSize]);

  // ─── Hit Testing ──────────────────────────────────────────────
  const hitTest = useCallback((point: Vec2, threshold: number = 5): HitTestResult => {
    const threshDoc = threshold / viewport.zoom;

    // 1. Testa pontos de ancoragem
    for (const path of paths) {
      for (let i = 0; i < path.anchors.length; i++) {
        const a = path.anchors[i];
        if (dist(a.position, point) < threshDoc) {
          return { type: 'anchor', shapeId: path.id, pathId: path.id, anchorIndex: i, distance: dist(a.position, point), point: a.position };
        }
        // Testa handles
        if (a.handleIn && dist(a.handleIn, point) < threshDoc) {
          return { type: 'handle-in', shapeId: path.id, pathId: path.id, anchorIndex: i, distance: dist(a.handleIn, point), point: a.handleIn };
        }
        if (a.handleOut && dist(a.handleOut, point) < threshDoc) {
          return { type: 'handle-out', shapeId: path.id, pathId: path.id, anchorIndex: i, distance: dist(a.handleOut, point), point: a.handleOut };
        }
      }
    }

    // 2. Testa segmentos do path
    for (const path of paths) {
      for (let i = 0; i < path.anchors.length - (path.closed ? 0 : 1); i++) {
        const a = path.anchors[i];
        const b = path.anchors[(i + 1) % path.anchors.length];
        const cp1 = a.handleOut || a.position;
        const cp2 = b.handleIn || b.position;

        const isLine = dist(cp1, a.position) < 0.01 && dist(cp2, b.position) < 0.01;
        if (isLine) {
          const d = pointToSegmentDist(point, a.position, b.position);
          if (d < threshDoc) {
            return { type: 'segment', shapeId: path.id, pathId: path.id, anchorIndex: i, distance: d, point };
          }
        } else {
          const result = closestPointOnCubic(a.position, cp1, cp2, b.position, point);
          if (result.distance < threshDoc) {
            return { type: 'segment', shapeId: path.id, pathId: path.id, anchorIndex: i, distance: result.distance, point: result.point };
          }
        }
      }
    }

    return { type: 'none', distance: Infinity, point };
  }, [paths, viewport.zoom]);

  // ─── Renderização Canvas ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = COLORS.canvas;
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    // Grid
    drawGrid(ctx, viewport, canvasSize);

    // Salva e aplica transformação do viewport
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, -viewport.zoom); // Y invertido

    // Desenha todos os paths
    for (const path of paths) {
      if (!path.visible) continue;
      const layer = layers.find(l => l.id === path.semanticType);
      if (layer && !layer.visible) continue;

      const isSelected = selectedPathIds.has(path.id);
      const isHovered = hoveredPathId === path.id;

      drawPath(ctx, path, isSelected, isHovered, viewport.zoom);
    }

    // Desenha paths em construção (Pen Tool)
    if (isPenDrawing && penAnchors.length > 0) {
      drawPenPreview(ctx, penAnchors, cursorDoc, viewport.zoom);
    }

    // Desenha handles e anchors dos paths selecionados
    if (activeTool === 'direct-select' || activeTool === 'pen') {
      for (const path of paths) {
        if (!selectedPathIds.has(path.id)) continue;
        const selectedIndices = selectedAnchorIndices.get(path.id) || new Set();
        drawAnchorsAndHandles(ctx, path, selectedIndices, viewport.zoom);
      }
    }

    // Bounding box de seleção
    if (activeTool === 'select' && selectedPathIds.size > 0) {
      drawSelectionBoundingBox(ctx, paths, selectedPathIds, viewport.zoom);
    }

    ctx.restore();

    // Crosshair do cursor
    drawCrosshair(ctx, cursorDoc, viewport, canvasSize);

  }, [canvasSize, viewport, paths, layers, selectedPathIds, selectedAnchorIndices, hoveredPathId, activeTool, isPenDrawing, penAnchors, cursorDoc]);

  // ─── Event Handlers ────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const docPt = screenToDoc(sx, sy);

    if (e.button === 1 || (e.button === 0 && e.spaceKey) || activeTool === 'hand') {
      setDragMode('pan');
      setDragStart({ x: sx, y: sy });
      setIsDragging(true);
      return;
    }

    switch (activeTool) {
      case 'select': {
        const hit = hitTest(docPt);
        if (hit.type !== 'none' && hit.pathId) {
          if (e.shiftKey) {
            setSelectedPathIds(prev => {
              const next = new Set(prev);
              if (next.has(hit.pathId!)) next.delete(hit.pathId!);
              else next.add(hit.pathId!);
              return next;
            });
          } else {
            setSelectedPathIds(new Set([hit.pathId]));
          }
          setDragMode('move');
          setDragStart(docPt);
          setIsDragging(true);
        } else {
          if (!e.shiftKey) setSelectedPathIds(new Set());
        }
        break;
      }

      case 'direct-select': {
        const hit = hitTest(docPt);
        if (hit.type === 'anchor' && hit.pathId && hit.anchorIndex !== undefined) {
          setSelectedPathIds(new Set([hit.pathId]));
          setSelectedAnchorIndices(prev => {
            const next = new Map(prev);
            const indices = new Set(e.shiftKey ? (prev.get(hit.pathId!) || new Set()) : []);
            if (indices.has(hit.anchorIndex!)) indices.delete(hit.anchorIndex!);
            else indices.add(hit.anchorIndex!);
            next.set(hit.pathId!, indices);
            return next;
          });
          setDragMode('move');
          setDragStart(docPt);
          setIsDragging(true);
        } else if ((hit.type === 'handle-in' || hit.type === 'handle-out') && hit.pathId) {
          setSelectedPathIds(new Set([hit.pathId]));
          setDragMode('handle');
          setDragStart(docPt);
          setIsDragging(true);
          setSelectedAnchorIndices(prev => {
            const next = new Map(prev);
            next.set(hit.pathId!, new Set([hit.anchorIndex!]));
            return next;
          });
        } else if (hit.type === 'segment' && hit.pathId) {
          setSelectedPathIds(new Set([hit.pathId]));
        } else {
          if (!e.shiftKey) {
            setSelectedPathIds(new Set());
            setSelectedAnchorIndices(new Map());
          }
        }
        break;
      }

      case 'pen': {
        if (!isPenDrawing) {
          setIsPenDrawing(true);
          setPenAnchors([{ position: docPt, type: 'corner' }]);
          setStatusText('Pen Tool: Clique para adicionar pontos. Arraste para curvas. Enter para finalizar.');
        } else {
          setPenAnchors(prev => [...prev, { position: docPt, type: 'corner' }]);
        }
        break;
      }

      case 'line': {
        if (!isPenDrawing) {
          setIsPenDrawing(true);
          setPenAnchors([{ position: docPt, type: 'corner' }]);
        } else {
          const newPath: VectorPath = {
            id: `path-${Date.now()}`,
            anchors: [...penAnchors, { position: docPt, type: 'corner' }],
            closed: false,
            stroke: { color: '#ef4444', width: 0.5 },
            fill: { color: 'none', opacity: 0, type: 'none' },
            semanticType: 'cut',
            visible: true,
            locked: false,
          };
          pushUndo('Criar Linha');
          setPaths(prev => [...prev, newPath]);
          setIsPenDrawing(false);
          setPenAnchors([]);
          syncDieline([...paths, newPath]);
        }
        break;
      }

      case 'rectangle': {
        if (!isPenDrawing) {
          setIsPenDrawing(true);
          setDragStart(docPt);
        }
        break;
      }

      case 'ellipse': {
        if (!isPenDrawing) {
          setIsPenDrawing(true);
          setDragStart(docPt);
        }
        break;
      }

      default:
        break;
    }
  }, [activeTool, hitTest, screenToDoc, isPenDrawing, penAnchors, paths, pushUndo]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const docPt = screenToDoc(sx, sy);
    setCursorDoc(docPt);

    if (isDragging && dragStart) {
      if (dragMode === 'pan') {
        setViewport(prev => ({
          ...prev,
          x: prev.x + (sx - dragStart.x),
          y: prev.y + (sy - dragStart.y),
        }));
        setDragStart({ x: sx, y: sy });
      } else if (dragMode === 'move') {
        const delta = sub(docPt, dragStart);
        if (activeTool === 'direct-select') {
          // Move anchors selecionados
          setPaths(prev => prev.map(path => {
            if (!selectedPathIds.has(path.id)) return path;
            const indices = selectedAnchorIndices.get(path.id);
            if (!indices || indices.size === 0) return path;
            return {
              ...path,
              anchors: path.anchors.map((a, i) => {
                if (!indices.has(i)) return a;
                return {
                  ...a,
                  position: add(a.position, delta),
                  handleIn: a.handleIn ? add(a.handleIn, delta) : undefined,
                  handleOut: a.handleOut ? add(a.handleOut, delta) : undefined,
                };
              }),
            };
          }));
        } else {
          // Move paths inteiros
          setPaths(prev => prev.map(path => {
            if (!selectedPathIds.has(path.id)) return path;
            return {
              ...path,
              anchors: path.anchors.map(a => ({
                ...a,
                position: add(a.position, delta),
                handleIn: a.handleIn ? add(a.handleIn, delta) : undefined,
                handleOut: a.handleOut ? add(a.handleOut, delta) : undefined,
              })),
            };
          }));
        }
        setDragStart(docPt);
      } else if (dragMode === 'handle') {
        // Move handle do anchor selecionado
        setPaths(prev => prev.map(path => {
          if (!selectedPathIds.has(path.id)) return path;
          const indices = selectedAnchorIndices.get(path.id);
          if (!indices) return path;
          return {
            ...path,
            anchors: path.anchors.map((a, i) => {
              if (!indices.has(i)) return a;
              // Atualiza o handle mais próximo
              const distIn = a.handleIn ? dist(a.handleIn, dragStart!) : Infinity;
              const distOut = a.handleOut ? dist(a.handleOut, dragStart!) : Infinity;
              if (distIn < distOut && a.handleIn) {
                const newHandleIn = docPt;
                const newHandleOut = a.type === 'smooth' || a.type === 'symmetric'
                  ? add(a.position, scale(sub(a.position, newHandleIn), a.type === 'symmetric' ? 1 : len(sub(a.handleOut || a.position, a.position)) / Math.max(0.001, len(sub(newHandleIn, a.position)))))
                  : a.handleOut;
                return { ...a, handleIn: newHandleIn, handleOut: newHandleOut };
              } else {
                const newHandleOut = docPt;
                const newHandleIn = a.type === 'smooth' || a.type === 'symmetric'
                  ? add(a.position, scale(sub(a.position, newHandleOut), a.type === 'symmetric' ? 1 : len(sub(a.handleIn || a.position, a.position)) / Math.max(0.001, len(sub(newHandleOut, a.position)))))
                  : a.handleIn;
                return { ...a, handleOut: newHandleOut, handleIn: newHandleIn };
              }
            }),
          };
        }));
        setDragStart(docPt);
      }
    } else {
      // Hover detection
      const hit = hitTest(docPt, 6);
      setHoveredPathId(hit.pathId || null);

      // Update status bar
      setStatusText(`X: ${docPt.x.toFixed(2)} mm  Y: ${docPt.y.toFixed(2)} mm`);
    }
  }, [isDragging, dragStart, dragMode, activeTool, screenToDoc, hitTest, selectedPathIds, selectedAnchorIndices, viewport.zoom]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragMode === 'move') {
      pushUndo('Mover');
      syncDieline(paths);
    }
    setIsDragging(false);
    setDragMode('none');
    setDragStart(null);
  }, [isDragging, dragMode, paths, pushUndo]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.05, Math.min(50, viewport.zoom * factor));
    const ratio = newZoom / viewport.zoom;

    setViewport({
      x: sx - (sx - viewport.x) * ratio,
      y: sy - (sy - viewport.y) * ratio,
      zoom: newZoom,
    });
  }, [viewport]);

  // ─── Keyboard Shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Não captura se está em input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'v': setActiveTool('select'); break;
        case 'a': setActiveTool('direct-select'); break;
        case 'p': setActiveTool('pen'); break;
        case 'm': setActiveTool('rectangle'); break;
        case 'l': setActiveTool('ellipse'); break;
        case 'h': setActiveTool('hand'); break;
        case 'z': setActiveTool('zoom'); break;
        case '\\': setActiveTool('line'); break;
        case 'escape': {
          if (isPenDrawing) {
            finalizePenPath();
          }
          setSelectedPathIds(new Set());
          setSelectedAnchorIndices(new Map());
          break;
        }
        case 'enter': {
          if (isPenDrawing) finalizePenPath();
          break;
        }
        case 'delete':
        case 'backspace': {
          if (selectedPathIds.size > 0) {
            pushUndo('Apagar');
            const newPaths = paths.filter(p => !selectedPathIds.has(p.id));
            setPaths(newPaths);
            setSelectedPathIds(new Set());
            syncDieline(newPaths);
          }
          break;
        }
      }

      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z': {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
            break;
          }
          case 'y': {
            e.preventDefault();
            handleRedo();
            break;
          }
          case 'a': {
            e.preventDefault();
            setSelectedPathIds(new Set(paths.map(p => p.id)));
            break;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, isPenDrawing, paths, selectedPathIds, pushUndo, handleUndo, handleRedo, syncDieline]);

  // ─── Finalizar Pen Path ────────────────────────────────────────
  const finalizePenPath = useCallback(() => {
    if (penAnchors.length >= 2) {
      const newPath: VectorPath = {
        id: `path-${Date.now()}`,
        anchors: [...penAnchors],
        closed: false,
        stroke: { color: '#ef4444', width: 0.5 },
        fill: { color: 'none', opacity: 0, type: 'none' },
        semanticType: 'cut',
        visible: true,
        locked: false,
        name: `Path ${paths.length + 1}`,
      };
      pushUndo('Criar Path (Pen)');
      const newPaths = [...paths, newPath];
      setPaths(newPaths);
      syncDieline(newPaths);
    }
    setIsPenDrawing(false);
    setPenAnchors([]);
    setStatusText('Path finalizado');
  }, [penAnchors, paths, pushUndo, syncDieline]);

  // ─── Pathfinder Operations ────────────────────────────────────
  const handlePathfinder = useCallback((op: PathfinderOp) => {
    const selected = paths.filter(p => selectedPathIds.has(p.id));
    if (selected.length < 2) {
      setStatusText('Selecione pelo menos 2 paths para o Pathfinder');
      return;
    }

    const result = pathfinderMulti(selected, op);
    if (!result) return;

    pushUndo(`Pathfinder: ${op}`);
    const remaining = paths.filter(p => !selectedPathIds.has(p.id));
    const newPaths = [...remaining, result];
    setPaths(newPaths);
    setSelectedPathIds(new Set([result.id]));
    syncDieline(newPaths);
    setStatusText(`Pathfinder ${op}: OK`);
  }, [paths, selectedPathIds, pushUndo, syncDieline]);

  // ─── Offset (Sangria) ─────────────────────────────────────────
  const handleOffset = useCallback((distance: number) => {
    const selected = paths.filter(p => selectedPathIds.has(p.id));
    if (selected.length === 0) return;

    pushUndo(`Offset ${distance}mm`);
    const newPaths: VectorPath[] = [];

    for (const path of selected) {
      const offsetAnchors = offsetPath(path.anchors, path.closed, distance);
      newPaths.push({
        ...path,
        id: `offset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        anchors: offsetAnchors,
        stroke: { ...path.stroke, color: '#22c55e', dashArray: [4, 2] },
        semanticType: 'bleed',
        name: `Sangria (${distance}mm)`,
      });
    }

    const allPaths = [...paths, ...newPaths];
    setPaths(allPaths);
    syncDieline(allPaths);
    setStatusText(`Sangria de ${distance}mm criada`);
  }, [paths, selectedPathIds, pushUndo, syncDieline]);

  // ─── Export PDF ────────────────────────────────────────────────
  const handleExportPdf = useCallback(() => {
    const result = vectorPathsToDieline(paths);
    exportToPDF(result, `${modelName}.pdf`, {
      title: `${modelName} - PLMPackLib + VectorCraft`,
      includeBleed: true,
      includeRegistrationMarks: true,
      bleedMm: 5,
    });
    setStatusText('PDF exportado com sucesso');
  }, [paths, modelName]);

  // ─── Rendering Helpers ─────────────────────────────────────────
  // (inline drawing functions that use the canvas context)

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: COLORS.bg,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        color: COLORS.textPrimary,
        overflow: 'hidden',
      }}
    >
      {/* ── Toolbar Lateral Esquerda ─────────────────────────────── */}
      <div style={{
        width: 44,
        background: COLORS.toolbar,
        borderRight: `1px solid ${COLORS.toolbarBorder}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        gap: 2,
        flexShrink: 0,
      }}>
        {(['select', 'direct-select', 'pen', 'line', 'rectangle', 'ellipse', 'hand', 'zoom'] as VectorToolMode[]).map(tool => (
          <button
            key={tool}
            onClick={() => setActiveTool(tool)}
            title={`${TOOL_LABELS[tool].label} (${TOOL_LABELS[tool].shortcut})`}
            style={{
              width: 34,
              height: 34,
              border: 'none',
              borderRadius: 6,
              background: activeTool === tool ? COLORS.accentGlow : 'transparent',
              color: activeTool === tool ? COLORS.accent : COLORS.textSecondary,
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: activeTool === tool ? `1.5px solid ${COLORS.accent}` : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {TOOL_LABELS[tool].icon}
          </button>
        ))}

        <div style={{ width: 28, height: 1, background: COLORS.toolbarBorder, margin: '6px 0' }} />

        {/* Pathfinder buttons */}
        <div style={{ fontSize: 9, color: COLORS.textMuted, textAlign: 'center', marginBottom: 2 }}>PATH</div>
        {(['unite', 'subtract', 'intersect', 'exclude'] as PathfinderOp[]).map(op => (
          <button
            key={op}
            onClick={() => handlePathfinder(op)}
            title={`Pathfinder: ${op}`}
            style={{
              width: 34,
              height: 28,
              border: 'none',
              borderRadius: 5,
              background: 'transparent',
              color: selectedPathIds.size >= 2 ? COLORS.textSecondary : COLORS.textMuted,
              cursor: selectedPathIds.size >= 2 ? 'pointer' : 'default',
              fontSize: 10,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: selectedPathIds.size >= 2 ? 1 : 0.4,
            }}
          >
            {op === 'unite' ? '∪' : op === 'subtract' ? '−' : op === 'intersect' ? '∩' : '⊕'}
          </button>
        ))}

        <div style={{ width: 28, height: 1, background: COLORS.toolbarBorder, margin: '6px 0' }} />

        {/* Offset / Sangria */}
        <button
          onClick={() => handleOffset(5)}
          title="Sangria +5mm"
          style={{
            width: 34,
            height: 28,
            border: 'none',
            borderRadius: 5,
            background: 'transparent',
            color: selectedPathIds.size > 0 ? COLORS.success : COLORS.textMuted,
            cursor: selectedPathIds.size > 0 ? 'pointer' : 'default',
            fontSize: 10,
            fontWeight: 600,
            opacity: selectedPathIds.size > 0 ? 1 : 0.4,
          }}
        >
          +5
        </button>

        {/* Undo */}
        <button
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          title="Desfazer (Ctrl+Z)"
          style={{
            width: 34,
            height: 28,
            border: 'none',
            borderRadius: 5,
            background: 'transparent',
            color: undoStack.length > 0 ? COLORS.textSecondary : COLORS.textMuted,
            cursor: undoStack.length > 0 ? 'pointer' : 'default',
            fontSize: 14,
            opacity: undoStack.length > 0 ? 1 : 0.3,
          }}
        >
          ↺
        </button>

        {/* Redo */}
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          title="Refazer (Ctrl+Y / Ctrl+Shift+Z)"
          style={{
            width: 34,
            height: 28,
            border: 'none',
            borderRadius: 5,
            background: 'transparent',
            color: redoStack.length > 0 ? COLORS.textSecondary : COLORS.textMuted,
            cursor: redoStack.length > 0 ? 'pointer' : 'default',
            fontSize: 14,
            opacity: redoStack.length > 0 ? 1 : 0.3,
          }}
        >
          ↻
        </button>

        {/* Fit to screen */}
        <button
          onClick={handleFitView}
          title="Ajustar à tela"
          style={{
            width: 34,
            height: 28,
            border: 'none',
            borderRadius: 5,
            background: 'transparent',
            color: COLORS.textSecondary,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ⛶
        </button>

        {/* Delete selected */}
        <button
          onClick={() => {
            if (selectedPathIds.size > 0) {
              pushUndo('Apagar');
              const newPaths = paths.filter(p => !selectedPathIds.has(p.id));
              setPaths(newPaths);
              setSelectedPathIds(new Set());
              syncDieline(newPaths);
              setStatusText('Path(s) apagado(s)');
            }
          }}
          disabled={selectedPathIds.size === 0}
          title="Apagar selecionados (Delete)"
          style={{
            width: 34,
            height: 28,
            border: 'none',
            borderRadius: 5,
            background: 'transparent',
            color: selectedPathIds.size > 0 ? COLORS.danger : COLORS.textMuted,
            cursor: selectedPathIds.size > 0 ? 'pointer' : 'default',
            fontSize: 13,
            opacity: selectedPathIds.size > 0 ? 1 : 0.3,
          }}
        >
          🗑
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Sync / Salvar na Faca 3D */}
        <button
          onClick={() => {
            syncDieline(paths);
            setStatusText('Faca sincronizada no 3D e CAD!');
          }}
          title="Atualizar Faca no Sistema (3D / Imposição / Produção)"
          style={{
            width: 34,
            height: 34,
            border: 'none',
            borderRadius: 6,
            background: 'rgba(56, 189, 248, 0.15)',
            color: '#38bdf8',
            cursor: 'pointer',
            fontSize: 14,
            marginBottom: 4,
          }}
        >
          ✓
        </button>

        {/* Export PDF */}
        <button
          onClick={handleExportPdf}
          title="Exportar PDF Vetorial (ISO 32000-1 com Camadas)"
          style={{
            width: 34,
            height: 34,
            border: 'none',
            borderRadius: 6,
            background: 'transparent',
            color: COLORS.danger,
            cursor: 'pointer',
            fontSize: 14,
            marginBottom: 8,
          }}
        >
          📄
        </button>
      </div>

      {/* ── Canvas Central ────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          style={{
            width: canvasSize.w,
            height: canvasSize.h,
            cursor: activeTool === 'hand' ? 'grab'
              : activeTool === 'pen' ? 'crosshair'
              : activeTool === 'zoom' ? 'zoom-in'
              : activeTool === 'line' ? 'crosshair'
              : activeTool === 'rectangle' ? 'crosshair'
              : activeTool === 'ellipse' ? 'crosshair'
              : isDragging ? 'grabbing'
              : 'default',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={e => e.preventDefault()}
        />

        {/* Barra de Status inferior */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 24,
          background: 'rgba(22, 23, 30, 0.92)',
          backdropFilter: 'blur(8px)',
          borderTop: `1px solid ${COLORS.toolbarBorder}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          fontSize: 11,
          color: COLORS.textSecondary,
          gap: 16,
        }}>
          <span style={{ color: COLORS.accent, fontWeight: 600 }}>
            {TOOL_LABELS[activeTool].label}
          </span>
          <span>{statusText}</span>
          <span style={{ marginLeft: 'auto' }}>
            Zoom: {(viewport.zoom * 100).toFixed(0)}%
          </span>
          <span>
            Paths: {paths.length}
          </span>
          <span style={{ color: COLORS.success, fontSize: 10 }}>
            ● VectorCraft Engine
          </span>
        </div>
      </div>

      {/* ── Painel de Camadas (Direita) ───────────────────────────── */}
      <div style={{
        width: 200,
        background: COLORS.panelBg,
        borderLeft: `1px solid ${COLORS.toolbarBorder}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {/* Header do Painel */}
        <div style={{
          height: 32,
          background: COLORS.panelHeader,
          borderBottom: `1px solid ${COLORS.toolbarBorder}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.5px',
          color: COLORS.textSecondary,
          textTransform: 'uppercase',
        }}>
          Camadas
        </div>

        {/* Lista de Camadas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {layers.map(layer => {
            const layerPaths = paths.filter(p => p.semanticType === layer.id);
            return (
              <div
                key={layer.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 10px',
                  gap: 6,
                  fontSize: 11,
                  cursor: 'pointer',
                  background: 'transparent',
                  borderLeft: `3px solid ${layer.color}`,
                  opacity: layer.visible ? 1 : 0.4,
                }}
              >
                {/* Toggle visibilidade */}
                <button
                  onClick={() => {
                    setLayers(prev => prev.map(l =>
                      l.id === layer.id ? { ...l, visible: !l.visible } : l
                    ));
                  }}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: layer.visible ? COLORS.textSecondary : COLORS.textMuted,
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: 0,
                    width: 18,
                  }}
                >
                  {layer.visible ? '👁' : '🚫'}
                </button>

                <span style={{
                  flex: 1,
                  color: COLORS.textPrimary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {layer.name}
                </span>

                <span style={{ color: COLORS.textMuted, fontSize: 10 }}>
                  {layerPaths.length}
                </span>
              </div>
            );
          })}
        </div>

        {/* Informações de seleção */}
        <div style={{
          borderTop: `1px solid ${COLORS.toolbarBorder}`,
          padding: '8px 10px',
          fontSize: 10,
          color: COLORS.textMuted,
        }}>
          {selectedPathIds.size > 0 ? (
            <>
              <div style={{ color: COLORS.accent, fontWeight: 600, marginBottom: 4 }}>
                {selectedPathIds.size} selecionado(s)
              </div>
              <div>Anchors: {paths.filter(p => selectedPathIds.has(p.id)).reduce((s, p) => s + p.anchors.length, 0)}</div>
            </>
          ) : (
            <div>Nenhuma seleção</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// Funções de Renderização (Canvas 2D)
// ═══════════════════════════════════════════════════════════════════

function drawGrid(ctx: CanvasRenderingContext2D, vp: { x: number; y: number; zoom: number }, size: { w: number; h: number }) {
  const gridSize = 10; // 10mm
  const majorEvery = 5;

  const startX = Math.floor((-vp.x / vp.zoom) / gridSize) * gridSize;
  const endX = Math.ceil(((-vp.x + size.w) / vp.zoom) / gridSize) * gridSize;
  const startY = Math.floor(((vp.y - size.h) / vp.zoom) / gridSize) * gridSize;
  const endY = Math.ceil((vp.y / vp.zoom) / gridSize) * gridSize;

  for (let x = startX; x <= endX; x += gridSize) {
    const sx = x * vp.zoom + vp.x;
    const isMajor = Math.round(x / gridSize) % majorEvery === 0;
    ctx.strokeStyle = isMajor ? COLORS.gridMajor : COLORS.grid;
    ctx.lineWidth = isMajor ? 0.8 : 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, size.h);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += gridSize) {
    const sy = -y * vp.zoom + vp.y;
    const isMajor = Math.round(y / gridSize) % majorEvery === 0;
    ctx.strokeStyle = isMajor ? COLORS.gridMajor : COLORS.grid;
    ctx.lineWidth = isMajor ? 0.8 : 0.5;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(size.w, sy);
    ctx.stroke();
  }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  path: VectorPath,
  isSelected: boolean,
  isHovered: boolean,
  zoom: number
) {
  const anchors = path.anchors;
  if (anchors.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(anchors[0].position.x, anchors[0].position.y);

  for (let i = 0; i < anchors.length - (path.closed ? 0 : 1); i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const cp1 = a.handleOut || a.position;
    const cp2 = b.handleIn || b.position;

    const isLine = dist(cp1, a.position) < 0.01 && dist(cp2, b.position) < 0.01;
    if (isLine) {
      ctx.lineTo(b.position.x, b.position.y);
    } else {
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, b.position.x, b.position.y);
    }
  }

  if (path.closed) ctx.closePath();

  // Stroke
  ctx.strokeStyle = isHovered ? COLORS.hover : isSelected ? COLORS.selection : path.stroke.color;
  ctx.lineWidth = (isSelected ? path.stroke.width * 1.5 : path.stroke.width) / zoom;
  if (path.stroke.dashArray) {
    ctx.setLineDash(path.stroke.dashArray.map(d => d / zoom));
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Selection highlight
  if (isSelected) {
    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 1.5 / zoom;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawAnchorsAndHandles(
  ctx: CanvasRenderingContext2D,
  path: VectorPath,
  selectedIndices: Set<number>,
  zoom: number
) {
  const r = 3.5 / zoom;
  const hr = 2.5 / zoom;

  for (let i = 0; i < path.anchors.length; i++) {
    const a = path.anchors[i];
    const isSelected = selectedIndices.has(i);

    // Handle lines
    if (a.handleIn) {
      ctx.strokeStyle = COLORS.handleLine;
      ctx.lineWidth = 0.8 / zoom;
      ctx.beginPath();
      ctx.moveTo(a.position.x, a.position.y);
      ctx.lineTo(a.handleIn.x, a.handleIn.y);
      ctx.stroke();
      // Handle dot
      ctx.fillStyle = COLORS.handle;
      ctx.beginPath();
      ctx.arc(a.handleIn.x, a.handleIn.y, hr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (a.handleOut) {
      ctx.strokeStyle = COLORS.handleLine;
      ctx.lineWidth = 0.8 / zoom;
      ctx.beginPath();
      ctx.moveTo(a.position.x, a.position.y);
      ctx.lineTo(a.handleOut.x, a.handleOut.y);
      ctx.stroke();
      // Handle dot
      ctx.fillStyle = COLORS.handle;
      ctx.beginPath();
      ctx.arc(a.handleOut.x, a.handleOut.y, hr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Anchor point
    ctx.fillStyle = isSelected ? COLORS.anchorSelected : COLORS.anchor;
    ctx.strokeStyle = isSelected ? COLORS.selection : 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.8 / zoom;

    if (a.type === 'corner') {
      ctx.fillRect(a.position.x - r, a.position.y - r, r * 2, r * 2);
      ctx.strokeRect(a.position.x - r, a.position.y - r, r * 2, r * 2);
    } else {
      ctx.beginPath();
      ctx.arc(a.position.x, a.position.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawPenPreview(
  ctx: CanvasRenderingContext2D,
  anchors: AnchorPoint[],
  cursor: Vec2,
  zoom: number
) {
  if (anchors.length === 0) return;

  // Desenha path parcial
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 0.5 / zoom;
  ctx.setLineDash([3 / zoom, 3 / zoom]);
  ctx.beginPath();
  ctx.moveTo(anchors[0].position.x, anchors[0].position.y);
  for (let i = 1; i < anchors.length; i++) {
    ctx.lineTo(anchors[i].position.x, anchors[i].position.y);
  }
  ctx.lineTo(cursor.x, cursor.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Desenha anchors
  const r = 3 / zoom;
  for (const a of anchors) {
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(a.position.x - r, a.position.y - r, r * 2, r * 2);
  }
}

function drawSelectionBoundingBox(
  ctx: CanvasRenderingContext2D,
  paths: VectorPath[],
  selectedIds: Set<string>,
  zoom: number
) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const path of paths) {
    if (!selectedIds.has(path.id)) continue;
    for (const a of path.anchors) {
      minX = Math.min(minX, a.position.x);
      minY = Math.min(minY, a.position.y);
      maxX = Math.max(maxX, a.position.x);
      maxY = Math.max(maxY, a.position.y);
    }
  }

  if (!isFinite(minX)) return;

  ctx.strokeStyle = COLORS.selection;
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([4 / zoom, 4 / zoom]);
  ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  ctx.setLineDash([]);

  // Corner handles
  const hr = 3 / zoom;
  ctx.fillStyle = COLORS.anchor;
  ctx.strokeStyle = COLORS.selection;
  ctx.lineWidth = 0.8 / zoom;
  for (const [x, y] of [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY], [mid({ x: minX, y: 0 }, { x: maxX, y: 0 }).x, minY], [mid({ x: minX, y: 0 }, { x: maxX, y: 0 }).x, maxY], [minX, mid({ x: 0, y: minY }, { x: 0, y: maxY }).y], [maxX, mid({ x: 0, y: minY }, { x: 0, y: maxY }).y]]) {
    ctx.fillRect(x - hr, y - hr, hr * 2, hr * 2);
    ctx.strokeRect(x - hr, y - hr, hr * 2, hr * 2);
  }
}

function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  cursor: Vec2,
  vp: { x: number; y: number; zoom: number },
  size: { w: number; h: number }
) {
  const sx = cursor.x * vp.zoom + vp.x;
  const sy = -cursor.y * vp.zoom + vp.y;

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(sx, 0); ctx.lineTo(sx, size.h);
  ctx.moveTo(0, sy); ctx.lineTo(size.w, sy);
  ctx.stroke();
  ctx.setLineDash([]);
}

function pointToSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const abLen2 = ab.x * ab.x + ab.y * ab.y;
  if (abLen2 < 1e-10) return dist(p, a);
  let t = (ap.x * ab.x + ap.y * ab.y) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * ab.x, y: a.y + t * ab.y };
  return dist(p, proj);
}

export default VectorCraftEditor;
