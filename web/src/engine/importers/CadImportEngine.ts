import type {
  ImportedCadDocument,
  ImportValidationReport,
} from './types';
import { parseDxfDocument } from './DxfImporter';
import { parseSvgDocument } from './SvgImporter';
import { parsePdfDocument } from './PdfImporter';
import { parseDwgDocument } from './DwgImporter';
import { applyClassificationToDocument } from './ClassificationEngine';
import { normalizeAndBuildGeometry, type NormalizerOptions } from './GeometryNormalizer';
import type { PackagingGeometry } from '../geometry';
import type { DielineResult } from '../types';

/**
 * Ponto de entrada unificado para importação de facas CAD no PRIMACOR EMBALAGENS
 */
export class CadImportEngine {
  /**
   * Importa e decodifica arquivo CAD em formato PDF, SVG, DXF ou DWG
   */
  public static async importFile(
    content: string | ArrayBuffer | Uint8Array,
    filename: string
  ): Promise<ImportedCadDocument> {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    let doc: ImportedCadDocument;

    if (ext === 'dxf') {
      const text = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
      doc = parseDxfDocument(text, filename);
    } else if (ext === 'svg') {
      const text = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
      doc = parseSvgDocument(text, filename);
    } else if (ext === 'pdf') {
      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
      doc = parsePdfDocument(bytes, filename);
    } else if (ext === 'dwg') {
      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
      doc = parseDwgDocument(bytes, filename);
    } else {
      // Heurística pelo início do conteúdo
      if (typeof content === 'string' && content.trim().startsWith('<?xml') || (typeof content === 'string' && content.includes('<svg'))) {
        doc = parseSvgDocument(content, filename);
      } else if (typeof content === 'string' && content.includes('SECTION') && content.includes('HEADER')) {
        doc = parseDxfDocument(content, filename);
      } else {
        throw new Error(`Formato de arquivo não suportado: "${filename}". Formatos aceitos: .PDF, .SVG, .DXF, .DWG`);
      }
    }

    // Aplica sugestões iniciais de classificação
    const suggestions = applyClassificationToDocument(doc);
    doc.colorStats = suggestions.colorStats;
    doc.layerStats = suggestions.layerStats;
    doc.lineTypeStats = suggestions.lineTypeStats;

    return doc;
  }

  /**
   * Transforma a representação intermediária ImportedCadDocument em PackagingGeometry nativa
   */
  public static buildPackagingGeometry(
    doc: ImportedCadDocument,
    options: NormalizerOptions = {}
  ): {
    geometry: PackagingGeometry;
    dieline: DielineResult;
    report: ImportValidationReport;
  } {
    const activeOptions: NormalizerOptions = {
      originZeroZero: true,
      ...options,
    };
    return normalizeAndBuildGeometry(doc, activeOptions);
  }
}
