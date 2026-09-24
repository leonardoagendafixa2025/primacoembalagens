import type { DielineResult, PackagingModel, CardboardProfile, Point2D } from '../../engine/types';
import { LoopTopologyEngine } from '../../engine/importers/LoopTopologyEngine';
import { FoldingTreeEngine } from '../../engine/importers/FoldingTreeEngine';
import { TopologyReconstructor } from '../../engine/importers/TopologyReconstructor';
import { buildFoldingTopology, type TopologicalPanel, type TopologicalHinge } from '../../engine/dielineTopology';
import { generateIllustratorJsx } from './jsxGenerator';

// Códigos de Erro Padronizados da Fase 6
export const BRIDGE_ERROR_CODES = {
  ILLUSTRATOR_BRIDGE_UNAVAILABLE: 'ILLUSTRATOR_BRIDGE_UNAVAILABLE',
  ILLUSTRATOR_PLUGIN_NOT_CONNECTED: 'ILLUSTRATOR_PLUGIN_NOT_CONNECTED',
  ILLUSTRATOR_SESSION_EXPIRED: 'ILLUSTRATOR_SESSION_EXPIRED',
  ILLUSTRATOR_PAYLOAD_INVALID: 'ILLUSTRATOR_PAYLOAD_INVALID',
  PROJECT_REVISION_CONFLICT: 'PROJECT_REVISION_CONFLICT',
  ILLUSTRATOR_IMPORT_FAILED: 'ILLUSTRATOR_IMPORT_FAILED',
  ILLUSTRATOR_EXPORT_FAILED: 'ILLUSTRATOR_EXPORT_FAILED',
  HTML_3D_EXPORT_FAILED: 'HTML_3D_EXPORT_FAILED',
  HTML_3D_INVALID_MODEL: 'HTML_3D_INVALID_MODEL',
  VECTOR_ARTWORK_UNAVAILABLE: 'VECTOR_ARTWORK_UNAVAILABLE',
} as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[keyof typeof BRIDGE_ERROR_CODES];

/**
 * Contrato de Dados Canônico e Oficial entre PLMPackLib Web e Adobe Illustrator
 * (Fase 6 — Especificação Profissional)
 */
export interface IllustratorProjectPayload {
  schemaVersion: number;
  projectRevision: number;
  illustratorSessionId: string;
  projectId: string;
  projectName: string;
  modelId: string;
  modelCode: string;
  modelName: string;
  dimensions: {
    L: number;
    B: number;
    H: number;
    [key: string]: number;
  };
  parameters: Record<string, number>;
  canonicalGeometry: {
    bounds: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      width: number;
      height: number;
    };
    segments: Array<{
      id?: string;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      type: 'cut' | 'crease' | 'perfo' | 'bleed' | 'dimension';
    }>;
    arcs: Array<{
      id?: string;
      cx: number;
      cy: number;
      r: number;
      startAngle: number;
      endAngle: number;
      type: 'cut' | 'crease';
    }>;
  };
  dieline: {
    bounds: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      width: number;
      height: number;
    };
    customTopology?: any;
    segments?: any[];
    lines: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      type: 'cut' | 'crease' | 'bleed' | 'dimension';
    }>;
    arcs: Array<{
      cx: number;
      cy: number;
      r: number;
      startAngle: number;
      endAngle: number;
      type: 'cut' | 'crease';
    }>;
  };
  panels: Array<{
    id: string;
    name: string;
    isRoot: boolean;
    polygon: Array<{ x: number; y: number }>;
    bbox: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      width: number;
      height: number;
    };
  }>;
  hinges: Array<{
    hingeId: string;
    parentPanelId: string;
    childPanelId: string;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    nominalAngleDeg: number;
  }>;
  substrate: {
    id: string;
    name: string;
    code: string;
    thickness: number;
    outerColor: string;
    innerColor: string;
  };
  artwork?: {
    vectorSvg?: string;
    textureDataUri?: string;
    previewPngUri?: string;
    artworkType?: 'VECTOR_AND_RASTER' | 'VECTOR_ONLY' | 'RASTER_ONLY' | 'NONE';
    hasVector?: boolean;
    updatedAt?: string;
    scale?: number;
    position?: { x: number; y: number };
    rotation?: number;
    elementsCount?: number;
    svgVectorData?: string;
    artVersion?: number;
  };
  artworkMetadata?: {
    format?: string;
    width?: number;
    height?: number;
    dpi?: number;
    colorSpace?: string;
  };
  units: 'mm';
  scale: number;
  timestamp: string;
  jsx?: string;
}

// Compatibilidade retroativa transparente com o tipo anterior
export type PLMPackProjectExchange = IllustratorProjectPayload;

/**
 * Gera um ID de sessão único e estável para a conexão com o Adobe Illustrator
 */
export function generateIllustratorSessionId(projectId: string): string {
  const rand = Math.random().toString(36).substring(2, 9);
  return `ai_sess_${projectId}_${Date.now()}_${rand}`;
}

