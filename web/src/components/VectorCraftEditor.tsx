/**
 * VectorCraftEditor — Integração Oficial VectorCraft (storytold/vectorcraft)
 *
 * Oferece a suíte completa de desenho vetorial do VectorCraft:
 *  - Aplicação oficial VectorCraft Studio compilada em Rust + WebAssembly
 *  - Modo Cloud Oficial (vectorcraft.run) como espelho de alta disponibilidade
 *  - Modo Editor 2D Rápido embutido para edições pontuais no canvas
 *  - Integração bidirecional com facas de corte/vinco do PLMPackLib (SVG / PDF / DXF)
 *  - Atualização em tempo real para a dobra 3D (Folding Studio)
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { DielineResult } from '../engine/types';
import { buildSvgContent, downloadFile } from '../engine/dxfExporter';
import { exportToPDF } from '../engine/vectorcraft/pdfExporter';
import { parseSvgToDieline } from '../engine/vectorcraft/svgImporter';
import { dielineToVectorPaths } from '../engine/vectorcraft/bezier';
import type {
  Vec2,
  VectorPath,
  VectorToolMode,
} from '../engine/vectorcraft/types';

export interface VectorCraftEditorProps {
  /** Dieline do PLMPackLib para carregar como faca */
  dieline: DielineResult;
  /** Callback para sincronizar faca editada com o sistema e dobra 3D */
  onDielineUpdate?: (dieline: DielineResult) => void;
  /** Nome ou código do modelo atual */
  modelName?: string;
}

type EditorMode = 'wasm-local' | 'cloud-mirror' | 'quick-canvas';

