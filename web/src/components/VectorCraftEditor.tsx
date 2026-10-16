import React, { useState, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import type { DielineResult } from '../engine/types';
import { buildSvgContent, downloadFile } from '../engine/dxfExporter';
import { parseSvgToDieline } from '../engine/vectorcraft/svgImporter';
import {
  Download,
  Copy,
  Upload,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  ExternalLink,
  Layers,
  Sparkles,
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
  modelName = 'Faca_Embalagem',
  onDielineUpdate,
  onSwitchWorkspace,
  onClose,
}) => {
  // Modo de motor: local (/vectorcraft/index.html) ou nuvem oficial (vectorcraft.run/app/)
  const [engineSource, setEngineSource] = useState<'local' | 'cloud'>('local');
  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, duration = 3500) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, duration);
  }, []);

  // 1. Copia o SVG da faca CAD ativa para a área de transferência
  const handleCopySvg = useCallback(() => {
    if (!dieline) {
      showToast('⚠️ Nenhuma faca CAD carregada no momento.');
      return;
    }
    try {
      const svg = buildSvgContent(dieline, {
        includeBleed: true,
        bleedMm: 5,
        includeRegistrationMarks: true,
      });
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(svg).then(() => {
          showToast('📋 Faca CAD copiada em SVG! Cole (Ctrl+V) no VectorCraft.');
          try { confetti({ particleCount: 25, spread: 45, origin: { y: 0.1 } }); } catch {}
        }).catch(() => {
          downloadFile(svg, `${modelName}_faca.svg`, 'image/svg+xml;charset=utf-8');
          showToast('📥 Faca CAD baixada em SVG.');
        });
      } else {
        downloadFile(svg, `${modelName}_faca.svg`, 'image/svg+xml;charset=utf-8');
        showToast('📥 Faca CAD baixada em SVG.');
      }
    } catch (err) {
      console.error('[VectorCraft] Erro ao copiar SVG:', err);
      showToast('⚠️ Erro ao gerar SVG da faca.');
    }
  }, [dieline, modelName, showToast]);

  // 2. Baixa o SVG da faca para arrastar (drag & drop) diretamente na janela do VectorCraft
  const handleDownloadSvg = useCallback(() => {
    if (!dieline) {
      showToast('⚠️ Nenhuma faca CAD carregada no momento.');
      return;
    }
    try {
      const svg = buildSvgContent(dieline, {
        includeBleed: true,
        bleedMm: 5,
        includeRegistrationMarks: true,
      });
      const safeName = (modelName || 'faca').replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadFile(svg, `${safeName}_vectorcraft.svg`, 'image/svg+xml;charset=utf-8');
      showToast('📥 Faca baixada em SVG! Arraste o arquivo para a prancheta do VectorCraft.');
      try { confetti({ particleCount: 20, spread: 40, origin: { y: 0.1 } }); } catch {}
    } catch (err) {
      console.error('[VectorCraft] Erro ao exportar SVG:', err);
      showToast('⚠️ Erro ao gerar SVG.');
    }
  }, [dieline, modelName, showToast]);

  // 3. Importa SVG editado de volta para sincronizar com a dobra 3D
  const handleImportFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      try {
        const parsed = parseSvgToDieline(content);
        if (parsed && parsed.dieline && parsed.dieline.segments.length > 0) {
          onDielineUpdate?.(parsed.dieline);
          showToast(`✅ Faca atualizada com sucesso! (${parsed.dieline.segments.length} linhas de corte/vinco)`);
          try { confetti({ particleCount: 35, spread: 50, origin: { y: 0.1 } }); } catch {}
        } else {
          showToast('⚠️ Nenhum traço vetorial de corte ou vinco identificado no arquivo.');
        }
      } catch (err: any) {
        console.error('[VectorCraft] Erro ao importar:', err);
        showToast('⚠️ Erro ao processar o arquivo vetorial: ' + (err?.message || err));
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [onDielineUpdate, showToast]);

  const iframeSrc = engineSource === 'local' ? '/vectorcraft/index.html' : 'https://vectorcraft.run/app/';

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        backgroundColor: '#181920',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ─── BARRA SUPERIOR DE INTEGRAÇÃO CAD & WORKSPACE ─────────────────── */}
      {!isTopBarCollapsed && (
        <header
          style={{
            height: '38px',
            backgroundColor: '#16171f',
            borderBottom: '1px solid #282a36',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            fontSize: '11px',
            color: '#c9d1d9',
            zIndex: 100,
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          {/* Lado Esquerdo: Identidade VectorCraft Oficial */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Logo VectorCraft */}
            <div
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="VectorCraft Studio"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="url(#vc_top_grad)" />
                <path
                  d="M12 6c-3.31 0-6 2.69-6 6 0 2.21 1.79 4 4 4 1.1 0 2-.9 2-2 0-.55-.45-1-1-1s-1 .45-1 1c0 .55-.45 1-1 1-1.1 0-2-.9-2-2 0-2.21 1.79-4 4-4 2.21 0 4 1.79 4 4 0 1.1-.9 2-2 2"
                  stroke="#ffffff"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="vc_top_grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#f97316" />
                    <stop offset="1" stopColor="#ea580c" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          {/* Lado Direito: Ações de Integração CAD e Navegação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Copiar Faca em SVG */}
            <button
              type="button"
              onClick={handleCopySvg}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#20222d',
                color: '#e6edf3',
                border: '1px solid #333647',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title="Copiar faca de corte/vinco CAD em SVG (Cole com Ctrl+V no VectorCraft)"
            >
              <Copy size={12} color="#58a6ff" />
              <span>Copiar Faca (SVG)</span>
            </button>

            {/* Baixar Faca SVG */}
            <button
              type="button"
              onClick={handleDownloadSvg}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#20222d',
                color: '#e6edf3',
                border: '1px solid #333647',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title="Baixar faca SVG para arrastar para dentro do VectorCraft"
            >
              <Download size={12} color="#3fb950" />
              <span>Baixar Faca</span>
            </button>

            {/* Sincronizar Faca Editada com o 3D */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#20222d',
                color: '#e6edf3',
                border: '1px solid #333647',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title="Carregar SVG exportado do VectorCraft de volta para a dobra 3D"
            >
              <Upload size={12} color="#f97316" />
              <span>Enviar para Dobra 3D</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />

            <div style={{ width: '1px', height: '16px', backgroundColor: '#282a36', margin: '0 4px' }} />

            {/* Voltar para o Packaging CAD (2D / 3D) */}
            <button
              type="button"
              onClick={() => {
                if (onClose) onClose();
                else if (onSwitchWorkspace) onSwitchWorkspace('2d');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#1f2430',
                color: '#58a6ff',
                border: '1px solid #2b3548',
                borderRadius: '4px',
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Voltar para a visualização CAD 2D/3D de embalagens"
            >
              <ArrowLeft size={12} />
              <span>Voltar ao CAD (2D/3D)</span>
            </button>

            {/* Recolher barra superior */}
            <button
              type="button"
              onClick={() => setIsTopBarCollapsed(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8b949e',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Ocultar barra de ferramentas (tela 100% cheia)"
            >
              <ChevronUp size={14} />
            </button>
          </div>
        </header>
      )}

      {/* Botão flutuante para reabrir a barra caso recolhida */}
      {isTopBarCollapsed && (
        <button
          type="button"
          onClick={() => setIsTopBarCollapsed(false)}
          style={{
            position: 'absolute',
            top: '8px',
            right: '16px',
            zIndex: 9999,
            backgroundColor: 'rgba(22, 23, 31, 0.85)',
            border: '1px solid #36394c',
            borderRadius: '4px',
            color: '#c9d1d9',
            padding: '4px 8px',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
          title="Exibir ferramentas de integração CAD"
        >
          <span>CAD Tools</span>
          <ChevronDown size={12} />
        </button>
      )}

      {/* ─── IFRAME DO VECTORCRAFT OFICIAL (RUST + WEBASSEMBLY) ────────────── */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <iframe
          key={`${engineSource}-${iframeKey}`}
          src={iframeSrc}
          title="VectorCraft Studio"
          allow="clipboard-read; clipboard-write; fullscreen; web-share"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            backgroundColor: '#181920',
          }}
        />
      </div>

      {/* Toast Notification Flutuante */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(24, 25, 33, 0.96)',
            border: '1px solid #3d4256',
            borderRadius: '6px',
            padding: '8px 16px',
            color: '#e6edf3',
            fontSize: '12px',
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(10px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default VectorCraftEditor;
