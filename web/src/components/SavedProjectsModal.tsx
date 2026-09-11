import React from 'react';
import type { SavedProject } from '../lib/supabaseClient';
import { X, FolderOpen, Trash2, Cloud, HardDrive, ArrowRight } from 'lucide-react';

interface SavedProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: SavedProject[];
  onLoadProject: (project: SavedProject) => void;
  onDeleteProject: (id: string) => void;
  isSupabaseConfigured: boolean;
}

export const SavedProjectsModal: React.FC<SavedProjectsModalProps> = ({
  isOpen,
  onClose,
  projects,
  onLoadProject,
  onDeleteProject,
  isSupabaseConfigured,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: 580,
          maxHeight: '80vh',
          borderRadius: 16,
          background: '#0F172A',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderOpen size={20} color="#3B82F6" />
            <h3 style={{ fontSize: 17, fontWeight: 600, color: '#FFF' }}>Projetos Salvos</h3>
          </div>
          <button onClick={onClose} style={{ color: '#94A3B8', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Status de Conexão com Supabase */}
        <div
          style={{
            padding: '10px 24px',
            background: isSupabaseConfigured ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
            borderBottom: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: isSupabaseConfigured ? '#34D399' : '#60A5FA',
          }}
        >
          {isSupabaseConfigured ? <Cloud size={16} /> : <HardDrive size={16} />}
          <span>
            {isSupabaseConfigured
              ? 'Sincronizado na Nuvem com o Supabase'
              : 'Armazenamento Local no Navegador (Configure as chaves no .env.local para usar o Supabase Cloud)'}
          </span>
        </div>

        {/* Lista de Projetos */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B', fontSize: 14 }}>
              Nenhum projeto salvo ainda. Clique em "Salvar" no topo para guardar um modelo!
            </div>
          ) : (
            projects.map((proj) => (
              <div
                key={proj.id}
                style={{
                  background: '#1E293B',
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid #334155',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#F8FAFC', fontSize: 14 }}>{proj.name}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                    {proj.model_id.toUpperCase()} • L: {proj.params.L}mm | B: {proj.params.B}mm | H: {proj.params.H}mm
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => {
                      onLoadProject(proj);
                      onClose();
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: '#3B82F6',
                      color: '#FFF',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    Carregar <ArrowRight size={14} />
                  </button>

                  <button
                    onClick={() => onDeleteProject(proj.id)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: '#334155',
                      color: '#EF4444',
                    }}
                    title="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
