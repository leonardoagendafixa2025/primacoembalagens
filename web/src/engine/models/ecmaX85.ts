import type { PackagingModel, DielineResult } from '../types';
import { computeParametricDieline } from '../parametricMorph';
import { buildFoldingTopology } from '../dielineTopology';
import rawDesData from '../desModelsData.json';

const rawItem = (rawDesData as Record<string, any>)['ecma_x85'];

/**
 * Modelo Nativo ECMA X85: Embalagem Porta-Garrafas com Alça Integrada (Gable Top)
 * com fechamento 3D contínuo, fundo automático e alças com furos perfeitamente vazados e alinhados.
 */
export const ecmaX85: PackagingModel = {
  id: 'ecma_x85',
  code: 'ECMA X85',
  name: 'ECMA X85 - Embalagem com Alça / Porta-Garrafas',
  category: 'ECMA',
  series: 'Série X - Embalagens Especiais',
  description: 'Caixa com alça integrada e fechamento gable-top para garrafas e presentes, com fundo automático e recortes de alça perfeitamente alinhados.',
  status: 'PASS',
  isFoldable: true,
  originalSource: 'DES_VECTOR_DRAWING',
  implementationType: 'NATIVE_TS',
  defaultParams: {
    L: 150,
    B: 100,
    H: 80,
    Ep: 0.4,
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 50, max: 400, step: 1, unit: 'mm', description: 'Frente da embalagem' },
    { key: 'B', label: 'Largura / Profundidade (B)', min: 40, max: 300, step: 1, unit: 'mm', description: 'Profundidade da lateral' },
    { key: 'H', label: 'Altura do Corpo (H)', min: 40, max: 500, step: 1, unit: 'mm', description: 'Altura do corpo inferior' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.1, max: 2.0, step: 0.05, unit: 'mm', description: 'Espessura do cartão' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const B = params.B || 100;

    const dieline = computeParametricDieline(
      rawItem.geometry,
      { L: 150, B: 100, H: 80, M: 20 },
      params,
      'ecma_x85'
    );

    // Constrói a topologia da faca 2D real
    const topo = buildFoldingTopology(dieline);

    // Cálculo dinâmico do ângulo de inclinação do teto gable-top
    // A alça centraliza em B / 2. A seção inclinada (panel_1) desloca B / 2 em profundidade:
    const halfB = B / 2;
    const pTaperFront = topo.panels.find((p) => p.id === 'panel_1');
    const hTaper = pTaperFront && pTaperFront.boundary.length > 2
      ? Math.abs(pTaperFront.boundary[0].y - pTaperFront.boundary[2].y) || 136.5
      : 136.5;

    const thetaRad = Math.asin(Math.min(0.92, halfB / Math.max(hTaper, halfB * 1.05)));
    const thetaDeg = (thetaRad * 180) / Math.PI;

    // Configuração cinemática 3D da alça, fole lateral e fundo automático
    for (const h of topo.hinges) {
      if (h.childPanelId === 'panel_1') {
        // Inclinação da parede frontal cônica em direção à linha de centro
        h.targetAngleDeg = thetaDeg;
        h.foldOrder = 2;
      } else if (h.childPanelId === 'panel_8') {
        // Alça frontal volta à verticalidade perfeita a 90° em relação à base
        h.targetAngleDeg = -thetaDeg;
        h.foldOrder = 2;
      } else if (h.childPanelId === 'panel_9') {
        // Alça traseira dobra 180° sobre a dobra superior unindo-se à alça frontal
        h.targetAngleDeg = -180;
        h.foldOrder = 3;
      } else if (h.childPanelId === 'panel_14') {
        // Parede cônica traseira inclina-se para baixo em direção à parede traseira
        h.targetAngleDeg = -thetaDeg;
        h.foldOrder = 3;
      } else if (h.childPanelId === 'panel_24') {
        // Aba superior trava internamente na parede traseira
        h.targetAngleDeg = 75;
        h.foldOrder = 4;
      } else if (h.childPanelId === 'panel_15') {
        // Fole triangular lateral direito dobra para dentro sob o teto
        h.targetAngleDeg = 45;
        h.foldOrder = 2;
      } else if (h.childPanelId === 'panel_16') {
        // Fole triangular lateral esquerdo dobra para dentro
        h.targetAngleDeg = -45;
        h.foldOrder = 2;
      } else if (h.childPanelId === 'panel_19' || h.childPanelId === 'panel_23') {
        // Dobras de 45° do fundo automático (180° sobre a aba principal)
        h.targetAngleDeg = 180;
        h.foldOrder = 1;
      }
    }

    dieline.customTopology = topo;
    return dieline;
  },
};
