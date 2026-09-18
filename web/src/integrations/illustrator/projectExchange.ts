import type { DielineResult, PackagingModel, CardboardProfile } from '../../engine/types';
import type { DielineTopology } from '../../engine/dielineTopology';
import { buildFoldingTopology } from '../../engine/dielineTopology';

export interface PLMPackProjectExchange {
  projectId: string;
  projectName: string;
  modelId: string;
  modelCode: string;
  modelName: string;
  geometryVersion: number;
  artVersion: number;
  timestamp: string;
  parameters: Record<string, number>;
  substrate: {
    id: string;
    name: string;
    code: string;
    thickness: number;
    outerColor: string;
    innerColor: string;
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
  artwork?: {
    textureDataUri?: string;
    updatedAt?: string;
  };
}

/**
 * Monta o pacote de intercâmbio padronizado para sincronização com o Illustrator
 */
export function createProjectExchangePackage(
  model: PackagingModel,
  params: Record<string, number>,
  profile: CardboardProfile,
  dieline: DielineResult,
  geometryVersion: number = 1,
  artVersion: number = 0,
  artworkDataUri?: string
): PLMPackProjectExchange {
  const topology: DielineTopology = dieline.customTopology || buildFoldingTopology(dieline);

  const panels = topology.panels.map((p) => {
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

    return {
      id: p.id,
      name: p.name || p.id,
      isRoot: !!p.isRoot,
      polygon: p.boundary.map((pt) => ({ x: pt.x, y: pt.y })),
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

  return {
    projectId: `proj_${model.id.toLowerCase()}`,
    projectName: `${model.name} (${model.code})`,
    modelId: model.id,
    modelCode: model.code,
    modelName: model.name,
    geometryVersion,
    artVersion,
    timestamp: new Date().toISOString(),
    parameters: { ...params },
    substrate: {
      id: profile.id,
      name: profile.name,
      code: profile.code,
      thickness: profile.thickness,
      outerColor: profile.outerColor || '#FFFFFF',
      innerColor: profile.innerColor || '#FFFFFF',
    },
    dieline: {
      bounds: { ...dieline.bounds },
      lines: dieline.lines.map((l) => ({
        x1: l.x1,
        y1: l.y1,
        x2: l.x2,
        y2: l.y2,
        type: l.type as 'cut' | 'crease' | 'bleed' | 'dimension',
      })),
      arcs: (dieline.arcs || []).map((a) => ({
        cx: a.cx,
        cy: a.cy,
        r: a.r,
        startAngle: a.startAngle,
        endAngle: a.endAngle,
        type: a.type as 'cut' | 'crease',
      })),
    },
    panels,
    artwork: artworkDataUri
      ? {
          textureDataUri: artworkDataUri,
          updatedAt: new Date().toISOString(),
        }
      : undefined,
  };
}