/**
 * Monta o payload canônico para intercâmbio com o Adobe Illustrator.
 * Consome EXCLUSIVAMENTE a geometria canônica e topologia do LoopTopologyEngine / FoldingTreeEngine.
 */
export function createProjectExchangePackage(
  model: PackagingModel,
  params: Record<string, number>,
  profile: CardboardProfile,
  dieline: DielineResult,
  geometryVersion: number = 1,
  artVersion: number = 0,
  artworkDataUri?: string,
  sessionId?: string
): IllustratorProjectPayload {
  let customTopo: any = null;
  let panels: Array<{
    id: string;
    name: string;
    isRoot: boolean;
    polygon: Array<{ x: number; y: number }>;
    bbox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  }> = [];

  let hinges: Array<{
    hingeId: string;
    parentPanelId: string;
    childPanelId: string;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    nominalAngleDeg: number;
  }> = [];

  try {
    customTopo = dieline.customTopology || (dieline.segments.length <= 500 ? buildFoldingTopology(dieline) : null);

    if (customTopo && customTopo.panels && customTopo.panels.length > 0) {
      const rootPanelId =
        customTopo.rootPanelId ||
        customTopo.panels.find((p: TopologicalPanel) => p.isRoot)?.id ||
        customTopo.panels[0].id;

      panels = customTopo.panels.map((p: TopologicalPanel) => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const pt of p.boundary) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }

        const isRoot = p.id === rootPanelId || Boolean(p.isRoot);

        return {
          id: p.id,
          name: p.name || p.id,
          isRoot,
          polygon: p.boundary.map((pt: Point2D) => ({ x: pt.x, y: pt.y })),
          bbox: {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY,
          },
        };
      });

      hinges = (customTopo.hinges || []).map((h: TopologicalHinge) => ({
        hingeId: h.id,
        parentPanelId: h.parentPanelId,
        childPanelId: h.childPanelId,
        x0: h.x0,
        y0: h.y0,
        x1: h.x1,
        y1: h.y1,
        nominalAngleDeg: h.targetAngleDeg ?? 90,
      }));
    } else {
      const recon = TopologyReconstructor.reconstructPlanarTopology(dieline, {
        gapToleranceMm: 0.35,
        tJunctionToleranceMm: 0.35,
        coincidentToleranceMm: 0.08,
      });
      const geom = recon.geometry || dieline;
      let topo = LoopTopologyEngine.extractTopology(geom);
      if (topo.panels.length === 0) topo = LoopTopologyEngine.extractTopology(dieline);
      const foldingTree = FoldingTreeEngine.buildFoldingTree(topo.panels, geom);

      panels = topo.panels.map((p) => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const pt of p.outerBoundary.vertices) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }

        const isRoot = foldingTree.rootPanelId === p.id;

        return {
          id: p.id,
          name: p.name || p.id,
          isRoot: Boolean(isRoot),
          polygon: p.outerBoundary.vertices.map((pt) => ({ x: pt.x, y: pt.y })),
          bbox: {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY,
          },
        };
      });

      hinges = (foldingTree.hinges || []).map((h) => ({
        hingeId: h.id,
        parentPanelId: h.parentPanelId,
        childPanelId: h.childPanelId,
        x0: h.axisStart.x,
        y0: h.axisStart.y,
        x1: h.axisEnd.x,
        y1: h.axisEnd.y,
        nominalAngleDeg: h.foldAngle ?? (h.kinematics?.targetAngle ?? 90),
      }));
    }
  } catch (err) {
    console.warn('[ProjectExchange] Aviso na extração de topologia estrutural, usando fallback plano:', err);
  }

  // Fallback garantido caso a topologia não tenha gerado painéis (faca plana importada ou contorno aberto)
  if (panels.length === 0) {
    const b = dieline.bounds || { minX: 0, minY: 0, maxX: 300, maxY: 200, width: 300, height: 200 };
    panels = [
      {
        id: 'P001',
        name: 'Painel Principal (Faca Plana)',
        isRoot: true,
        polygon: [
          { x: b.minX, y: b.minY },
          { x: b.maxX, y: b.minY },
          { x: b.maxX, y: b.maxY },
          { x: b.minX, y: b.maxY },
        ],
        bbox: { ...b },
      },
    ];
  }

  const projectId = `proj_${model.id.toLowerCase()}`;
  const effectiveSessionId = sessionId || generateIllustratorSessionId(projectId);

  const canonicalGeometry = {
    bounds: { ...dieline.bounds },
    segments: (dieline.segments || []).map((s, idx) => ({
      id: (s as any).id || `seg_${idx}`,
      x0: s.x0,
      y0: s.y0,
      x1: s.x1,
      y1: s.y1,
      type: (s.type === 'perfo' ? 'perfo' : s.type) as 'cut' | 'crease' | 'perfo' | 'bleed' | 'dimension',
    })),
    arcs: (dieline.arcs || []).map((a, idx) => ({
      id: (a as any).id || `arc_${idx}`,
      cx: a.cx,
      cy: a.cy,
      r: a.r,
      startAngle: a.startAngle,
      endAngle: a.endAngle,
      type: (a.type === 'crease' ? 'crease' : 'cut') as 'cut' | 'crease',
    })),
  };

  const lines = [
    ...(dieline.segments || []).map((s) => ({
      x1: s.x0,
      y1: s.y0,
      x2: s.x1,
      y2: s.y1,
      type: (s.type === 'perfo' ? 'crease' : s.type) as 'cut' | 'crease' | 'bleed' | 'dimension',
    })),
    ...(dieline.dimensions || []).map((d) => ({
      x1: d.x0,
      y1: d.y0,
      x2: d.x1,
      y2: d.y1,
      type: 'dimension' as const,
    })),
  ];

  const arcs = (dieline.arcs || []).map((a) => ({
    cx: a.cx,
    cy: a.cy,
    r: a.r,
    startAngle: a.startAngle,
    endAngle: a.endAngle,
    type: (a.type === 'crease' ? 'crease' : 'cut') as 'cut' | 'crease',
  }));

  const payload: IllustratorProjectPayload = {
    schemaVersion: 1,
    projectRevision: geometryVersion,
    illustratorSessionId: effectiveSessionId,
    projectId,
    projectName: `${model.name} (${model.code})`,
    modelId: model.id,
    modelCode: model.code,
    modelName: model.name,
    dimensions: {
      L: params.L ?? 300,
      B: params.B ?? 200,
      H: params.H ?? 150,
      ...params,
    },
    parameters: { ...params },
    canonicalGeometry,
    dieline: {
      bounds: { ...dieline.bounds },
      customTopology: customTopo,
      segments: dieline.segments || [],
      lines,
      arcs,
    },
    panels,
    hinges,
    substrate: {
      id: profile.id,
      name: profile.name,
      code: profile.code,
      thickness: profile.thickness,
      outerColor: profile.outerColor || '#FFFFFF',
      innerColor: profile.innerColor || '#FFFFFF',
    },
    artwork: artworkDataUri
      ? {
          textureDataUri: artworkDataUri,
          previewPngUri: artworkDataUri,
          artworkType: 'RASTER_ONLY',
          hasVector: false,
          updatedAt: new Date().toISOString(),
          scale: 1.0,
          position: { x: 0, y: 0 },
          rotation: 0,
          artVersion,
        }
      : undefined,
    artworkMetadata: artworkDataUri
      ? {
          format: 'image/png',
          dpi: 300,
          colorSpace: 'sRGB',
        }
      : undefined,
    units: 'mm',
    scale: 1.0,
    timestamp: new Date().toISOString(),
  };

  try {
    payload.jsx = generateIllustratorJsx(payload);
  } catch (jsxErr) {
    console.warn('[ProjectExchange] Aviso ao gerar JSX:', jsxErr);
  }

  return payload;
}

