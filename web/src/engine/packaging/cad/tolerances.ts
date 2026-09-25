// Tolerâncias do pipeline CAD (todas em mm, salvo indicado).
// Equivalente conceitual ao "snap distance" / "chord tolerance" do Prinect/ArtiosCAD.

export interface CadTolerances {
  /** Distância máxima para soldar dois nós no grafo planar. */
  snapMm: number;
  /** Snap máximo entre nós de tipos DIFERENTES (cut×crease). */
  crossKindSnapMm: number;
  /** Distância máxima para fechar gaps entre dois endpoints livres (grau 1). */
  gapBridgeMm: number;
  /** Distância máxima para costurar endpoints de curvas explodidas. */
  curveJoinMm: number;
  /** Distância máxima para prever o fechamento de uma cadeia curva. */
  curveClosureMm: number;
  /** Tolerância angular (rad) para considerar dois segmentos colineares. */
  angleRad: number;
  /** Tolerância angular (rad) para continuidade tangencial C1 entre curvas. */
  curveAngleRad: number;
  /** Tolerância de corda (mm) ao linearizar béziers. */
  chordMm: number;
  /** Erro médio máximo para aceitar ajuste elíptico/circular. */
  ellipseFitError: number;
  /** Comprimento mínimo de segmento — abaixo disso é descartado como ruído. */
  minSegmentMm: number;
  /** Stroke mais fino que isso (pt) e em preto é tratado como cota/texto. */
  ignoreThinBlackPt: number;
}

export type CadToleranceOverrides = Partial<CadTolerances>;

export const CAD_TOL: CadTolerances = {
  snapMm: 0.8,
  crossKindSnapMm: 0.1,
  gapBridgeMm: 1.5,
  curveJoinMm: 2.2,
  curveClosureMm: 2.6,
  angleRad: 0.035, // ~2°
  curveAngleRad: 0.42, // ~24° — Illustrator/Corel costuma degradar tangência
  chordMm: 0.05,
  ellipseFitError: 0.16,
  minSegmentMm: 0.3,
  ignoreThinBlackPt: 0.1,
};

export const CAD_PRESERVE_GEOMETRY_TOL: CadToleranceOverrides = {
  // snapMm subido de 0.18 → 0.5 mm. Mesmo no modo "preservar geometria"
  // exportadores (Illustrator/Corel) deixam micro-gaps de até ~0.45 mm
  // entre endpoints "iguais", o que mantinha nós quase-fechados abertos.
  // 0.5 mm é o mínimo seguro para garantir fechamento sem fundir features
  // distintas como furos de >1 mm.
  snapMm: 0.5,
  // Entre tipos diferentes (cut×crease), o snap fica bem mais estrito para
  // não colapsar vinco legítimo só porque está muito próximo de um corte.
  crossKindSnapMm: 0.1,
  // gapBridgeMm subido de 0.35 → 2.2 mm para acomodar gaps de ~1.98 mm que
  // o Illustrator/Corel deixa nas pontas de chanfros de entalhe (lineTo
  // arredondado pelo CAD de origem). Mesmo limite já aceito em curveJoinMm.
  gapBridgeMm: 2.2,
  minSegmentMm: 0.2,
};

export function resolveCadTolerances(overrides?: CadToleranceOverrides): CadTolerances {
  return {
    ...CAD_TOL,
    ...(overrides ?? {}),
  };
}

/** Relatório de issues do último import (gaps fechados, loops abertos, descartes). */
export interface CadIssues {
  bridgedGaps: number;
  openEndpoints: number;
  ignoredStrokes: number;
  facesFound: number;
  /** Loops fechados que eram "perf" por aparência mas viraram corte interno. */
  internalCuts: number;
  /** Cadeias de curvas abertas restantes após healing. */
  openCurveChains: number;
  /** Geometrias curadas por chaining/merge. */
  healedCurves: number;
  /** Loops fechados inferidos/curados automaticamente. */
  healedLoops: number;
  /** Fechamentos prováveis rejeitados por baixa continuidade geométrica. */
  failedClosures: number;
  /** Loops com forte assinatura geométrica de oval. */
  inferredOvals: number;
  /** Loops com forte assinatura geométrica de círculo. */
  inferredCircles: number;
}

export const emptyIssues = (): CadIssues => ({
  bridgedGaps: 0,
  openEndpoints: 0,
  ignoredStrokes: 0,
  facesFound: 0,
  internalCuts: 0,
  openCurveChains: 0,
  healedCurves: 0,
  healedLoops: 0,
  failedClosures: 0,
  inferredOvals: 0,
  inferredCircles: 0,
});
