import type {
  ImportedCadDocument,
  ImportedEntity,
  CadClassificationTarget,
  ClassificationRule,
  ClassificationProfile,
} from './types';

/**
 * Perfis industriais pré-configurados baseados em convenções de mercado
 */
export const DEFAULT_PROFILES: ClassificationProfile[] = [
  {
    id: 'artioscad_standard',
    name: 'Padrão ArtiosCAD / Esko',
    format: 'ALL',
    toleranceMm: 0.05,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    rules: [
      { id: 'r1', criteria: 'LAYER', matchValue: 'CUT', target: 'CUT', priority: 100 },
      { id: 'r2', criteria: 'LAYER', matchValue: 'CREASE', target: 'CREASE', priority: 100 },
      { id: 'r3', criteria: 'LAYER', matchValue: 'PERF', target: 'PERF', priority: 100 },
      { id: 'r4', criteria: 'COLOR', matchValue: '#FF0000', target: 'CUT', priority: 50 },
      { id: 'r5', criteria: 'COLOR', matchValue: '#00FF00', target: 'CREASE', priority: 50 },
    ],
  },
  {
    id: 'prinect_standard',
    name: 'Padrão Prinect Package Designer / Heidelberg',
    format: 'ALL',
    toleranceMm: 0.05,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    rules: [
      { id: 'p1', criteria: 'LAYER', matchValue: 'CORTE', target: 'CUT', priority: 100 },
      { id: 'p2', criteria: 'LAYER', matchValue: 'VINCO', target: 'CREASE', priority: 100 },
      { id: 'p3', criteria: 'LAYER', matchValue: 'PICOTE', target: 'PERF', priority: 100 },
      { id: 'p4', criteria: 'LINETYPE', matchValue: 'DASHED', target: 'CREASE', priority: 70 },
      { id: 'p5', criteria: 'COLOR', matchValue: '#0000FF', target: 'CUT', priority: 40 },
    ],
  },
  {
    id: 'bobst_autocad',
    name: 'Padrão Bobst Laser Die',
    format: 'DXF',
    toleranceMm: 0.05,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    rules: [
      { id: 'b1', criteria: 'LAYER', matchValue: '1', target: 'CUT', priority: 80 },
      { id: 'b2', criteria: 'LAYER', matchValue: '2', target: 'CREASE', priority: 80 },
      { id: 'b3', criteria: 'LAYER', matchValue: '3', target: 'PERF', priority: 80 },
    ],
  },
];

const LOCAL_STORAGE_KEY = 'primacor_cad_import_profiles';

/**
 * Carrega perfis salvos pelo usuário do localStorage
 */
export function getSavedProfiles(): ClassificationProfile[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [...DEFAULT_PROFILES];
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [...DEFAULT_PROFILES];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_PROFILES];
  } catch {
    return [...DEFAULT_PROFILES];
  }
}

/**
 * Salva um novo perfil ou atualiza um existente
 */
