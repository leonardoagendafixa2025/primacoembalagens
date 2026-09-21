import React, { useState } from 'react';
import {
  X,
  Download,
  CheckCircle2,
  Sparkles,
  HelpCircle
} from 'lucide-react';

interface CorelDrawPluginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CorelDrawPluginModal: React.FC<CorelDrawPluginModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [showManualGuide, setShowManualGuide] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: 680,
          maxWidth: '100%',
          maxHeight: '90vh',
          borderRadius: 16,
          background: 'linear-gradient(180deg, #111827 0%, #0b0f19 100%)',
          border: '1px solid rgba(34, 197, 94, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(34, 197, 94, 0.25), 0 0 40px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(34, 197, 94, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(34, 197, 94, 0.15) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#064e3b',
                border: '1.5px solid #22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22c55e',
                fontWeight: 900,
                fontSize: 18,
                letterSpacing: 0.5,
                boxShadow: '0 0 15px rgba(34, 197, 94, 0.4)',
              }}
            >
              Cdr
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                Integração Oficial CorelDRAW
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: 'rgba(34, 197, 94, 0.25)',
                    color: '#4ade80',
                    border: '1px solid rgba(34, 197, 94, 0.5)',
                    padding: '2px 8px',
                    borderRadius: 20,
                  }}
                >
                  Suite 2024 / 2025 / v26+
                </span>
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#94a3b8' }}>
                Sincronização métrica 1:1, camadas técnicas automáticas e mapeamento 3D em tempo real.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              borderRadius: 8,
              padding: 8,
              cursor: 'pointer',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card de Destaque / Download */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(6, 78, 59, 0.25) 100%)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: 12,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color="#4ade80" />
                  Instalador Automático do Plugin CorelDRAW
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                  Pacote com macro GMS, atalhos de barra de ferramentas e serviço local de comunicação em alta velocidade.
                </p>
              </div>
              <a
                href="/downloads/Plugin_CorelDRAW_Primacor.zip"
                download="Plugin_CorelDRAW_Primacor.zip"
                style={{
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: '#ffffff',
                  border: '1px solid #22c55e',
                  padding: '10px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 15px rgba(22, 163, 74, 0.35)',
                  flexShrink: 0,
                }}
              >
                <Download size={16} />
                Baixar Plugin (.ZIP)
              </a>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, borderTop: '1px solid rgba(34, 197, 94, 0.2)', paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={15} color="#4ade80" />
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>Escala Métrica 1:1 mm</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={15} color="#4ade80" />
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>Camadas Técnicas Oficiais</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={15} color="#4ade80" />
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>Preservação Total da Arte</span>
              </div>
            </div>
          </div>

          {/* Passos de Instalação e Uso */}
          <div>
            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#ffffff' }}>
              Como Funciona em 3 Passos Simples:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  1
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Inicie o Bridge Server ou Clique em [ Cdr CorelDRAW ]</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    Ao clicar no botão verde no topo do CAD Web, a faca é enviada diretamente ao seu CorelDRAW aberto.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  2
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Crie sua Arte na Camada PLMPACKLIB_ARTE</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    As linhas de corte e vinco ficam protegidas e travadas. Crie sua arte livremente com textos, fotos, vetores e marcas.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  3
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Clique em [ Enviar Arte ] para Visualização 3D</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    O sistema extrai a arte fotorrealista a 300 DPI e mapeia perfeitamente nos painéis 3D no Three.js.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Guia Manual Alternativo */}
          <div>
            <button
              type="button"
              onClick={() => setShowManualGuide(!showManualGuide)}
              style={{
                background: 'none',
                border: 'none',
                color: '#4ade80',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: 0,
              }}
            >
              <HelpCircle size={14} />
              {showManualGuide ? 'Ocultar Guia Manual' : 'Execução Manual / Sem Bridge'}
            </button>

            {showManualGuide && (
              <div
                style={{
                  marginTop: 10,
                  padding: 14,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#cbd5e1',
                  lineHeight: 1.6,
                }}
              >
                Caso queira executar offline sem a Bridge:
                <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  <li>Clique no menu <b>Exportar</b> no topo do CAD e escolha <b>Script CorelDRAW (.ps1)</b>.</li>
                  <li>Clique com o botão direito no arquivo baixado e selecione <b>Executar com o PowerShell</b>.</li>
                  <li>O CorelDRAW será acionado e criará o documento com todas as camadas e faca 1:1.</li>
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 0, 0, 0.3)',
          }}
        >
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Primacor Gráfica e Editora LTDA — Divisão de Engenharia de Embalagens
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