export const packageIllustratorExchangePayload = createProjectExchangePackage;

/**
 * Validador estrito de schema do IllustratorProjectPayload
 */
export function validateIllustratorPayload(payload: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload nulo ou inválido'] };
  }

  if (payload.schemaVersion !== 1) {
    errors.push(`Versão de schema inválida: esperado 1, recebido ${payload.schemaVersion}`);
  }

  if (!payload.projectId || typeof payload.projectId !== 'string') {
    errors.push('Campo obrigatório projectId ausente');
  }

  if (!payload.modelId || typeof payload.modelId !== 'string') {
    errors.push('Campo obrigatório modelId ausente');
  }

  if (!payload.modelCode || typeof payload.modelCode !== 'string') {
    errors.push('Campo obrigatório modelCode ausente');
  }

  if (!payload.dimensions || typeof payload.dimensions !== 'object') {
    errors.push('Campo obrigatório dimensions ausente');
  }

  if (!payload.canonicalGeometry || typeof payload.canonicalGeometry !== 'object') {
    errors.push('Campo obrigatório canonicalGeometry ausente');
  } else {
    if (!Array.isArray(payload.canonicalGeometry.segments)) {
      errors.push('canonicalGeometry.segments deve ser um array');
    }
    if (!Array.isArray(payload.canonicalGeometry.arcs)) {
      errors.push('canonicalGeometry.arcs deve ser um array');
    }
    if (!payload.canonicalGeometry.bounds) {
      errors.push('canonicalGeometry.bounds ausente');
    }
  }

  if (!Array.isArray(payload.panels)) {
    errors.push('Campo obrigatório panels deve ser um array');
  }

  if (!Array.isArray(payload.hinges)) {
    errors.push('Campo obrigatório hinges deve ser um array');
  }

  if (payload.units !== 'mm') {
    errors.push(`Unidade de medida inválida: esperado 'mm', recebido '${payload.units}'`);
  }

  if (payload.scale !== 1.0) {
    errors.push(`Escala métrica inválida: esperado 1.0, recebido ${payload.scale}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
