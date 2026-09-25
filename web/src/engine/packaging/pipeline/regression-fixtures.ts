import type { Dieline, Segment } from "../dieline-types";
import { hline, line, rectSegments, vline } from "../geom";
import { MODELS, defaultParamsFor } from "../models";

function dieline(name: string, segments: Segment[], width: number, height: number): Dieline {
  return {
    width,
    height,
    segments,
    panels: [],
    meta: {
      fefco: "V3-FIXTURE",
      name,
      params: { L: 100, H: 80, P: 40, thickness: 0.4, glueTab: 15, bleed: 3 },
    },
  };
}

function fixtureSimpleRectangularBox(): Dieline {
  const segs: Segment[] = [
    ...rectSegments(0, 0, 180, 120),
    vline(40, 0, 120, "crease"),
    vline(140, 0, 120, "crease"),
    hline(40, 140, 35, "crease"),
    hline(40, 140, 85, "crease"),
  ];
  return dieline("caixa simples retangular", segs, 180, 120);
}

function fixtureTongueLock(): Dieline {
  const segs: Segment[] = [
    ...rectSegments(0, 0, 240, 130),
    vline(45, 25, 105, "crease"), vline(105, 25, 105, "crease"), vline(165, 25, 105, "crease"),
    hline(45, 195, 25, "crease"), hline(45, 195, 105, "crease"),
    // tongue lock local: cut + pequeno vinco funcional dentro da aba superior
    line(102, 112, 120, 124, "cut"), line(120, 124, 138, 112, "cut"), line(102, 112, 138, 112, "cut"),
    line(120, 112, 120, 124, "crease"),
  ];
  return dieline("caixa com tongue lock / travas", segs, 240, 130);
}

function fixtureInternalWindow(): Dieline {
  const segs: Segment[] = [
    ...rectSegments(0, 0, 220, 120),
    vline(60, 0, 120, "crease"), vline(160, 0, 120, "crease"),
    hline(60, 160, 30, "crease"), hline(60, 160, 90, "crease"),
    ...rectSegments(90, 48, 40, 28, "cut"),
  ];
  return dieline("faca com janela interna", segs, 220, 120);
}

function fixtureMultipleSmallFlaps(): Dieline {
  const segs: Segment[] = [
    ...rectSegments(0, 0, 260, 140),
    vline(60, 30, 110, "crease"), vline(120, 30, 110, "crease"), vline(180, 30, 110, "crease"),
    hline(30, 230, 30, "crease"), hline(30, 230, 110, "crease"),
  ];
  for (let x = 35; x <= 205; x += 34) {
    segs.push(line(x, 110, x + 10, 130, "cut"), line(x + 10, 130, x + 20, 110, "cut"), line(x + 10, 110, x + 10, 130, "crease"));
  }
  return dieline("faca com múltiplas abas pequenas", segs, 260, 140);
}

function fixtureMicroGaps(): Dieline {
  const segs: Segment[] = [
    line(0, 0, 99.8, 0, "cut"), line(100.1, 0, 220, 0, "cut"),
    line(220, 0, 220, 120, "cut"), line(220, 120, 0, 120, "cut"), line(0, 120, 0, 0.2, "cut"),
    vline(60, 0.1, 119.9, "crease"), vline(160.2, 0, 120, "crease"),
    hline(60, 160, 30.15, "crease"), hline(60, 160, 90.05, "crease"),
  ];
  return dieline("faca com micro gaps Illustrator/Corel", segs, 220, 120);
}

function fixtureFragmentedColinear(): Dieline {
  const segs: Segment[] = [...rectSegments(0, 0, 220, 120)];
  for (let x = 0; x < 220; x += 22) segs.push(line(x, 60, Math.min(220, x + 20), 60, "crease"));
  segs.push(vline(70, 0, 120, "crease"), vline(150, 0, 120, "crease"));
  return dieline("faca com linhas colineares fragmentadas", segs, 220, 120);
}

function fixtureCreaseTouchesCutNoVertex(): Dieline {
  const segs: Segment[] = [
    ...rectSegments(0, 0, 220, 120),
    line(60, 0.24, 60, 119.76, "crease"),
    line(160, 0.24, 160, 119.76, "crease"),
    line(60.2, 30, 159.8, 30, "crease"),
    line(60.2, 90, 159.8, 90, "crease"),
  ];
  return dieline("crease encostando em cut sem vértice perfeito", segs, 220, 120);
}

function fixtureInternalCutouts(): Dieline {
  const segs = fixtureInternalWindow().segments.slice();
  segs.push(...rectSegments(135, 52, 12, 20, "cut"));
  return dieline("faca com recortes internos", segs, 220, 120);
}

export function packagingV3RegressionFixtures(): Dieline[] {
  const model0201 = MODELS.find((m) => m.id === "fefco-0201")!.build(defaultParamsFor("fefco-0201"));
  const crashLock = MODELS.find((m) => m.id === "fefco-0215")!.build(defaultParamsFor("fefco-0215"));
  return [
    fixtureSimpleRectangularBox(),
    model0201,
    fixtureTongueLock(),
    fixtureInternalWindow(),
    fixtureMultipleSmallFlaps(),
    fixtureMicroGaps(),
    fixtureFragmentedColinear(),
    fixtureCreaseTouchesCutNoVertex(),
    fixtureInternalCutouts(),
    crashLock,
  ];
}
