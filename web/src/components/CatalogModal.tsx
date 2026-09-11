import React, { useState, useMemo } from 'react';
import { CATALOG, getModelById } from '../engine/models';
import type { PackagingModel } from '../engine/types';
import { X, Search, Box, Grid, Filter, ArrowRight } from 'lucide-react';

interface CatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModel: (model: PackagingModel) => void;
  currentModelId: string;
}

export const CatalogModal: React.FC<CatalogModalProps> = ({
  isOpen,
  onClose,
  onSelectModel,
  currentModelId,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'FEFCO' | 'ECMA' | 'DISPLAYS'>('ALL');
  const [selectedSeries, setSelectedSeries] = useState<string>('ALL');

  // Séries disponíveis baseadas na categoria
  const availableSeries = useMemo(() => {
    const set = new Set<string>();
    CATALOG.forEach((item) => {
      if (selectedCategory === 'ALL' || item.category === selectedCategory) {
        if (item.series) set.add(item.series);
      }
    });
    return Array.from(set).sort();
  }, [selectedCategory]);

  // Filtro de modelos
  const filteredModels = useMemo(() => {
    const q = search.toLowerCase().trim();
    return CATALOG.filter((item) => {
      // Filtro de categoria
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
      // Filtro de série
      if (selectedSeries !== 'ALL' && item.series !== selectedSeries) return false;
      // Filtro de busca
      if (q) {
        const matchCode = item.code.toLowerCase().includes(q);
        const matchName = item.name.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchSeries = item.series.toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchDesc && !matchSeries) return false;
      }
      return true;
    });
  }, [search, selectedCategory, selectedSeries]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 15, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '92vw',
          maxWidth: 1200,
          height: '88vh',
          borderRadius: 20,
          background: '#0B0F17',
          border: '1px solid #1E293B',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Catálogo */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Grid size={18} color="#FFF" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F8FAFC' }}>
                Biblioteca Completa de Embalagens ({CATALOG.length} Modelos)
              </h2>
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
              Padrões internacionais FEFCO (Papelão Ondulado) e ECMA (Papel-Cartão) para cartonagem industrial.
            </p>
          </div>

          {/* Campo de Busca Rápida */}
          <div style={{ position: 'relative', width: 340 }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 11 }} />
            <input
              type="text"
              placeholder="Buscar por código ou nome (ex: 0201, 0427, B10, A20)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: 10,
                background: '#151D2F',
                border: '1px solid #334155',
                color: '#FFF',
                fontSize: 13,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 10, top: 9, color: '#94A3B8', padding: 2 }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button onClick={onClose} style={{ color: '#94A3B8', padding: 6 }}>
            <X size={22} />
          </button>
        </div>

        {/* Barra de Filtros: Categorias e Séries */}
        <div
          style={{
            padding: '12px 28px',
            background: '#0F172A',
            borderBottom: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {/* Tabs de Categoria */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'ALL', label: `Todos (${CATALOG.length})` },
              { key: 'FEFCO', label: `FEFCO Papelão (${CATALOG.filter((c) => c.category === 'FEFCO').length})` },
              { key: 'ECMA', label: `ECMA Cartão (${CATALOG.filter((c) => c.category === 'ECMA').length})` },
              { key: 'DISPLAYS', label: `Displays/PDV (${CATALOG.filter((c) => c.category === 'DISPLAYS').length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setSelectedCategory(tab.key as any);
                  setSelectedSeries('ALL');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: selectedCategory === tab.key ? '#FFF' : '#94A3B8',
                  background: selectedCategory === tab.key ? '#3B82F6' : '#1E293B',
                  border: '1px solid',
                  borderColor: selectedCategory === tab.key ? '#3B82F6' : '#334155',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Seletor de Série */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Filter size={13} /> Série:
            </span>
            <select
              value={selectedSeries}
              onChange={(e) => setSelectedSeries(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: '#151D2F',
                border: '1px solid #334155',
                color: '#E2E8F0',
                fontSize: 12,
                maxWidth: 280,
              }}
            >
              <option value="ALL">Todas as Séries ({filteredModels.length})</option>
              {availableSeries.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grid de Cards de Modelos com Imagens Reais */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 28px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 18,
            alignContent: 'start',
          }}
        >
          {filteredModels.length === 0 ? (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '60px 0',
                color: '#64748B',
                fontSize: 15,
              }}
            >
              Nenhum modelo encontrado para "{search}". Tente buscar por outros códigos como "0201", "0427", "A01" ou "B10".
            </div>
          ) : (
            filteredModels.map((item) => {
              const isSelected = item.id === currentModelId;
              const isFEFCO = item.category === 'FEFCO';
              const isECMA = item.category === 'ECMA';

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectModel(getModelById(item.id));
                    onClose();
                  }}
                  style={{
                    background: isSelected ? 'rgba(59, 130, 246, 0.12)' : '#151D2F',
                    border: '1px solid',
                    borderColor: isSelected ? '#3B82F6' : '#222F48',
                    borderRadius: 12,
                    padding: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    transition: 'all 0.15s ease',
                    position: 'relative',
                    boxShadow: isSelected ? '0 0 16px rgba(59, 130, 246, 0.25)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#3B82F6';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isSelected ? '#3B82F6' : '#222F48';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Thumbnail da Embalagem */}
                  <div
                    style={{
                      width: '100%',
                      height: 140,
                      borderRadius: 8,
                      background: '#0F172A',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.name}
                        loading="lazy"
                        style={{
                          maxWidth: '90%',
                          maxHeight: '90%',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <Box size={42} color="#334155" />
                    )}

                    {/* Tag de Categoria */}
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: isFEFCO ? '#1E40AF' : isECMA ? '#047857' : '#6B21A8',
                        color: '#FFF',
                        letterSpacing: 0.5,
                      }}
                    >
                      {item.category}
                    </span>
                  </div>

                  {/* Informações Técnicas */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC' }}>
                      {item.code}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#94A3B8',
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.name}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 'auto' }}>
                      {item.series}
                    </div>
                  </div>

                  {/* Botão de Seleção */}
                  <button
                    style={{
                      marginTop: 4,
                      width: '100%',
                      padding: '7px 0',
                      borderRadius: 6,
                      background: isSelected ? '#3B82F6' : '#1E293B',
                      color: isSelected ? '#FFF' : '#CBD5E1',
                      border: '1px solid #334155',
                      fontSize: 11,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    {isSelected ? 'Em Edição' : 'Carregar Faca'} <ArrowRight size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
