import type {
  ImportedCadDocument,
  CadUnit,
} from './types';
import { CAD_UNIT_FACTORS } from './types';

/**
 * Status formal de dependência do suporte DWG no PRIMACOR EMBALAGENS
 */
export const DWG_STATUS = 'BLOCKED_DEPENDENCY' as const;

/**
 * Mapeamento das assinaturas de cabeçalho binário do AutoCAD DWG
 */
export const DWG_VERSION_HEADERS: Record<string, string> = {
  'AC1015': 'AutoCAD 2000/2000i/2002',
  'AC1018': 'AutoCAD 2004/2005/2006',
  'AC1021': 'AutoCAD 2007/2008/2009',
  'AC1024': 'AutoCAD 2010/2011/2012',
  'AC1027': 'AutoCAD 2013/2014/2015/2016/2017',
  'AC1032': 'AutoCAD 2018/2019/2020/2021/2022/2023/2024/2025',
};

/**
 * Informações técnicas sobre o formato e requisitos do DWG
 */
export interface DwgHeaderInfo {
  versionCode: string;
  versionName: string;
  isRecognizedDwg: boolean;
  fileSizeBytes: number;
}

/**
 * Inspeciona o cabeçalho binário de um arquivo DWG para identificar versão real
 */
export function inspectDwgHeader(buffer: Uint8Array): DwgHeaderInfo {
  if (buffer.length < 6) {
    return {
      versionCode: 'UNKNOWN',
      versionName: 'Arquivo inválido ou corrompido',
      isRecognizedDwg: false,
      fileSizeBytes: buffer.length,
    };
  }

  const magic = String.fromCharCode(...buffer.subarray(0, 6));
  const versionName = DWG_VERSION_HEADERS[magic] || 'Versão DWG desconhecida / não suportada';
  const isRecognized = Boolean(DWG_VERSION_HEADERS[magic]);

  return {
    versionCode: magic,
    versionName,
    isRecognizedDwg: isRecognized,
    fileSizeBytes: buffer.length,
  };
}

/**
 * Parser de DWG que documenta objetivamente a dependência externa necessária
 * e rejeita mocks ou simulações falsas.
 */
export function parseDwgDocument(
  dwgData: Uint8Array | ArrayBuffer,
  filename: string = 'imported.dwg'
): ImportedCadDocument {
  const bytes = dwgData instanceof Uint8Array ? dwgData : new Uint8Array(dwgData);
  const info = inspectDwgHeader(bytes);

  const detectedUnit: CadUnit = 'unknown';
  const scaleToMm = CAD_UNIT_FACTORS['unknown'];

  const explanation = info.isRecognizedDwg
    ? `Arquivo DWG válido detectado (${info.versionName} - ${info.versionCode}). O formato DWG é binário e proprietário da Autodesk.`
    : `O arquivo fornecido não possui cabeçalho DWG padrão válido (Magic: "${info.versionCode}").`;

  const dependencyNotice =
    `Para importar arquivos DWG sem perda de precisão, utilize a conversão oficial para DXF (AutoCAD DXF R12 a 2018+) ` +
    `via utilitário CAD (Autodesk DWG TrueView, ODA File Converter ou LibreDWG CLI), ou salve a faca como DXF/PDF/SVG diretamente do seu software CAD de origem.`;

  return {
    filename,
    format: 'DWG',
    detectedUnit,
    unitConfirmed: false,
    scaleFactorToMm: scaleToMm,
    entities: [],
    layers: {},
    colorStats: [],
    layerStats: [],
    lineTypeStats: [],
    unsupportedEntities: [
      {
        type: 'DWG_BINARY_CONTAINER',
        layer: '0',
        count: 1,
        details: `${explanation} Status: ${DWG_STATUS}. ${dependencyNotice}`,
      },
    ],
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    hasVectorGeometry: false,
    isRasterOnly: false,
    warnings: [
      `DWG_STATUS = ${DWG_STATUS}`,
      explanation,
    ],
    errors: [
      `Importação direta de arquivo binário DWG requer conversão prévia para DXF.`,
      dependencyNotice,
    ],
    metadata: {
      dwgStatus: DWG_STATUS,
      headerInfo: info,
    },
  };
}
