import type { ClosureKind, Dieline, DielineParams } from "./dieline-types.ts";
import type { MapKind } from "./spot-mapping.ts";

export interface ArtAsset {
  url: string;
  pxWidth: number;
  pxHeight: number;
  widthMm: number;
  heightMm: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  mirrorX?: boolean;
  printSide?: "outside" | "inside";
}

export type Mode = "parametric" | "imported";
export type JointAlign = "face-to-face" | "telescope-over" | "telescope-into";

export interface Joint {
  id: string;
  partA: string;
  anchorPanelA: string | null;
  partB: string;
  anchorPanelB: string | null;
  alignment: JointAlign;
  gap: number;
  rotationOffset: number;
  progress: number;
}

export interface Pose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

export interface Part {
  id: string;
  name: string;
  mode: Mode;
  modelId: string;
  params: DielineParams;
  imported: unknown | null;
  mapping: Record<string, MapKind>;
  closureOverride: { top?: ClosureKind; bottom?: ClosureKind };
  dieline: Dieline | null;
  art: ArtAsset | null;
  artInside?: ArtAsset | null;
  pose: Pose;
  foldAngles?: Record<string, number>;
  selectedPanels: string[];
  thickness?: number;
}
