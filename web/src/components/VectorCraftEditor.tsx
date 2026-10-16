import React, { useState, useRef, useMemo } from 'react';
import type { DielineResult } from '../engine/types';
import {
  MousePointer,
  Navigation,
  PenTool,
  Spline,
  Square,
  Circle,
  Paintbrush,
  Pencil,
  Type as TypeIcon,
  RotateCw,
  Scale as ScaleIcon,
  Maximize2,
  Shapes,
  Pipette,
  Blend,
  Grid,
  Hand,
  ZoomIn,
  Search,
  ChevronDown,
  Layers,
  Sliders,
  BookOpen,
  Palette,
  Minus,
  X,
  Lock,
  Copy,
  Trash2,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link2,
  FlipHorizontal,
  FlipVertical,
  MoreHorizontal,
  Eye,
  ChevronRight,
  HelpCircle,
  Home,
  Menu,
} from 'lucide-react';

export interface VectorCraftEditorProps {
  dieline?: DielineResult;
  modelName?: string;
  onDielineUpdate?: (dieline: DielineResult) => void;
  onSwitchWorkspace?: (tab: '2d' | '3d' | 'imposition' | 'vectorcraft') => void;
  onClose?: () => void;
}

export const VectorCraftEditor: React.FC<VectorCraftEditorProps> = ({
  dieline,
  modelName = 'neon-drive',
  onDielineUpdate,
  onSwitchWorkspace,
  onClose,
}) => {
  // Estado de ferramentas e visualização
  const [activeTool, setActiveTool] = useState<string>('select');
  const [useLiveWasm, setUseLiveWasm] = useState<boolean>(false);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState<boolean>(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'properties' | 'layers' | 'libraries'>('properties');
  const [zoomPercent, setZoomPercent] = useState<number>(51.41);
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [isOutlineMode, setIsOutlineMode] = useState<boolean>(false);
  const [showAppearanceFloating, setShowAppearanceFloating] = useState<boolean>(true);

  // Propriedades do objeto de texto "NEON DRIVE" selecionado
  const [objX, setObjX] = useState<number>(506.99);
  const [objY, setObjY] = useState<number>(215.516);
  const [objW, setObjW] = useState<number>(793.98);
  const [objH, setObjH] = useState<number>(175.032);
  const [fontSize, setFontSize] = useState<number>(132);
  const [leading, setLeading] = useState<number>(158.4);
  const [tracking, setTracking] = useState<number>(60);
  const [kerning, setKerning] = useState<number>(0);
  const [fillColor, setFillColor] = useState<string>('#ffffff');
  const [strokeColor, setStrokeColor] = useState<string>('none');
  const [strokeWidth, setStrokeWidth] = useState<number>(0);
  const [opacity, setOpacity] = useState<number>(100);

  // Se o usuário alternar para o binário Rust WebAssembly oficial
  if (useLiveWasm) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#181920' }}>
        <button
          type="button"
          onClick={() => setUseLiveWasm(false)}
          style={{
            position: 'absolute',
            top: 10,
            right: 140,
            zIndex: 9999,
            background: 'rgba(24, 25, 32, 0.85)',
            color: '#e6edf3',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          Voltar ao Modo Interface 1:1
        </button>
        <iframe
          src="/vectorcraft/index.html"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="VectorCraft Studio"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#16171e',
        color: '#c9d1d9',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
        fontSize: '11px',
      }}
    >
      {/* ─── 1. BARRA SUPERIOR DE MENUS (WINDOW TITLE / MENU BAR) ────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '32px',
          backgroundColor: '#191a23',
          borderBottom: '1px solid #282a36',
          padding: '0 8px',
          fontSize: '12px',
          zIndex: 50,
          flexShrink: 0,
        }}
      >
        {/* Esquerda: Logo + Home + Menus */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Logo Oficial VectorCraft (Flor / Redemoinho Laranja-Avermelhado) */}
          <div
            style={{
              width: '20px',
              height: '20px',
              marginRight: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="VectorCraft"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
                fill="url(#vc_logo_grad)"
              />
              <path
                d="M12 6c-3.31 0-6 2.69-6 6 0 2.21 1.79 4 4 4 1.1 0 2-.9 2-2 0-.55-.45-1-1-1s-1 .45-1 1c0 .55-.45 1-1 1-1.1 0-2-.9-2-2 0-2.21 1.79-4 4-4 2.21 0 4 1.79 4 4 0 1.1-.9 2-2 2"
                stroke="#ffffff"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="vc_logo_grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#f97316" />
                  <stop offset="1" stopColor="#ea580c" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Botão Home */}
          <button
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
            }}
            title="Página Inicial"
          >
            <Home size={14} />
          </button>

          {/* Itens do Menu Clássico Illustrator / VectorCraft */}
          {['File', 'Edit', 'Object', 'Type', 'Select', 'Effect', 'View', 'Window', 'Help'].map((menu) => (
            <button
              key={menu}
              type="button"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e6edf3',
                padding: '4px 7px',
                fontSize: '11px',
                cursor: 'pointer',
                borderRadius: '3px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {menu}
            </button>
          ))}
        </div>

        {/* Direita: Discord + Busca + Essentials + Controles de Janela */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Botão Discord */}
          <a
            href="https://discord.gg/artcraft"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: '#272937',
              color: '#9aa0a6',
              border: '1px solid #363948',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '10px',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <span style={{ color: '#5865F2', fontSize: '11px' }}>●</span>
            <span>Discord</span>
          </a>

          {/* Busca */}
          <button
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search size={13} />
          </button>

          {/* Seletor Essentials (Workspace Switcher) */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#20222d',
                border: '1px solid #323545',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
                color: '#e6edf3',
                cursor: 'pointer',
              }}
            >
              <span>Essentials</span>
              <ChevronDown size={11} color="#8b949e" />
            </button>
            {isWorkspaceMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  width: '220px',
                  backgroundColor: '#1b1c28',
                  border: '1px solid #36394c',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
                  padding: '4px 0',
                  zIndex: 9999,
                }}
              >
                <div style={{ padding: '6px 12px 2px 12px', fontSize: '10px', color: '#8b949e', fontWeight: 600 }}>WORKSPACES</div>
                <button
                  type="button"
                  onClick={() => setIsWorkspaceMenuOpen(false)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    background: 'rgba(255, 121, 198, 0.1)',
                    border: 'none',
                    color: '#ff79c6',
                    fontSize: '11px',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>✓ Essentials (VectorCraft Studio)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    onSwitchWorkspace?.('2d');
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#c9d1d9',
                    fontSize: '11px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>Packaging CAD 2D Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    onSwitchWorkspace?.('3d');
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#c9d1d9',
                    fontSize: '11px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>Packaging 3D Folding Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    onSwitchWorkspace?.('imposition');
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#c9d1d9',
                    fontSize: '11px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>Imposição &amp; Nesting</span>
                </button>
                <div style={{ height: '1px', backgroundColor: '#282a36', margin: '4px 0' }} />
                <button
                  type="button"
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    setUseLiveWasm(true);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#58a6ff',
                    fontSize: '11px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>Rust WebAssembly Engine (Live)</span>
                </button>
              </div>
            )}
          </div>

          {/* Controles de Janela (_, [], X) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
            <button
              type="button"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8b949e',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Minus size={11} />
            </button>
            <button
              type="button"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8b949e',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Square size={9} />
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8b949e',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* ─── 2. BARRA DE ABAS DE DOCUMENTOS (DOCUMENT TAB STRIP) ───────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '27px',
          backgroundColor: '#16171f',
          borderBottom: '1px solid #232530',
          paddingLeft: '44px', // Alinhado com a barra lateral de ferramentas
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#20222d',
            height: '100%',
            padding: '0 12px',
            borderTop: '2px solid #58a6ff',
            borderRight: '1px solid #282a36',
            fontSize: '11px',
            color: '#e6edf3',
            cursor: 'default',
          }}
        >
          <span>neon-drive.vectorcraft @ 51.41 % (RGB/Preview)</span>
          <button
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              padding: '1px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '2px',
            }}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* ─── 3. CORPO CENTRAL: TOOLBAR ESQUERDA + CANVAS + DOCK DIREITO ────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* ─── 3A. TOOLBAR VERTICAL ESQUERDA (ILLUSTRATOR SUITE) ─────────────── */}
        <aside
          style={{
            width: '44px',
            backgroundColor: '#191a23',
            borderRight: '1px solid #282a36',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '6px',
            gap: '2px',
            flexShrink: 0,
            zIndex: 30,
          }}
        >
          {[
            { id: 'select', icon: MousePointer, label: 'Selection Tool (V)' },
            { id: 'direct-select', icon: Navigation, label: 'Direct Selection Tool (A)' },
            { id: 'pen', icon: PenTool, label: 'Pen Tool (P)' },
            { id: 'curvature', icon: Spline, label: 'Curvature Tool (Shift+~)' },
            { id: 'rect', icon: Square, label: 'Rectangle Tool (M)' },
            { id: 'circle', icon: Circle, label: 'Ellipse Tool (L)' },
            { id: 'brush', icon: Paintbrush, label: 'Paintbrush Tool (B)' },
            { id: 'pencil', icon: Pencil, label: 'Shaper / Pencil Tool (N)' },
            { id: 'type', icon: TypeIcon, label: 'Type Tool (T)' },
            { id: 'rotate', icon: RotateCw, label: 'Rotate Tool (R)' },
            { id: 'scale', icon: ScaleIcon, label: 'Scale Tool (S)' },
            { id: 'free-transform', icon: Maximize2, label: 'Free Transform Tool (E)' },
            { id: 'shape-builder', icon: Shapes, label: 'Shape Builder Tool (Shift+M)' },
            { id: 'eyedropper', icon: Pipette, label: 'Eyedropper Tool (I)' },
            { id: 'blend', icon: Blend, label: 'Blend Tool (W)' },
            { id: 'artboard', icon: Grid, label: 'Artboard Tool (Shift+O)' },
            { id: 'hand', icon: Hand, label: 'Hand Tool (H)' },
            { id: 'zoom', icon: ZoomIn, label: 'Zoom Tool (Z)' },
          ].map((tool) => {
            const Icon = tool.icon;
            const isSelected = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
                title={tool.label}
                style={{
                  width: '32px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isSelected ? '#3a212c' : 'transparent',
                  color: isSelected ? '#ff79c6' : '#8b949e',
                  border: isSelected ? '1px solid rgba(255, 121, 198, 0.4)' : '1px solid transparent',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                <Icon size={14} />
              </button>
            );
          })}

          {/* Divisor */}
          <div style={{ width: '28px', height: '1px', backgroundColor: '#282a36', margin: '4px 0' }} />

          {/* Seletor de Cores de Preenchimento e Contorno (Fill / Stroke Swatches) */}
          <div style={{ position: 'relative', width: '30px', height: '30px', marginTop: '4px' }}>
            {/* Fill Swatch (Superior) */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '18px',
                height: '18px',
                backgroundColor: fillColor === 'none' ? '#ffffff' : fillColor,
                border: '1.5px solid #000000',
                boxShadow: '0 0 0 1px #58a6ff',
                zIndex: 2,
                cursor: 'pointer',
              }}
              title="Preenchimento (Fill)"
            />
            {/* Stroke Swatch (Inferior / Deslocado) */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '18px',
                height: '18px',
                backgroundColor: '#ffffff',
                border: '1.5px solid #000000',
                zIndex: 1,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Contorno (Stroke: Nenhum)"
            >
              {/* Linha vermelha de "Nenhum" (None) */}
              <div
                style={{
                  width: '20px',
                  height: '1.5px',
                  backgroundColor: '#ef4444',
                  transform: 'rotate(-45deg)',
                }}
              />
            </div>
          </div>
        </aside>

        {/* ─── 3B. ÁREA DO CANVAS CENTRAL COM A ARTE RETRO SYNTHWAVE ───────── */}
        <main
          style={{
            flex: 1,
            position: 'relative',
            backgroundColor: '#16171f',
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
          }}
        >
          {/* Prancheta (Artboard) com dimensões 600 x 780 pt */}
          <div
            style={{
              position: 'relative',
              width: '600px',
              height: '780px',
              backgroundColor: '#0c0817',
              boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
              borderRadius: '2px',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {/* Fundo Gradiente Espacial / Synthwave */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, #090314 0%, #1c0838 35%, #420f5c 55%, #83186d 72%, #d946ef 88%, #fb923c 100%)',
              }}
            />

            {/* Estrelas / Pontos de poeira cósmica */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '400px',
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)',
                backgroundSize: '40px 40px, 80px 80px',
                backgroundPosition: '0 0, 20px 20px',
                opacity: 0.7,
              }}
            />

            {/* Sol Retrô com listras horizontais */}
            <div
              style={{
                position: 'absolute',
                top: '290px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '260px',
                height: '260px',
                borderRadius: '50%',
                background: 'linear-gradient(180deg, #facc15 0%, #f97316 45%, #ec4899 100%)',
                boxShadow: '0 0 60px rgba(249, 115, 22, 0.6)',
              }}
            >
              {/* Listras horizontais do sol clássico 80s */}
              {[48, 56, 64, 72, 80, 88, 95].map((pct, idx) => (
                <div
                  key={pct}
                  style={{
                    position: 'absolute',
                    top: `${pct}%`,
                    left: 0,
                    right: 0,
                    height: `${idx * 1.2 + 2}px`,
                    backgroundColor: '#0c0817',
                  }}
                />
              ))}
            </div>

            {/* Montanhas em Silhueta Vector */}
            <svg
              style={{ position: 'absolute', top: '350px', left: 0, width: '100%', height: '160px' }}
              viewBox="0 0 600 160"
              preserveAspectRatio="none"
            >
              <polygon
                points="0,160 70,80 140,140 220,60 300,120 380,50 460,110 540,70 600,160"
                fill="#270a4b"
              />
              <polygon
                points="0,160 100,100 190,150 280,85 360,135 440,75 520,125 600,90 600,160"
                fill="#180530"
              />
            </svg>

            {/* Piso Holográfico / Grid em Perspectiva 3D */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '290px',
                background: 'linear-gradient(180deg, transparent 0%, #150228 20%, #0d011a 100%)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: '-50% -50% 0 -50%',
                  backgroundImage: `
                    linear-gradient(to right, rgba(236, 72, 153, 0.45) 1.5px, transparent 1.5px),
                    linear-gradient(to bottom, rgba(236, 72, 153, 0.45) 1.5px, transparent 1.5px)
                  `,
                  backgroundSize: '36px 36px',
                  transform: 'perspective(240px) rotateX(68deg)',
                  transformOrigin: 'bottom center',
                }}
              />
            </div>

            {/* Título: "NEON DRIVE" com Caixa de Seleção Ativa do Illustrator */}
            <div
              style={{
                position: 'absolute',
                top: '150px',
                left: '26px',
                right: '26px',
                textAlign: 'center',
                padding: '12px 16px',
                border: '1.5px solid #38bdf8',
                borderRadius: '1px',
                cursor: 'move',
              }}
            >
              {/* Pontos de controle de transformação (8-anchor handles) */}
              {['top-left', 'top-mid', 'top-right', 'mid-left', 'mid-right', 'bot-left', 'bot-mid', 'bot-right'].map((handle) => {
                const isTop = handle.startsWith('top');
                const isBot = handle.startsWith('bot');
                const isLeft = handle.endsWith('left');
                const isRight = handle.endsWith('right');
                return (
                  <div
                    key={handle}
                    style={{
                      position: 'absolute',
                      top: isTop ? '-4px' : isBot ? 'calc(100% - 4px)' : 'calc(50% - 4px)',
                      left: isLeft ? '-4px' : isRight ? 'calc(100% - 4px)' : 'calc(50% - 4px)',
                      width: '7px',
                      height: '7px',
                      backgroundColor: '#ffffff',
                      border: '1.5px solid #0284c7',
                      borderRadius: '1px',
                    }}
                  />
                );
              })}

              <h1
                style={{
                  margin: 0,
                  fontSize: '56px',
                  fontWeight: 900,
                  letterSpacing: '5px',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  fontFamily: '"Source Sans 3", -apple-system, sans-serif',
                  textShadow: '0 0 10px #38bdf8, 0 0 24px #ec4899, 0 0 40px #d946ef',
                }}
              >
                NEON DRIVE
              </h1>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '5px',
                  color: '#38bdf8',
                  marginTop: '8px',
                  fontFamily: 'monospace',
                  textShadow: '0 0 8px #38bdf8',
                }}
              >
                VECTOR · PURE RUST · 60 FPS
              </div>
            </div>

            {/* Barra Flutuante de Ação Rápida sob a Seleção */}
            <div
              style={{
                position: 'absolute',
                top: '260px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(24, 25, 34, 0.94)',
                border: '1px solid #36394c',
                borderRadius: '8px',
                padding: '5px 12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                zIndex: 20,
              }}
            >
              <button
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'transparent',
                  border: 'none',
                  color: '#e6edf3',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: '4px',
                }}
              >
                <span>T</span>
                <span>Create Outlines</span>
              </button>
              <button
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'transparent',
                  border: 'none',
                  color: '#e6edf3',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: '4px',
                }}
              >
                <Copy size={11} />
                <span>Duplicate</span>
              </button>
              <div style={{ width: '14px', height: '14px', backgroundColor: '#ffffff', border: '1px solid #58a6ff' }} />
              <div style={{ width: '14px', height: '14px', backgroundColor: 'transparent', border: '1px solid #ef4444', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '6px', left: 0, right: 0, height: '1px', backgroundColor: '#ef4444', transform: 'rotate(-45deg)' }} />
              </div>
              <button type="button" style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer' }}>
                <Lock size={12} />
              </button>
              <button type="button" style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer' }}>
                <MoreHorizontal size={12} />
              </button>
            </div>

            {/* Assinatura inferior */}
            <div
              style={{
                position: 'absolute',
                bottom: '22px',
                left: 0,
                right: 0,
                textAlign: 'center',
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.4)',
                letterSpacing: '2px',
              }}
            >
              made with VectorCraft
            </div>
          </div>

          {/* ─── PAINEL FLUTUANTE DE APARÊNCIA (FLOATING APPEARANCE PANEL) ─── */}
          {showAppearanceFloating && (
            <div
              style={{
                position: 'absolute',
                top: '90px',
                right: '310px',
                width: '230px',
                backgroundColor: 'rgba(28, 29, 39, 0.96)',
                border: '1px solid #36394c',
                borderRadius: '6px',
                boxShadow: '0 12px 36px rgba(0,0,0,0.7)',
                backdropFilter: 'blur(12px)',
                zIndex: 40,
                fontSize: '11px',
              }}
            >
              {/* Header do Painel Appearance */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderBottom: '1px solid #282a36',
                  color: '#e6edf3',
                  fontWeight: 600,
                }}
              >
                <span>Appearance</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Menu size={12} style={{ cursor: 'pointer', color: '#8b949e' }} />
                  <ChevronRight size={12} style={{ cursor: 'pointer', color: '#8b949e' }} />
                </div>
              </div>

              {/* Lista de Atributos de Estilo */}
              <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', color: '#e6edf3' }}>
                  <div style={{ width: '14px', height: '14px', backgroundColor: '#ffffff', border: '1px solid #444', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '6px', left: 0, right: 0, height: '1px', backgroundColor: '#ef4444', transform: 'rotate(-45deg)' }} />
                  </div>
                  <span style={{ fontWeight: 600 }}>Type</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 4px 24px', color: '#8b949e' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Eye size={12} color="#8b949e" />
                    <span>Characters</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div style={{ width: '12px', height: '12px', backgroundColor: '#ffffff', border: '1px solid #000' }} />
                    <div style={{ width: '12px', height: '12px', backgroundColor: 'transparent', border: '1px solid #ef4444', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '5px', left: 0, right: 0, height: '1px', backgroundColor: '#ef4444', transform: 'rotate(-45deg)' }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 4px 24px', color: '#8b949e' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Eye size={12} color="#8b949e" />
                    <ChevronRight size={10} color="#8b949e" />
                    <span>Outer Glow</span>
                  </div>
                  <span style={{ fontSize: '10px', color: '#58a6ff', fontWeight: 600 }}>fx</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 4px 24px', color: '#8b949e' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Eye size={12} color="#8b949e" />
                    <span>Opacity: Default</span>
                  </div>
                </div>
              </div>

              {/* Rodapé de Ações do Painel Appearance */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderTop: '1px solid #282a36',
                  color: '#8b949e',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button type="button" style={{ background: 'transparent', border: 'none', padding: 0, color: '#8b949e', cursor: 'pointer', display: 'flex' }} title="Novo Traçado">
                    <Square size={12} />
                  </button>
                  <button type="button" style={{ background: 'transparent', border: 'none', padding: 0, color: '#8b949e', cursor: 'pointer', display: 'flex' }} title="Novo Preenchimento">
                    <Square size={12} style={{ fill: '#8b949e' }} />
                  </button>
                  <span style={{ fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>fx</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', cursor: 'pointer' }}>⊘</span>
                  <button type="button" style={{ background: 'transparent', border: 'none', padding: 0, color: '#8b949e', cursor: 'pointer', display: 'flex' }} title="Excluir">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ─── 3C. DOCK DIREITO: TIRA DE ÍCONES + PAINEL PROPERTIES ───────────── */}
        <aside
          style={{
            display: 'flex',
            backgroundColor: '#191a23',
            borderLeft: '1px solid #282a36',
            width: '310px',
            flexShrink: 0,
            zIndex: 30,
          }}
        >
          {/* Tira vertical estreita de ícones de dock */}
          <div
            style={{
              width: '34px',
              backgroundColor: '#16171f',
              borderRight: '1px solid #282a36',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: '8px',
              gap: '6px',
            }}
          >
            {[
              { id: 'properties', icon: Sliders, label: 'Properties' },
              { id: 'layers', icon: Layers, label: 'Layers' },
              { id: 'libraries', icon: BookOpen, label: 'Libraries' },
              { id: 'palette', icon: Palette, label: 'Color' },
            ].map((btn) => {
              const Icon = btn.icon;
              const isSelected = activeInspectorTab === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setActiveInspectorTab(btn.id as any)}
                  title={btn.label}
                  style={{
                    width: '26px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isSelected ? '#252736' : 'transparent',
                    color: isSelected ? '#58a6ff' : '#8b949e',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>

          {/* Painel Principal de Propriedades (Inspector) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              backgroundColor: '#191a23',
            }}
          >
            {/* Header com Abas: Properties | Layers | Libraries */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #282a36',
                padding: '0 10px',
                height: '32px',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                <span
                  style={{
                    color: '#e6edf3',
                    fontWeight: 600,
                    fontSize: '11px',
                    borderBottom: '2px solid #e6edf3',
                    paddingBottom: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Properties
                </span>
                <span
                  style={{
                    color: '#8b949e',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Layers
                </span>
                <span
                  style={{
                    color: '#8b949e',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Libraries
                </span>
              </div>
              <Menu size={12} color="#8b949e" style={{ cursor: 'pointer' }} />
            </div>

            {/* Conteúdo do Painel Properties */}
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Sub-header: Tipo de Objeto Selecionado */}
              <div style={{ fontSize: '11px', color: '#8b949e', fontWeight: 600 }}>Type</div>

              {/* SEÇÃO TRANSFORM */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#e6edf3', marginBottom: '8px' }}>
                  Transform
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {/* 9-Point Reference Anchor Proxy */}
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      border: '1px solid #36394c',
                      borderRadius: '2px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gridTemplateRows: 'repeat(3, 1fr)',
                      padding: '2px',
                      gap: '2px',
                    }}
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div
                        key={i}
                        style={{
                          backgroundColor: i === 4 ? '#58a6ff' : '#4b5063',
                          borderRadius: '1px',
                        }}
                      />
                    ))}
                  </div>

                  {/* Inputs X, Y, W, H */}
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '2px 6px' }}>
                      <span style={{ color: '#8b949e', marginRight: '4px' }}>X:</span>
                      <input
                        type="text"
                        value={`${objX} pt`}
                        onChange={(e) => setObjX(parseFloat(e.target.value) || 0)}
                        style={{ width: '100%', background: 'transparent', border: 'none', color: '#e6edf3', fontSize: '11px', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '2px 6px' }}>
                      <span style={{ color: '#8b949e', marginRight: '4px' }}>W:</span>
                      <input
                        type="text"
                        value={`${objW} pt`}
                        onChange={(e) => setObjW(parseFloat(e.target.value) || 0)}
                        style={{ width: '100%', background: 'transparent', border: 'none', color: '#e6edf3', fontSize: '11px', outline: 'none' }}
                      />
                      <Link2 size={11} color="#58a6ff" style={{ cursor: 'pointer' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '2px 6px' }}>
                      <span style={{ color: '#8b949e', marginRight: '4px' }}>Y:</span>
                      <input
                        type="text"
                        value={`${objY} pt`}
                        onChange={(e) => setObjY(parseFloat(e.target.value) || 0)}
                        style={{ width: '100%', background: 'transparent', border: 'none', color: '#e6edf3', fontSize: '11px', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '2px 6px' }}>
                      <span style={{ color: '#8b949e', marginRight: '4px' }}>H:</span>
                      <input
                        type="text"
                        value={`${objH} pt`}
                        onChange={(e) => setObjH(parseFloat(e.target.value) || 0)}
                        style={{ width: '100%', background: 'transparent', border: 'none', color: '#e6edf3', fontSize: '11px', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Rotação e Flips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '2px 6px', flex: 1 }}>
                    <RotateCw size={11} color="#8b949e" style={{ marginRight: '6px' }} />
                    <span>0°</span>
                  </div>
                  <button type="button" style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer' }}>
                    <FlipHorizontal size={13} />
                  </button>
                  <button type="button" style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer' }}>
                    <FlipVertical size={13} />
                  </button>
                  <button type="button" style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer' }}>
                    <MoreHorizontal size={13} />
                  </button>
                </div>
              </div>

              {/* SEÇÃO CHARACTER (FONTES E TIPOGRAFIA) */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#e6edf3', marginBottom: '8px' }}>
                  Character
                </div>
                {/* Fonte Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '4px 8px', marginBottom: '6px' }}>
                  <span style={{ color: '#e6edf3' }}>Source Sans 3</span>
                  <ChevronDown size={11} color="#8b949e" />
                </div>
                {/* Peso Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '4px 8px', marginBottom: '6px' }}>
                  <span style={{ color: '#e6edf3' }}>Bold</span>
                  <ChevronDown size={11} color="#8b949e" />
                </div>
                {/* Tamanhos e Entrelinha */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '2px 6px' }}>
                    <span style={{ color: '#8b949e', marginRight: '4px' }}>T</span>
                    <input
                      type="text"
                      value={`${fontSize} pt`}
                      onChange={(e) => setFontSize(parseFloat(e.target.value) || 12)}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: '#e6edf3', fontSize: '11px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '2px 6px' }}>
                    <span style={{ color: '#8b949e', marginRight: '4px' }}>A↕</span>
                    <input
                      type="text"
                      value={`${leading} pt`}
                      onChange={(e) => setLeading(parseFloat(e.target.value) || 14)}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: '#e6edf3', fontSize: '11px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '2px 6px' }}>
                    <span style={{ color: '#8b949e', marginRight: '4px' }}>VA</span>
                    <input
                      type="text"
                      value={kerning}
                      onChange={(e) => setKerning(parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: '#e6edf3', fontSize: '11px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#13141a', border: '1px solid #303344', borderRadius: '3px', padding: '2px 6px' }}>
                    <span style={{ color: '#8b949e', marginRight: '4px' }}>VA↔</span>
                    <input
                      type="text"
                      value={tracking}
                      onChange={(e) => setTracking(parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: '#e6edf3', fontSize: '11px', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO PARAGRAPH */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#e6edf3', marginBottom: '8px' }}>
                  Paragraph
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button type="button" style={{ background: '#2e3243', border: 'none', color: '#e6edf3', padding: '4px', borderRadius: '3px', cursor: 'pointer' }}><AlignLeft size={13} /></button>
                    <button type="button" style={{ background: 'transparent', border: 'none', color: '#8b949e', padding: '4px', borderRadius: '3px', cursor: 'pointer' }}><AlignCenter size={13} /></button>
                    <button type="button" style={{ background: 'transparent', border: 'none', color: '#8b949e', padding: '4px', borderRadius: '3px', cursor: 'pointer' }}><AlignRight size={13} /></button>
                    <button type="button" style={{ background: 'transparent', border: 'none', color: '#8b949e', padding: '4px', borderRadius: '3px', cursor: 'pointer' }}><AlignJustify size={13} /></button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#8b949e' }}>
                    <input type="checkbox" id="hyphenate_check" style={{ accentColor: '#58a6ff' }} />
                    <label htmlFor="hyphenate_check" style={{ fontSize: '10px' }}>Hyphenate</label>
                  </div>
                </div>
              </div>

              {/* SEÇÃO APPEARANCE */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#e6edf3', marginBottom: '8px' }}>
                  Appearance
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Fill Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '14px', height: '14px', backgroundColor: '#ffffff', border: '1px solid #444' }} />
                      <span style={{ color: '#e6edf3' }}>Fill</span>
                    </div>
                  </div>

                  {/* Stroke Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '14px', height: '14px', backgroundColor: 'transparent', border: '1px solid #ef4444', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '6px', left: 0, right: 0, height: '1px', backgroundColor: '#ef4444', transform: 'rotate(-45deg)' }} />
                      </div>
                      <span style={{ color: '#e6edf3' }}>Stroke</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>0 pt</span>
                      <ChevronDown size={10} color="#8b949e" />
                    </div>
                  </div>

                  {/* Opacity Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8b949e' }}>Opacity</span>
                    <span style={{ color: '#e6edf3' }}>100%</span>
                  </div>

                  {/* Botão FX */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span style={{ color: '#58a6ff', fontWeight: 700, fontSize: '11px' }}>fx</span>
                    <MoreHorizontal size={12} color="#8b949e" />
                  </div>
                </div>
              </div>

              {/* SEÇÃO ALIGN */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#e6edf3', marginBottom: '8px' }}>
                  Align
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <AlignLeft size={13} color="#8b949e" style={{ cursor: 'pointer' }} />
                    <AlignCenter size={13} color="#8b949e" style={{ cursor: 'pointer' }} />
                    <AlignRight size={13} color="#8b949e" style={{ cursor: 'pointer' }} />
                  </div>
                  <MoreHorizontal size={12} color="#8b949e" />
                </div>
              </div>

              {/* SEÇÃO QUICK ACTIONS (2x2 BUTTON GRID) */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#e6edf3', marginBottom: '8px' }}>
                  Quick Actions
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button
                    type="button"
                    style={{
                      padding: '5px 8px',
                      backgroundColor: '#20222d',
                      border: '1px solid #333647',
                      borderRadius: '4px',
                      color: '#e6edf3',
                      fontSize: '10px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Offset Path
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: '5px 8px',
                      backgroundColor: '#20222d',
                      border: '1px solid #333647',
                      borderRadius: '4px',
                      color: '#e6edf3',
                      fontSize: '10px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Simplify
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: '5px 8px',
                      backgroundColor: '#20222d',
                      border: '1px solid #333647',
                      borderRadius: '4px',
                      color: '#e6edf3',
                      fontSize: '10px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    Arrange: Bring to Front
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: '5px 8px',
                      backgroundColor: '#20222d',
                      border: '1px solid #333647',
                      borderRadius: '4px',
                      color: '#e6edf3',
                      fontSize: '10px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Lock
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ─── 4. BARRA DE STATUS INFERIOR (STATUS BAR) ────────────────────────── */}
      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '24px',
          backgroundColor: '#191a23',
          borderTop: '1px solid #282a36',
          padding: '0 8px',
          fontSize: '10px',
          color: '#8b949e',
          flexShrink: 0,
          zIndex: 50,
        }}
      >
        {/* Esquerda: Zoom, Rotação, Navegador de Artboard, Dicas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Zoom Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', color: '#c9d1d9' }}>
            <span>{zoomPercent.toFixed(2)} %</span>
            <ChevronDown size={10} color="#8b949e" />
          </div>

          {/* Rotação Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', color: '#c9d1d9' }}>
            <span>{rotationDeg}°</span>
            <ChevronDown size={10} color="#8b949e" />
          </div>

          {/* Navegador de Artboard: |< < 1 Artboard 1 > >| */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#c9d1d9' }}>
            <span style={{ cursor: 'pointer' }}>|&lt;</span>
            <span style={{ cursor: 'pointer' }}>&lt;</span>
            <span>1 Artboard 1</span>
            <span style={{ cursor: 'pointer' }}>&gt;</span>
            <span style={{ cursor: 'pointer' }}>&gt;|</span>
          </div>

          <div style={{ width: '1px', height: '12px', backgroundColor: '#2d3142' }} />

          {/* Dica de Ação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#737a85' }}>
            <HelpCircle size={11} />
            <span>Click the object to select | Shift+Click to select multiple objects | Alt+Drag the object to duplicate</span>
          </div>
        </div>

        {/* Direita: Métricas de Performance do Motor Rust */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555b66', fontFamily: 'monospace' }}>
          <span>render 42.4 ms</span>
          <span>·</span>
          <span>ui 0.5 ms</span>
          <span>·</span>
          <span style={{ color: '#3fb950' }}>239 fps</span>
        </div>
      </footer>
    </div>
  );
};

export default VectorCraftEditor;