export function saveProfile(profile: ClassificationProfile): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const current = getSavedProfiles();
  const idx = current.findIndex((p) => p.id === profile.id);
  if (idx >= 0) {
    current[idx] = { ...profile, updatedAt: new Date().toISOString() };
  } else {
    current.push({ ...profile, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
}

/**
 * Remove um perfil de fornecedor
 */
export function deleteProfile(profileId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const current = getSavedProfiles().filter((p) => p.id !== profileId);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
}

/**
 * Classifica uma entidade individual segundo as regras com prioridade estrita:
 * 1. Regra manual do usuário (MANUAL_ENTITY)
 * 2. Perfil de regras ordenadas por prioridade decrescente
 * 3. Mapeamento por Layer (heurística inteligente de nomes comuns)
 * 4. Mapeamento por Linetype
 * 5. Mapeamento por Cor
 * 6. Fallback garantido: UNCLASSIFIED (nunca assume silenciosamente CUT)
 */
export function classifyEntity(
  entity: ImportedEntity,
  customRules: ClassificationRule[] = [],
  profile?: ClassificationProfile
): CadClassificationTarget {
  // Se nenhum perfil for fornecido, adota o padrão ArtiosCAD/Esko
  const activeProfile = profile || DEFAULT_PROFILES[0];

  // Combina regras do perfil com regras customizadas e ordena por prioridade decrescente
  const allRules: ClassificationRule[] = [
    ...customRules,
    ...(activeProfile ? activeProfile.rules : []),
  ].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // 1. Regra manual por ID de entidade
  const manualRule = allRules.find(
    (r) => r.criteria === 'MANUAL_ENTITY' && r.matchValue === entity.id
  );
  if (manualRule) return manualRule.target;

  // 2. Regras por Layer
  const layerNorm = (entity.layer || '').toUpperCase().trim();
  const layerRule = allRules.find(
    (r) => r.criteria === 'LAYER' && r.matchValue.toUpperCase().trim() === layerNorm
  );
  if (layerRule) return layerRule.target;

  // 3. Regras por Linetype
  const ltNorm = (entity.lineType || '').toUpperCase().trim();
  const ltRule = allRules.find(
    (r) => r.criteria === 'LINETYPE' && r.matchValue.toUpperCase().trim() === ltNorm
  );
  if (ltRule) return ltRule.target;

  // 4. Regras por Cor (Hex / ACI)
  const hexNorm = (entity.color.hex || '').toUpperCase().trim();
  const colorRule = allRules.find((r) => {
    if (r.criteria !== 'COLOR') return false;
    const matchHex = r.matchValue.toUpperCase().trim();
    return matchHex === hexNorm || (entity.color.raw && entity.color.raw.includes(r.matchValue));
  });
  if (colorRule) return colorRule.target;

  // 5. Heurísticas inteligentes automáticas baseadas em nomes comuns de Layers e Spot Colors
  const nameNorm = ((entity.color.name || '') + ' ' + (entity.layer || '')).toUpperCase();
  if (nameNorm.includes('CUT') || nameNorm.includes('CORTE') || nameNorm.includes('FAC') || nameNorm.includes('DIE') || nameNorm.includes('THRU')) {
    return 'CUT';
  }
  if (nameNorm.includes('CREASE') || nameNorm.includes('VINCO') || nameNorm.includes('DOBRA') || nameNorm.includes('FOLD') || nameNorm.includes('SCORE')) {
    return 'CREASE';
  }
  if (nameNorm.includes('PERF') || nameNorm.includes('PICOTE')) {
    return 'PERF';
  }
  if (nameNorm.includes('DIM') || nameNorm.includes('COTA') || nameNorm.includes('TEXT') || nameNorm.includes('ANOT')) {
    return 'DIMENSION';
  }
  if (nameNorm.includes('ART') || nameNorm.includes('GRAF') || nameNorm.includes('PRINT')) {
    return 'GRAPHIC';
  }

  // 6. Heurísticas universais de cores CAD de embalagens
  // Vermelhos -> Corte
  if (['#FF0000', '#EE0000', '#DD0000', '#CC0000', '#FF3F00', '#BD0000', '#FF1493'].includes(hexNorm)) {
    return 'CUT';
  }
  // Verdes -> Vinco
  if (['#00FF00', '#00EE00', '#00DD00', '#00CC00', '#00FF3F', '#7FFF00', '#3FFF00', '#008000'].includes(hexNorm)) {
    return 'CREASE';
  }
  // Ciano / Magenta / Azul -> Corte de aba/encaixe
  if (['#00FFFF', '#FF00FF', '#0000FF'].includes(hexNorm)) {
    return 'CUT';
  }
  // Amarelo / Laranja -> Picote
  if (['#FFFF00', '#FFA500', '#FF7F00', '#FFBF00'].includes(hexNorm)) {
    return 'PERF';
  }

  // 7. Heurística por Linetype
  if (ltNorm.includes('DASH') || ltNorm.includes('HIDDEN') || ltNorm.includes('CREASE')) {
    return 'CREASE';
  }

  // 8. Fallback estrito: Requer classificação pelo usuário
  return 'UNCLASSIFIED';
}

/**
 * Atualiza sugestões de classificação nas tabelas de estatísticas do documento
 */
export function applyClassificationToDocument(
  doc: ImportedCadDocument,
  customRules: ClassificationRule[] = [],
  profile?: ClassificationProfile
): {
  colorStats: typeof doc.colorStats;
  layerStats: typeof doc.layerStats;
  lineTypeStats: typeof doc.lineTypeStats;
} {
  const colorStats = doc.colorStats.map((cs) => {
    const sampleEntity: ImportedEntity = {
      id: 'sample',
      sourceType: 'LINE',
      layer: '0',
      color: cs.color,
      x0: 0,
      y0: 0,
      x1: 1,
      y1: 1,
    };
    const target = classifyEntity(sampleEntity, customRules, profile);
    return { ...cs, suggestedTarget: target };
  });

  const layerStats = doc.layerStats.map((ls) => {
    const sampleEntity: ImportedEntity = {
      id: 'sample',
      sourceType: 'LINE',
      layer: ls.layerName,
      color: ls.color || { hex: '#FFFFFF', raw: 'default' },
      x0: 0,
      y0: 0,
      x1: 1,
      y1: 1,
    };
    const target = classifyEntity(sampleEntity, customRules, profile);
    return { ...ls, suggestedTarget: target };
  });

  const lineTypeStats = doc.lineTypeStats.map((lts) => {
    const sampleEntity: ImportedEntity = {
      id: 'sample',
      sourceType: 'LINE',
      layer: '0',
      color: { hex: '#FFFFFF', raw: 'default' },
      lineType: lts.lineTypeName,
      x0: 0,
      y0: 0,
      x1: 1,
      y1: 1,
    };
    const target = classifyEntity(sampleEntity, customRules, profile);
    return { ...lts, suggestedTarget: target };
  });

  return { colorStats, layerStats, lineTypeStats };
}
