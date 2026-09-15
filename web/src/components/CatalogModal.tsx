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
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'FEFCO' | 'ECMA'>('ALL');
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
                  background: 'linear-gradient(135deg, #35a89e 0%, #1f6861 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(53, 168, 158, 0.4)',
                }}
              >
                <Grid size={18} color="#000000" />
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
                background: '#121616',
                border: '1px solid #242c2c',
                color: '#FFF',
                fontSize: 13,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: 10,
                  color: '#64748B',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button onClick={onClose} style={{ color: '#94A3B8', padding: 6 }}>
            <X size={22} />
          </button>
        </div>

        {/* Barra de Filtros e Categorias */}
        <div
          style={{
            padding: '12px 28px',
            background: '#0a0d0d',
            borderBottom: '1px solid #1c2222',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* Tabs de Categoria */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'ALL', label: `Todos (${CATALOG.length})` },
              { key: 'FEFCO', label: 'FEFCO' },
              { key: 'ECMA', label: 'ECMA' },
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
                  color: selectedCategory === tab.key ? '#000000' : '#94A3B8',
                  background: selectedCategory === tab.key ? '#35a89e' : '#121616',
                  border: '1px solid',
                  borderColor: selectedCategory === tab.key ? '#35a89e' : '#242c2c',
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
                background: '#121616',
                border: '1px solid #242c2c',
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
              const isSelected =
                item.id === currentModelId ||
                item.code.toLowerCase().replace(/\s+/g, '') === currentModelId.toLowerCase().replace(/\s+/g, '');
              const isFEFCO = item.category === 'FEFCO';

              const handleCardClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  const resolvedModel = getModelById(item.id);
                  onSelectModel(resolvedModel);
                  onClose();
                } catch (err) {
                  console.error('Erro ao selecionar modelo da biblioteca:', err);
                }
              };

              return (
                <div
                  key={item.id}
                  onClick={handleCardClick}
                  style={{
                    background: isSelected ? 'rgba(53, 168, 158, 0.12)' : '#101414',
                    border: '1px solid',
                    borderColor: isSelected ? '#35a89e' : '#1c2424',
                    borderRadius: 12,
                    padding: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    transition: 'all 0.15s ease',
                    position: 'relative',
                    boxShadow: isSelected ? '0 0 16px rgba(53, 168, 158, 0.3)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#35a89e';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isSelected ? '#35a89e' : '#1c2424';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Thumbnail da Embalagem */}
                  <div
                    style={{
                      width: '100%',
                      height: 140,
                      borderRadius: 8,
                      background: '#000000',
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
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: isFEFCO ? '#35a89e' : '#c53236',
                        color: isFEFCO ? '#000000' : '#FFFFFF',
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

                  {/* Botão de Seleção com Handler Direto */}
                  <button
                    type="button"
                    onClick={handleCardClick}
                    style={{
                      marginTop: 4,
                      width: '100%',
                      padding: '8px 0',
                      borderRadius: 6,
                      background: isSelected ? 'linear-gradient(135deg, #35a89e 0%, #1f6e67 100%)' : '#141818',
                      color: isSelected ? '#FFFFFF' : '#CBD5E1',
                      border: isSelected ? '1px solid #35a89e' : '1px solid #242c2c',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      boxShadow: isSelected ? '0 2px 8px rgba(53, 168, 158, 0.3)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#35a89e';
                        e.currentTarget.style.color = '#000000';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#141818';
                        e.currentTarget.style.color = '#CBD5E1';
                      }
                    }}
                  >
                    {isSelected ? 'Em Edição' : 'Carregar Faca'} <ArrowRight size={13} />
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
