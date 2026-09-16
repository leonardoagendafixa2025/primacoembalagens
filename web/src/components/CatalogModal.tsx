import React, { useState, useMemo } from 'react';
import { CATALOG, getModelById } from '../engine/models';
import type { PackagingModel } from '../engine/types';
import { X, Search, Box, Grid, Filter, ArrowRight, Check } from 'lucide-react';

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
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
      if (selectedSeries !== 'ALL' && item.series !== selectedSeries) return false;
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
        background: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
        userSelect: 'none',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '92vw',
          maxWidth: 1240,
          height: '88vh',
          borderRadius: 'var(--cad-radius-lg)',
          background: 'var(--cad-bg-panel)',
          border: '1px solid var(--cad-border-default)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--cad-shadow-panel)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header do Catálogo */}
        <div
          style={{
            padding: '16px 24px',
            background: 'var(--cad-bg-header)',
            borderBottom: '1px solid var(--cad-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--cad-radius-sm)',
                background: 'var(--cad-accent-dim)',
                border: '1px solid var(--cad-accent-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Grid size={18} color="var(--cad-accent)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--cad-text-primary)' }}>
                  Biblioteca Técnica de Embalagens
                </h2>
                <span
                  style={{
                    background: 'var(--cad-accent-dim)',
                    color: 'var(--cad-accent)',
                    border: '1px solid var(--cad-accent-border)',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 4,
                  }}
                >
                  {CATALOG.length} Modelos CAD
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--cad-text-muted)', marginTop: 2 }}>
                Padrões industriais normativos FEFCO (Ondulado) e ECMA (Cartão Duplex/Triplex)
              </p>
            </div>
          </div>

          {/* Campo de Busca de Alta Precisão */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', width: 340 }}>
              <Search
                size={14}
                color="var(--cad-text-muted)"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Buscar por código (ex: 0201, 0427, A0115, B10)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '7px 30px 7px 32px',
                  borderRadius: 'var(--cad-radius-sm)',
                  background: 'var(--cad-bg-input)',
                  border: '1px solid var(--cad-border-default)',
                  color: 'var(--cad-text-primary)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--cad-text-muted)',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="cad-tool-btn"
              title="Fechar (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 2. Barra de Filtros e Categorias */}
        <div
          style={{
            padding: '10px 24px',
            background: 'var(--cad-bg-app)',
            borderBottom: '1px solid var(--cad-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* Categoria */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'ALL', label: `Todos (${CATALOG.length})` },
              { key: 'FEFCO', label: 'FEFCO (Ondulado)' },
              { key: 'ECMA', label: 'ECMA (Cartão)' },
            ].map((tab) => {
              const isActive = selectedCategory === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(tab.key as any);
                    setSelectedSeries('ALL');
                  }}
                  className="cad-btn"
                  style={{
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    background: isActive ? 'var(--cad-accent)' : 'var(--cad-bg-panel)',
                    borderColor: isActive ? 'var(--cad-accent)' : 'var(--cad-border-default)',
                    color: isActive ? '#000000' : 'var(--cad-text-secondary)',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Seletor de Série */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--cad-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Filter size={12} /> Família / Série:
            </span>
            <select
              value={selectedSeries}
              onChange={(e) => setSelectedSeries(e.target.value)}
              style={{
                padding: '5px 10px',
                borderRadius: 'var(--cad-radius-sm)',
                background: 'var(--cad-bg-input)',
                border: '1px solid var(--cad-border-default)',
                color: 'var(--cad-text-primary)',
                fontSize: 11,
                maxWidth: 280,
                outline: 'none',
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

        {/* 3. Grid de Modelos CAD */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
            alignContent: 'start',
          }}
        >
          {filteredModels.length === 0 ? (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '60px 0',
                color: 'var(--cad-text-muted)',
                fontSize: 13,
              }}
            >
              Nenhum modelo encontrado para "{search}".
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
                  console.error('Erro ao carregar modelo:', err);
                }
              };

              return (
                <div
                  key={item.id}
                  onClick={handleCardClick}
                  style={{
                    background: isSelected ? 'var(--cad-accent-dim)' : 'var(--cad-bg-panel-elevated)',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--cad-accent)' : 'var(--cad-border-subtle)',
                    borderRadius: 'var(--cad-radius-md)',
                    padding: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    transition: 'all 0.12s ease',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--cad-accent-border)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isSelected ? 'var(--cad-accent)' : 'var(--cad-border-subtle)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Thumbnail Técnico */}
                  <div
                    style={{
                      width: '100%',
                      height: 120,
                      borderRadius: 'var(--cad-radius-sm)',
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
                          maxWidth: '92%',
                          maxHeight: '92%',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <Box size={36} color="var(--cad-text-dim)" />
                    )}

                    {/* Tag Categoria */}
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        fontSize: 9,
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: isFEFCO ? 'rgba(0, 210, 180, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: isFEFCO ? 'var(--cad-accent)' : '#ef4444',
                        border: `1px solid ${isFEFCO ? 'rgba(0, 210, 180, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                        letterSpacing: 0.5,
                      }}
                    >
                      {item.category}
                    </span>

                    {isSelected && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          background: 'var(--cad-accent)',
                          color: '#000000',
                          borderRadius: '50%',
                          width: 18,
                          height: 18,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </div>

                  {/* Informações Técnicas */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cad-text-primary)' }}>
                      {item.code}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--cad-text-secondary)',
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.name}
                    </div>
                    {item.defaultParams && (
                      <div
                        className="cad-mono"
                        style={{ fontSize: 10, color: 'var(--cad-text-muted)', marginTop: 2 }}
                      >
                        Base: {item.defaultParams.L} × {item.defaultParams.B} × {item.defaultParams.H} mm
                      </div>
                    )}
                  </div>

                  {/* Botão de Carga */}
                  <button
                    type="button"
                    className={`cad-btn ${isSelected ? 'cad-btn-primary' : ''}`}
                    style={{
                      width: '100%',
                      padding: '5px 0',
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    <span>{isSelected ? 'Em Edição' : 'Carregar no CAD'}</span>
                    {!isSelected && <ArrowRight size={11} />}
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