export const VectorCraftEditor: React.FC<VectorCraftEditorProps> = ({
  dieline,
  onDielineUpdate,
  modelName = 'Faca_Embalagem',
}) => {
  // Modo de execução do editor
  const [mode, setMode] = useState<EditorMode>('wasm-local');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showTipBanner, setShowTipBanner] = useState<boolean>(true);
  const [iframeKey, setIframeKey] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Exibição de Toast temporário
  const showToast = useCallback((msg: string, duration = 4000) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, duration);
  }, []);

  // ─── Ações de Integração CAD / SVG ─────────────────────────────────

  /** Baixa a faca atual em formato SVG otimizado para o VectorCraft */
  const handleDownloadSvg = useCallback(() => {
    try {
      const svg = buildSvgContent(dieline, {
        includeBleed: true,
        bleedMm: 5,
        includeRegistrationMarks: true,
      });
      const safeName = (modelName || 'faca').replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadFile(svg, `${safeName}_vectorcraft.svg`, 'image/svg+xml;charset=utf-8');
      showToast('📥 Faca baixada em SVG! Arraste o arquivo para dentro do VectorCraft Studio.');
    } catch (err) {
      console.error('[VectorCraft] Erro ao exportar SVG:', err);
      showToast('⚠️ Erro ao gerar SVG da faca.');
    }
  }, [dieline, modelName, showToast]);

  /** Copia o código SVG da faca para a área de transferência (Ctrl+V no VectorCraft) */
  const handleCopySvg = useCallback(() => {
    try {
      const svg = buildSvgContent(dieline, {
        includeBleed: false,
        bleedMm: 0,
        includeRegistrationMarks: false,
      });
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(svg).then(() => {
          showToast('📋 SVG copiado! Você pode colar diretamente no VectorCraft.');
          try { confetti({ particleCount: 20, spread: 40, origin: { y: 0.1 } }); } catch {}
        }).catch(() => {
          downloadFile(svg, `${modelName}_faca.svg`, 'image/svg+xml;charset=utf-8');
          showToast('📥 Não foi possível acessar a área de transferência. SVG baixado!');
        });
      } else {
        downloadFile(svg, `${modelName}_faca.svg`, 'image/svg+xml;charset=utf-8');
        showToast('📥 SVG baixado como arquivo.');
      }
    } catch (err) {
      console.error('[VectorCraft] Erro ao copiar SVG:', err);
      showToast('⚠️ Erro ao copiar SVG.');
    }
  }, [dieline, modelName, showToast]);

  /** Importa arquivo SVG ou PDF editado no VectorCraft para atualizar a faca e o 3D */
  const handleImportFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        const { dieline: parsedDieline, stats } = parseSvgToDieline(text);

        if (parsedDieline.segments.length === 0 && parsedDieline.arcs.length === 0) {
          showToast('⚠️ Nenhuma linha de corte ou vinco válida encontrada no SVG.');
          return;
        }

        if (onDielineUpdate) {
          onDielineUpdate(parsedDieline);
          try {
            confetti({ particleCount: 50, spread: 70, origin: { y: 0.15 } });
          } catch {}
          showToast(`✅ Faca importada: ${stats.cutSegments} cortes, ${stats.creaseSegments} vincos atualizados no 3D!`);
        }
      } catch (err) {
        console.error('[VectorCraft] Erro ao importar SVG:', err);
        showToast('⚠️ Erro ao processar o arquivo SVG.');
      }
    };
    reader.readAsText(file);

    // Reseta input para permitir selecionar o mesmo arquivo novamente
    event.target.value = '';
  }, [onDielineUpdate, showToast]);

  /** Exporta PDF Vetorial ISO 32000-1 usando o motor VectorCraft */
  const handleExportPdf = useCallback(() => {
    const safeName = (modelName || 'faca').replace(/[^a-zA-Z0-9_-]/g, '_');
    exportToPDF(dieline, `${safeName}_vectorcraft.pdf`, {
      title: `${modelName} - VectorCraft Engine`,
      includeBleed: true,
      bleedMm: 5,
      includeRegistrationMarks: true,
      includeDimensions: true,
      margin: 15,
    });
    try { confetti({ particleCount: 30, spread: 45, origin: { y: 0.1 } }); } catch {}
    showToast('🖨️ PDF Vetorial gerado com camadas de corte, vinco e sangria!');
  }, [dieline, modelName, showToast]);

  /** URL ativa do iframe */
  const activeUrl = useMemo(() => {
    if (mode === 'wasm-local') return '/vectorcraft/index.html';
    if (mode === 'cloud-mirror') return 'https://vectorcraft.run/app/';
    return '';
  }, [mode]);

  /** Abre a aplicação VectorCraft em uma nova janela inteira */
  const handleOpenNewTab = useCallback(() => {
    const url = mode === 'wasm-local' ? '/vectorcraft/index.html' : 'https://vectorcraft.run/app/';
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [mode]);

  /** Recarrega o iframe */
  const handleReloadIframe = useCallback(() => {
    setIframeKey((prev) => prev + 1);
    showToast('🔄 Recarregando VectorCraft Studio...');
  }, [showToast]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#16171e',
      color: '#e6edf3',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* ─── TOPO: Barra de Ferramentas & Integração ───────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        backgroundColor: '#1e1f28',
        borderBottom: '1px solid #30313a',
        flexWrap: 'wrap',
        gap: '10px',
        zIndex: 20,
      }}>
        {/* Marca & Modo de Execução */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: '#f59e0b',
              color: '#000000',
              fontWeight: 800,
              fontSize: '15px',
              boxShadow: '0 2px 6px rgba(245, 158, 11, 0.4)',
            }}>
              V
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.3px', color: '#ffffff' }}>
                  VectorCraft Studio
                </span>
                <span style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                  color: '#f59e0b',
                  fontWeight: 600,
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}>
                  Rust + WebAssembly v0.12.0
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>
                storytold/vectorcraft • Clone de Alta Precisão do Illustrator
              </div>
            </div>
          </div>

          {/* Alternador de Modo */}
          <div style={{
            display: 'inline-flex',
            backgroundColor: '#16171e',
            padding: '3px',
            borderRadius: '6px',
            border: '1px solid #30313a',
            marginLeft: '8px',
          }}>
            <button
              type="button"
              onClick={() => setMode('wasm-local')}
              style={{
                backgroundColor: mode === 'wasm-local' ? '#f59e0b' : 'transparent',
                color: mode === 'wasm-local' ? '#000000' : '#8b949e',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Executa o binário WebAssembly do VectorCraft compilado localmente em alta performance"
            >
              ⚡ WASM Local
            </button>
            <button
              type="button"
              onClick={() => setMode('cloud-mirror')}
              style={{
                backgroundColor: mode === 'cloud-mirror' ? '#f59e0b' : 'transparent',
                color: mode === 'cloud-mirror' ? '#000000' : '#8b949e',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Carrega o servidor oficial em nuvem (vectorcraft.run)"
            >
              🌐 Nuvem Oficial
            </button>
            <button
              type="button"
              onClick={() => setMode('quick-canvas')}
              style={{
                backgroundColor: mode === 'quick-canvas' ? '#f59e0b' : 'transparent',
                color: mode === 'quick-canvas' ? '#000000' : '#8b949e',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Editor vetorial 2D leve para ajustes rápidos de pontos de ancoragem"
            >
              ✏️ Modo 2D Rápido
            </button>
          </div>
        </div>

        {/* Botões de Ação de Embalagem */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleDownloadSvg}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: '#21262d',
              color: '#58a6ff',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '5px 11px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Baixa a faca da embalagem em SVG para arrastar no VectorCraft"
          >
            📥 Baixar Faca (SVG)
          </button>

          <button
            type="button"
            onClick={handleCopySvg}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: '#21262d',
              color: '#3fb950',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '5px 11px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Copia o código SVG da faca para colar com Ctrl+V no VectorCraft"
          >
            📋 Copiar SVG
          </button>

          {/* Upload Input Oculto */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".svg"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: '#238636',
              color: '#ffffff',
              border: '1px solid #2ea043',
              borderRadius: '6px',
              padding: '5px 11px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(35, 134, 54, 0.4)',
            }}
            title="Importa arquivo SVG salvo/exportado no VectorCraft para atualizar o 3D"
          >
            📤 Importar Faca Editada
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: '#21262d',
              color: '#d29922',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '5px 11px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Exporta PDF vetorial com camadas de corte e vinco ISO 32000-1"
          >
            🖨️ PDF Vetorial
          </button>

          <button
            type="button"
            onClick={handleOpenNewTab}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: '#21262d',
              color: '#c9d1d9',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '5px 9px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Abre o VectorCraft Studio em tela cheia numa nova janela"
          >
            ↗️ Nova Aba
          </button>

          {mode !== 'quick-canvas' && (
            <button
              type="button"
              onClick={handleReloadIframe}
              style={{
                backgroundColor: '#21262d',
                color: '#8b949e',
                border: '1px solid #30363d',
                borderRadius: '6px',
                padding: '5px 9px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Recarrega o ambiente WebAssembly do VectorCraft"
            >
              🔄
            </button>
          )}
        </div>
      </div>

      {/* ─── BANNER DE ORIENTAÇÃO / WORKFLOW ─────────────────────────────── */}
      {showTipBanner && mode !== 'quick-canvas' && (
        <div style={{
          backgroundColor: '#1b222d',
          borderBottom: '1px solid #1f3a5a',
          padding: '6px 16px',
          fontSize: '12px',
          color: '#79c0ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💡</span>
            <span>
              <strong>Fluxo de Produção VectorCraft:</strong> Clique em <em>"Baixar Faca (SVG)"</em> ou <em>"Copiar SVG"</em> acima para carregar as linhas da embalagem no VectorCraft. Após fazer os ajustes com a Caneta / Curvas Bézier / Efeitos, salve o SVG e clique em <em>"Importar Faca Editada"</em> para ver o modelo dobrar em 3D!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowTipBanner(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '0 4px',
            }}
            title="Fechar dica"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── TOAST TEMPORÁRIO ────────────────────────────────────────────── */}
      {toastMessage && (
        <div style={{
          position: 'absolute',
          top: '60px',
          right: '20px',
          backgroundColor: '#1f242c',
          border: '1px solid #388bfd',
          color: '#ffffff',
          padding: '10px 18px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 9999,
          fontSize: '13px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeIn 0.2s ease',
        }}>
          {toastMessage}
        </div>
      )}

      {/* ─── ÁREA PRINCIPAL: IFRAME OU EDITOR 2D ─────────────────────────── */}
      <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
        {mode !== 'quick-canvas' ? (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={activeUrl}
            title="VectorCraft Studio"
            allow="clipboard-read; clipboard-write; fullscreen"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#1e1e1e',
              display: 'block',
            }}
          />
        ) : (
          <VectorCraftQuickCanvas
            dieline={dieline}
            onDielineUpdate={onDielineUpdate}
            modelName={modelName}
          />
        )}
      </div>
    </div>
  );
};

// ─── EDITOR 2D RÁPIDO EMBUTIDO (CANVAS INTERATIVO) ──────────────────────────

interface QuickCanvasProps {
  dieline: DielineResult;
  onDielineUpdate?: (dieline: DielineResult) => void;
  modelName: string;
}

const VectorCraftQuickCanvas: React.FC<QuickCanvasProps> = ({
  dieline,
  onDielineUpdate,
  modelName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [paths, setPaths] = useState<VectorPath[]>([]);
  const [activeTool, setActiveTool] = useState<VectorToolMode>('select');
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Vec2 | null>(null);

  // Inicialização de caminhos a partir da dieline
  useEffect(() => {
    const initialPaths = dielineToVectorPaths(dieline);
    setPaths(initialPaths);

    const b = dieline.bounds || { minX: 0, minY: 0, width: 300, height: 300 };
    if (b.width > 0 && b.height > 0) {
      const zoomX = (canvasSize.w - 80) / b.width;
      const zoomY = (canvasSize.h - 80) / b.height;
      const zoom = Math.min(zoomX, zoomY, 2.5);
      setViewport({
        x: canvasSize.w / 2 - (b.minX + b.width / 2) * zoom,
        y: canvasSize.h / 2 + (b.minY + b.height / 2) * zoom,
        zoom,
      });
    }
  }, [dieline, canvasSize.w, canvasSize.h]);

  // Monitora tamanho do container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Coordenadas
  const screenToDoc = useCallback((sx: number, sy: number): Vec2 => {
    return {
      x: (sx - viewport.x) / viewport.zoom,
      y: (sy - viewport.y) / -viewport.zoom,
    };
  }, [viewport]);

  const docToScreen = useCallback((dx: number, dy: number): Vec2 => {
    return {
      x: viewport.x + dx * viewport.zoom,
      y: viewport.y - dy * viewport.zoom,
    };
  }, [viewport]);

  // Renderização no Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);

    // Fundo
    ctx.fillStyle = '#1e1f28';
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    // Grade milimétrica
    const step = 20 * viewport.zoom;
    if (step > 8) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = viewport.x % step; x < canvasSize.w; x += step) {
        ctx.moveTo(x, 0); ctx.lineTo(x, canvasSize.h);
      }
      for (let y = viewport.y % step; y < canvasSize.h; y += step) {
        ctx.moveTo(0, y); ctx.lineTo(canvasSize.w, y);
      }
      ctx.stroke();
    }

    // Renderiza caminhos
    paths.forEach((p) => {
      if (!p.visible || p.anchors.length < 2) return;
      const isSelected = selectedPathIds.has(p.id);

      ctx.save();
      ctx.beginPath();
      const p0 = docToScreen(p.anchors[0].position.x, p.anchors[0].position.y);
      ctx.moveTo(p0.x, p0.y);

      for (let i = 1; i < p.anchors.length; i++) {
        const pt = docToScreen(p.anchors[i].position.x, p.anchors[i].position.y);
        ctx.lineTo(pt.x, pt.y);
      }
      if (p.closed) ctx.closePath();

      ctx.strokeStyle = isSelected ? '#58a6ff' : (p.stroke.color || '#ef4444');
      ctx.lineWidth = isSelected ? 2 : (p.stroke.width || 1) * Math.max(1, viewport.zoom * 0.5);

      if (p.stroke.dashArray) {
        ctx.setLineDash(p.stroke.dashArray.map((d) => d * viewport.zoom));
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.restore();

      // Desenha pontos de ancoragem se selecionado
      if (isSelected) {
        p.anchors.forEach((a) => {
          const sp = docToScreen(a.position.x, a.position.y);
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#58a6ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    });
  }, [canvasSize, viewport, paths, selectedPathIds, docToScreen]);

  // Manipuladores de mouse para Pan e Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.1, Math.min(viewport.zoom * factor, 20));

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setViewport({
      x: mx - (mx - viewport.x) * (newZoom / viewport.zoom),
      y: my - (my - viewport.y) * (newZoom / viewport.zoom),
      zoom: newZoom,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setViewport((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ width: '100%', height: '100%', display: 'block', cursor: isDragging ? 'grabbing' : 'grab' }}
      />
      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '12px',
        backgroundColor: 'rgba(22, 23, 30, 0.85)',
        padding: '6px 12px',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#8b949e',
        backdropFilter: 'blur(4px)',
        border: '1px solid #30313a',
      }}>
        Zoom: {Math.round(viewport.zoom * 100)}% • Arraste com o mouse para navegar
      </div>
    </div>
  );
};

export default VectorCraftEditor;
