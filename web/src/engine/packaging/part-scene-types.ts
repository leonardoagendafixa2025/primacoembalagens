// Tipo estrutural comum entre `PartScene` (legado) e `PipelinePartScene` (novo).
// Usado pelo assembly-solver e pelo viewer-3d para tratar as duas implementações
// de forma intercambiável durante a migração para a pipeline definitiva.
import * as THREE from "three";

export interface PivotLike {
  panelId: string;
  pivot: THREE.Group;
  axis: THREE.Vector3;
  sign: 1 | -1;
  target: number;
}

export interface AnyPartScene {
  partId: string;
  group: THREE.Group;
  carrier: THREE.Group;
  root: THREE.Group;
  pivots: PivotLike[];
  rootPanelId: string;
  panelMeshes: Map<string, THREE.Mesh>;
  wireOverlays: Map<string, THREE.LineSegments>;
  panelCentroids: Map<string, THREE.Vector3>;
  debugOverlays?: THREE.Group;
  width: number;
  height: number;
  thickness: number;
  dispose: () => void;
}
