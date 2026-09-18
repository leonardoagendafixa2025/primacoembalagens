import React, { useState } from 'react';
import {
  X,
  Download,
  CheckCircle2,
  Box,
  Layers,
  Sparkles,
  HelpCircle,
  Monitor,
  Apple,
  FileText
} from 'lucide-react';

interface IllustratorPluginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IllustratorPluginModal: React.FC<IllustratorPluginModalProps> = ({
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
          border: '1px solid rgba(255, 154, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(255, 154, 0, 0.2), 0 0 40px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 154, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(255, 154, 0, 0.12) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#330000',
                border: '1.5px solid #ff9a00',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 15px rgba(255, 154, 0, 0.35)',
              }}
            >
              <span
                style={{
                  color: '#ff9a00',
                  fontWeight: 900,
                  fontSize: 20,
                  letterSpacing: 0.5,
                  lineHeight: 1,
                }}
              >
                Ai
              </span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#F8FAFC',
                    letterSpacing: -0.3,
                  }}
                >
                  Plugin Adobe Illustrator
                </h3>
                <span
                  style={{
                    background: 'rgba(255, 154, 0, 0.2)',
                    color: '#ff9a00',
                    border: '1px solid rgba(255, 154, 0, 0.4)',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Oficial
                </span>
              </div>
              <p
                style={{
                  margin: '3px 0 0',
                  fontSize: 12,
                  color: '#94A3B8',
                }}
              >
                PRIMACOR EMBALAGENS — Estúdio 3D Interativo &amp; Sincronização de Facas e Artes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#F8FAFC')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo com Rolagem Suave */}
        <div
          style={{
            padding: '22px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Card Principal de Download */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(255, 154, 0, 0.15) 0%, rgba(20, 24, 39, 0.8) 100%)',
              border: '1.5px solid rgba(255, 154, 0, 0.5)',
              borderRadius: 14,
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>
                  Pacote de Instalação Completo (Windows e Mac)
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#CBD5E1', lineHeight: 1.4 }}>
                  Contém o plugin oficial para Adobe Illustrator (CC 2019 a 2026) com scripts de instalação automática em 1 clique.
                </p>
              </div>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                Pronto para Uso
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a
                href="/downloads/Plugin_Illustrator_Primacor.zip"
                download="Plugin_Illustrator_Primacor.zip"
                className="cad-btn"
                style={{
                  background: 'linear-gradient(135deg, #ff9a00 0%, #e67e00 100%)',
                  color: '#000000',
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '11px 22px',
                  borderRadius: 10,
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: '0 4px 16px rgba(255, 154, 0, 0.4)',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 154, 0, 0.55)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(255, 154, 0, 0.4)';
                }}
              >
                <Download size={18} strokeWidth={2.5} />
                <span>Baixar Plugin Illustrator (.ZIP)</span>
              </a>

              <a
                href="/downloads/COMO_INSTALAR.txt"
                target="_blank"
                rel="noreferrer"
                className="cad-btn"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#E2E8F0',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: 13,
                  padding: '10px 16px',
                  borderRadius: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  textDecoration: 'none',
                }}
              >
                <FileText size={15} />
                <span>Instruções em Texto</span>
              </a>
            </div>
          </div>

          {/* Destaques das Funcionalidades */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid #1E293B',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <Box size={18} color="#ff9a00" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>Estúdio 3D no Illustrator</div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, lineHeight: 1.3 }}>
                  Simulador 3D dobrável em tempo real dentro do painel da Adobe (estilo Esko).
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid #1E293B',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <Layers size={18} color="#38bdf8" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>Facas Técnicas 1:1</div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, lineHeight: 1.3 }}>
                  Camadas padronizadas de Corte, Vincos e Dimensões com trava de segurança.
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid #1E293B',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <Sparkles size={18} color="#34d399" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>Sincronização de Arte</div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, lineHeight: 1.3 }}>
                  Crie sua arte gráfica e envie para o modelo 3D com um único clique.
                </div>
              </div>
            </div>
          </div>

          {/* Passo a Passo de Instalação */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: '#CBD5E1',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Passo a Passo de Instalação (Fácil e Rápido)
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Passo 1 */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.45)',
                  border: '1px solid rgba(51, 65, 85, 0.6)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: 'rgba(255, 154, 0, 0.18)',
                    color: '#ff9a00',
                    fontWeight: 800,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.4 }}>
                  <strong>Baixe e extraia o arquivo ZIP:</strong> Clique no botão de download acima e extraia a pasta{' '}
                  <code style={{ background: '#0f172a', padding: '1px 5px', borderRadius: 4, color: '#ff9a00' }}>
                    Plugin_Illustrator_Primacor
                  </code>{' '}
                  em qualquer lugar do seu computador.
                </div>
              </div>

              {/* Passo 2 */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.45)',
                  border: '1px solid rgba(51, 65, 85, 0.6)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: 'rgba(255, 154, 0, 0.18)',
                    color: '#ff9a00',
                    fontWeight: 800,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.4 }}>
                  <strong>Execute o instalador automático:</strong>
                  <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#93c5fd' }}>
                      <Monitor size={14} /> <strong>Windows:</strong> execute{' '}
                      <code style={{ background: '#0f172a', padding: '1px 5px', borderRadius: 4, color: '#60a5fa' }}>
                        Instalar_Plugin_Windows.bat
                      </code>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#d8b4fe' }}>
                      <Apple size={14} /> <strong>Mac:</strong> execute{' '}
                      <code style={{ background: '#0f172a', padding: '1px 5px', borderRadius: 4, color: '#c084fc' }}>
                        Instalar_Plugin_Mac.command
                      </code>
                    </span>
                  </div>
                </div>
              </div>

              {/* Passo 3 */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.45)',
                  border: '1px solid rgba(51, 65, 85, 0.6)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: 'rgba(255, 154, 0, 0.18)',
                    color: '#ff9a00',
                    fontWeight: 800,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.4 }}>
                  <strong>Abra no Adobe Illustrator:</strong> Abra (ou reinicie) o Illustrator e acesse o menu superior:{' '}
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                    Janela (Window) &gt; Extensões (Extensions) &gt; PRIMACOR EMBALAGENS
                  </span>
                  .
                </div>
              </div>
            </div>
          </div>

          {/* Guia Manual Opcional */}
          <div>
            <button
              type="button"
              onClick={() => setShowManualGuide((prev) => !prev)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: 0,
              }}
            >
              <HelpCircle size={14} />
              <span>{showManualGuide ? 'Ocultar instalação manual' : 'Prefere instalar manualmente? Clique aqui'}</span>
            </button>

            {showManualGuide && (
              <div
                style={{
                  marginTop: 8,
                  padding: '12px 14px',
                  background: '#0a0e17',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#94a3b8',
                  lineHeight: 1.5,
                }}
              >
                <div>
                  <strong>Destino manual no Windows:</strong>
                  <br />
                  Copie a pasta <code style={{ color: '#ff9a00' }}>com.primacor.plmpacklib</code> para dentro de:{' '}
                  <code style={{ color: '#38bdf8', wordBreak: 'break-all' }}>
                    %APPDATA%\Adobe\CEP\extensions\
                  </code>
                </div>
                <div style={{ marginTop: 8 }}>
                  <strong>Destino manual no Mac:</strong>
                  <br />
                  Copie para dentro de:{' '}
                  <code style={{ color: '#38bdf8', wordBreak: 'break-all' }}>
                    ~/Library/Application Support/Adobe/CEP/extensions/
                  </code>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer do Modal */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #1E293B',
            background: 'rgba(15, 23, 42, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} color="#10b981" />
            <span>Compatível com Illustrator CC 2019 até 2026</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cad-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#F8FAFC',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '7px 18px',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
