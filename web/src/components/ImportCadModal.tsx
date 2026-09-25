import React, { useState, useRef } from 'react';
import {
  FileUp,
  Layers,
  Palette,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Sparkles,
  RefreshCw,
  Save,
  Check,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CadImportEngine } from '../engine/importers/CadImportEngine';
import {
  getSavedProfiles,
  saveProfile,
  DEFAULT_PROFILES,
} from '../engine/importers/ClassificationEngine';
import { registerCustomModel } from '../engine/models';
import {
  analyzeImportedDieline,
  createParametricDielineCalculator,
} from '../engine/importers/ParametricDielineDeformer';
import type {
  ImportedCadDocument,
  CadClassificationTarget,
  ClassificationRule,
  ClassificationProfile,
  CadUnit,
  ImportValidationReport,
} from '../engine/importers/types';
import type { PackagingModel, DielineResult } from '../engine/types';
import type { PackagingGeometry } from '../engine/geometry';

interface ImportCadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (model: PackagingModel, dieline: DielineResult, geometry: PackagingGeometry) => void;
}

export const ImportCadModal: React.FC<ImportCadModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<ImportedCadDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<CadUnit>('mm');
  const [selectedSide, setSelectedSide] = useState<'exterior' | 'interior'>('exterior');
  const [profiles, setProfiles] = useState<ClassificationProfile[]>(() => getSavedProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string>(DEFAULT_PROFILES[0].id);
  const [activeMappingType, setActiveMappingType] = useState<'colors' | 'layers'>('colors');

  // Mapeamentos manuais por Cor (Hex -> Target) e por Layer (LayerName -> Target)
  const [colorOverrides, setColorOverrides] = useState<Record<string, CadClassificationTarget>>({});
  const [layerOverrides, setLayerOverrides] = useState<Record<string, CadClassificationTarget>>({});

  // Diagnóstico e Relatório
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [validationReport, setValidationReport] = useState<ImportValidationReport | null>(null);
  const [saveProfileName, setSaveProfileName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSavedSuccess, setProfileSavedSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleResetFile = () => {
    setFile(null);
    setDoc(null);
    setValidationReport(null);
    setColorOverrides({});
    setLayerOverrides({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectNewFile = () => {
    handleResetFile();
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  if (!isOpen) return null;

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setDoc(null);
    setValidationReport(null);
    setColorOverrides({});
    setLayerOverrides({});

    try {
      let importedDoc: ImportedCadDocument;
      if (selectedFile.name.endsWith('.pdf') || selectedFile.name.endsWith('.dwg')) {
        const arrayBuf = await selectedFile.arrayBuffer();
        importedDoc = await CadImportEngine.importFile(new Uint8Array(arrayBuf), selectedFile.name);
      } else {
        const text = await selectedFile.text();
        importedDoc = await CadImportEngine.importFile(text, selectedFile.name);
      }

      setDoc(importedDoc);
      setSelectedUnit(importedDoc.detectedUnit !== 'unknown' ? importedDoc.detectedUnit : 'mm');

      // Gera pré-visualização da validação inicial
      const currentProf = profiles.find((p) => p.id === selectedProfileId);
      const res = CadImportEngine.buildPackagingGeometry(importedDoc, {
        profile: currentProf,
      });
      setValidationReport(res.report);
    } catch (err: any) {
      alert(`Erro ao processar arquivo: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleColorTargetChange = (hex: string, target: CadClassificationTarget) => {
    setColorOverrides((prev) => ({ ...prev, [hex]: target }));
    recomputeValidation({ ...colorOverrides, [hex]: target }, layerOverrides);
  };

  const handleLayerTargetChange = (layerName: string, target: CadClassificationTarget) => {
    setLayerOverrides((prev) => ({ ...prev, [layerName]: target }));
    recomputeValidation(colorOverrides, { ...layerOverrides, [layerName]: target });
  };

  const classifyAllUnclassified = (target: CadClassificationTarget) => {
    if (!doc) return;
    const newColorOverrides = { ...colorOverrides };
    const newLayerOverrides = { ...layerOverrides };

    for (const cs of doc.colorStats) {
      const current = newColorOverrides[cs.colorKey] || cs.suggestedTarget || 'UNCLASSIFIED';
      if (current === 'UNCLASSIFIED') {
        newColorOverrides[cs.colorKey] = target;
      }
    }
    for (const ls of doc.layerStats) {
      const current = newLayerOverrides[ls.layerName] || ls.suggestedTarget || 'UNCLASSIFIED';
      if (current === 'UNCLASSIFIED') {
        newLayerOverrides[ls.layerName] = target;
      }
    }
    setColorOverrides(newColorOverrides);
    setLayerOverrides(newLayerOverrides);
    recomputeValidation(newColorOverrides, newLayerOverrides);
  };

  const linesCount = doc?.entities.filter((e) => e.sourceType === 'LINE').length || 0;
  const arcsCount = doc?.entities.filter((e) => e.sourceType === 'ARC' || e.sourceType === 'CIRCLE').length || 0;
  const pathsCount = doc?.entities.filter((e) => e.sourceType === 'BEZIER' || e.sourceType === 'POLYLINE' || e.sourceType === 'LWPOLYLINE').length || 0;

  const recomputeValidation = (
    cOverrides: Record<string, CadClassificationTarget>,
    lOverrides: Record<string, CadClassificationTarget>
  ) => {
    if (!doc) return;
    const customRules: ClassificationRule[] = [];

    // Adiciona overrides de layer com prioridade alta
    Object.entries(lOverrides).forEach(([layer, target], idx) => {
      customRules.push({
        id: `override_layer_${idx}`,
        criteria: 'LAYER',
        matchValue: layer,
        target,
        priority: 150,
      });
    });

    // Adiciona overrides de cor
    Object.entries(cOverrides).forEach(([hex, target], idx) => {
      customRules.push({
        id: `override_color_${idx}`,
        criteria: 'COLOR',
        matchValue: hex,
        target,
        priority: 120,
      });
    });

    const currentProf = profiles.find((p) => p.id === selectedProfileId);
    const res = CadImportEngine.buildPackagingGeometry(doc, {
      customRules,
      profile: currentProf,
      userScaleFactor: selectedUnit === 'cm' ? 10.0 : selectedUnit === 'inch' ? 25.4 : selectedUnit === 'pt' ? 25.4 / 72.0 : 1.0,
    });
    setValidationReport(res.report);
  };

  const handleSaveCustomProfile = () => {
    if (!saveProfileName.trim()) {
      alert('Informe um nome para o perfil do fornecedor.');
      return;
    }

    const rules: ClassificationRule[] = [];
    Object.entries(layerOverrides).forEach(([layer, target], idx) => {
      rules.push({ id: `l_${idx}`, criteria: 'LAYER', matchValue: layer, target, priority: 100 });
    });
    Object.entries(colorOverrides).forEach(([hex, target], idx) => {
      rules.push({ id: `c_${idx}`, criteria: 'COLOR', matchValue: hex, target, priority: 80 });
    });

    const newProfile: ClassificationProfile = {
      id: `profile_${Date.now()}`,
      name: saveProfileName.trim(),
      format: (doc?.format as any) || 'ALL',
      defaultUnit: selectedUnit,
      toleranceMm: 0.05,
      rules,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveProfile(newProfile);
    const updated = getSavedProfiles();
    setProfiles(updated);
    setSelectedProfileId(newProfile.id);
    setProfileSavedSuccess(true);
    setIsSavingProfile(false);
    setTimeout(() => setProfileSavedSuccess(false), 2500);
  };

  const handleExecuteImport = () => {
    if (!doc || !validationReport) return;

    if (validationReport.classifiedCounts.cut === 0 && validationReport.classifiedCounts.crease === 0) {
      const confirmProceed = confirm(
        'Atenção: Nenhuma linha foi classificada como CORTE ou VINCO. Deseja continuar mesmo assim?'
      );
      if (!confirmProceed) return;
    }

    const customRules: ClassificationRule[] = [];
    Object.entries(layerOverrides).forEach(([layer, target], idx) => {
      customRules.push({ id: `l_${idx}`, criteria: 'LAYER', matchValue: layer, target, priority: 150 });
    });
    Object.entries(colorOverrides).forEach(([hex, target], idx) => {
      customRules.push({ id: `c_${idx}`, criteria: 'COLOR', matchValue: hex, target, priority: 120 });
    });

    const currentProf = profiles.find((p) => p.id === selectedProfileId);
    const { geometry, dieline } = CadImportEngine.buildPackagingGeometry(doc, {
      customRules,
      profile: currentProf,
      originZeroZero: true,
      userScaleFactor: selectedUnit === 'cm' ? 10.0 : selectedUnit === 'inch' ? 25.4 : selectedUnit === 'pt' ? 25.4 / 72.0 : 1.0,
    });

    const baseWidth = Math.round((geometry.bounds.width > 0 ? geometry.bounds.width : 300) * 10) / 10;
    const baseHeight = Math.round((geometry.bounds.height > 0 ? geometry.bounds.height : 200) * 10) / 10;
    const baseDieline = dieline;

    // Analisa a faca importada para extrair L, B, H, Abas Laterais, Aba da Tampa e Aba de Cola
    const analysis = analyzeImportedDieline(baseDieline);
    const init = analysis.initialParams;
    const parametricCalculate = createParametricDielineCalculator(baseDieline, analysis);

    // Cria modelo de embalagem integrado com parâmetros de caixa IDÊNTICOS À BIBLIOTECA
    const importedModel: PackagingModel = {
      id: `imported_${Date.now()}`,
      code: file ? file.name.replace(/\.[^/.]+$/, '').toUpperCase().slice(0, 14) : 'DIE_IMPORT',
      name: file ? file.name : 'Faca Importada',
      category: 'PERSONALIZADO',
      description: `Faca CAD importada em formato ${doc.format} (${baseWidth}x${baseHeight} mm) com parametrização completa de abas e corpo.`,
      defaultParams: {
        ...init,
        origL: init.L,
        origB: init.B,
        scale: 100,
        lockRatio: 0,
      },
      paramDefs: [
        { key: 'L', label: 'Comprimento / Frente (L)', min: Math.max(10, Math.round(init.L * 0.2)), max: Math.round(init.L * 3.5), step: 1, unit: 'mm', description: 'Comprimento da base / frente da embalagem' },
        { key: 'B', label: 'Largura / Profundidade (B)', min: Math.max(10, Math.round(init.B * 0.2)), max: Math.round(init.B * 3.5), step: 1, unit: 'mm', description: 'Largura ou profundidade da caixa' },
        { key: 'H', label: 'Altura (H)', min: Math.max(5, Math.round(init.H * 0.2)), max: Math.round(init.H * 3.5), step: 1, unit: 'mm', description: 'Altura das paredes da embalagem' },
        { key: 'AbaLat', label: 'Aba Lateral - Largura', min: Math.max(5, Math.round(init.AbaLat * 0.2)), max: Math.round(init.AbaLat * 3.5), step: 1, unit: 'mm', description: 'Largura das abas laterais' },
        { key: 'AbaLatH', label: 'Aba Lateral - Altura', min: Math.max(5, Math.round(init.AbaLatH * 0.2)), max: Math.round(init.AbaLatH * 3.5), step: 1, unit: 'mm', description: 'Altura ou profundidade das abas laterais' },
        { key: 'AbaTampa', label: 'Aba da Tampa (Fechamento)', min: Math.max(5, Math.round(init.AbaTampa * 0.2)), max: Math.round(init.AbaTampa * 3.5), step: 1, unit: 'mm', description: 'Aba de fechamento / encaixe da tampa' },
        { key: 'AbaCola', label: 'Aba de Colagem (M)', min: Math.max(5, Math.round(init.AbaCola * 0.2)), max: Math.round(init.AbaCola * 3.5), step: 1, unit: 'mm', description: 'Largura da aba de cola' },
        { key: 'Ep', label: 'Espessura do Material (Ep)', min: 0.1, max: 10.0, step: 0.05, unit: 'mm', description: 'Caliper / espessura do papelão ou cartão' },
      ],
      calculate: parametricCalculate,
      isFoldable: dieline.segments.some((s) => s.type === 'crease'),
      status: 'PASS',
      originalSource: 'NONE',
      implementationType: 'NATIVE_TS',
    };

    registerCustomModel(importedModel);

    confetti({ particleCount: 40, spread: 60, origin: { y: 0.15 } });
    onImportSuccess(importedModel, dieline, geometry);
    handleResetFile();
    onClose();
  };

  const TARGET_OPTIONS: Array<{ value: CadClassificationTarget; label: string; color: string }> = [
    { value: 'CUT', label: 'CORTE', color: '#ef4444' },
    { value: 'CREASE', label: 'VINCO', color: '#10b981' },
    { value: 'PERF', label: 'PICOTE', color: '#f59e0b' },
    { value: 'HALF_CUT', label: 'MEIO CORTE', color: '#f97316' },
    { value: 'REVERSE_CREASE', label: 'VINCO REVERSO', color: '#06b6d4' },
    { value: 'SLOT', label: 'RASGO', color: '#ec4899' },
    { value: 'CONSTRUCTION', label: 'LINHA CONSTRUÇÃO', color: '#94a3b8' },
    { value: 'ANNOTATION', label: 'ANOTAÇÃO', color: '#64748b' },
    { value: 'DIMENSION', label: 'DIMENSÃO / COTA', color: '#38bdf8' },
    { value: 'GRAPHIC', label: 'GRÁFICO / ARTE', color: '#a855f7' },
    { value: 'IGNORE', label: 'IGNORAR', color: '#475569' },
    { value: 'UNCLASSIFIED', label: 'NÃO CLASSIFICADO', color: '#eab308' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(900px, 96vw)',
          maxHeight: '92vh',
          background: 'var(--cad-bg-panel, #1e222b)',
          border: '1px solid var(--cad-border-default, #333a48)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--cad-border-subtle, #2a313d)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--cad-bg-header, #15181f)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(0, 210, 180, 0.2), rgba(0, 140, 255, 0.2))',
                border: '1px solid var(--cad-accent, #00d2b4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--cad-accent, #00d2b4)',
              }}
            >
              <FileUp size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
                IMPORTAR FACA / DIE IMPORT
              </h2>
              <span style={{ fontSize: 11, color: 'var(--cad-text-muted, #8b949e)' }}>
                Importação Vetorial Profissional: PDF, SVG, DXF, DWG
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {doc && (
              <button
                type="button"
                onClick={handleSelectNewFile}
                className="cad-btn"
                style={{
                  background: 'rgba(0, 210, 180, 0.15)',
                  border: '1px solid var(--cad-accent, #00d2b4)',
                  color: 'var(--cad-accent, #00d2b4)',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
                title="Escolher outro arquivo de faca CAD para substituir o atual"
              >
                <RefreshCw size={13} />
                <span>Trocar Arquivo</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--cad-text-muted, #8b949e)',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Hidden File Input (Always accessible in DOM) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.svg,.dxf,.dwg"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
            e.target.value = '';
          }}
        />

        {/* Barra de Progresso das Etapas de Importação (1 a 5) */}
        <div
          style={{
            padding: '8px 20px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderBottom: '1px solid var(--cad-border-subtle, #2a313d)',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            overflowX: 'auto',
          }}
        >
          {doc ? (
            <button
              type="button"
              onClick={handleSelectNewFile}
              style={{
                padding: '3px 10px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              title="Clique para escolher outro arquivo de faca CAD"
            >
              <FileUp size={12} color="var(--cad-accent)" />
              <span>← Escolher Outra Faca</span>
            </button>
          ) : (
            <div style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: 'var(--cad-accent, #00d2b4)', color: '#000' }}>
              ETAPA 1: Analisar Arquivo
            </div>
          )}
          <div style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: doc ? (validationReport ? '#10b981' : 'var(--cad-accent, #00d2b4)') : 'rgba(255,255,255,0.08)', color: doc ? '#000' : '#888' }}>
            ETAPA 2: Geometria Encontrada
          </div>
          <div style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: doc && validationReport?.classifiedCounts.unclassified === 0 ? '#10b981' : (doc ? '#f59e0b' : 'rgba(255,255,255,0.08)'), color: doc ? '#000' : '#888' }}>
            ETAPA 3: Classificar Linhas
          </div>
          <div style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: doc && validationReport ? 'var(--cad-accent, #00d2b4)' : 'rgba(255,255,255,0.08)', color: doc && validationReport ? '#000' : '#888' }}>
            ETAPA 4: Confirmar Importação
          </div>
          <div style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.08)', color: '#888' }}>
            ETAPA 5: Carregar no PLMPackLib
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Upload Area se nenhum arquivo estiver selecionado */}
          {!doc ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--cad-border-hover, #4b5563)',
                borderRadius: 10,
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.02)',
                transition: 'all 0.15s ease',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = 'var(--cad-accent, #00d2b4)';
                e.currentTarget.style.background = 'rgba(0, 210, 180, 0.05)';
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--cad-border-hover, #4b5563)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files[0];
                if (dropped) handleFileSelect(dropped);
              }}
            >
              <FileCode size={40} color="var(--cad-accent, #00d2b4)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                {isLoading ? 'Lendo e decodificando entidades CAD...' : 'Clique ou arraste a faca CAD aqui'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cad-text-muted, #8b949e)', marginBottom: 14 }}>
                Formatos aceitos: PDF Vetorial (.pdf), SVG (.svg), AutoCAD DXF (.dxf), DWG (.dwg)
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                {['PDF', 'SVG', 'DXF', 'DWG'].map((fmt) => (
                  <span
                    key={fmt}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--cad-accent, #00d2b4)',
                      border: '1px solid var(--cad-border-subtle, #333)',
                    }}
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Alerta de Falha Crítica se não houver geometria vetorial */}
              {(doc.isRasterOnly || (doc.errors.length > 0 && doc.entities.length === 0)) && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#ef4444', marginBottom: 4 }}>
                    IMPORT_FAILED
                  </div>
                  <div style={{ fontSize: 12, color: '#ffaaaa' }}>
                    <strong>Motivo:</strong> O arquivo não contém geometria vetorial utilizável (apenas imagens rasterizadas ou sem linhas/arcos CAD).
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={handleSelectNewFile}
                      style={{
                        background: '#ef4444',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '7px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <FileUp size={14} />
                      <span>Selecionar Outra Faca CAD</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Barra de Informações do Arquivo e Configurações Globais */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12,
                  padding: 12,
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 8,
                  border: '1px solid var(--cad-border-subtle, #2a313d)',
                }}
              >
                <div>
                  <span style={{ fontSize: 10, color: 'var(--cad-text-muted)', display: 'block' }}>Arquivo:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13, color: '#fff', wordBreak: 'break-all' }}>{doc.filename}</strong>
                    <span style={{ fontSize: 10, color: 'var(--cad-accent)' }}>({doc.format})</span>
                    <button
                      type="button"
                      onClick={handleSelectNewFile}
                      style={{
                        background: 'rgba(0, 210, 180, 0.12)',
                        border: '1px solid var(--cad-accent, #00d2b4)',
                        color: 'var(--cad-accent, #00d2b4)',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      title="Escolher outro arquivo de faca CAD"
                    >
                      <RefreshCw size={10} />
                      <span>Trocar</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 10, color: 'var(--cad-text-muted)', display: 'block' }}>Unidade CAD:</label>
                  <select
                    value={selectedUnit}
                    onChange={(e) => {
                      const u = e.target.value as CadUnit;
                      setSelectedUnit(u);
                      recomputeValidation(colorOverrides, layerOverrides);
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--cad-bg-input, #111)',
                      color: '#fff',
                      border: '1px solid var(--cad-border-default, #444)',
                      borderRadius: 4,
                      padding: '4px 6px',
                      fontSize: 12,
                    }}
                  >
                    <option value="mm">Milímetros (mm)</option>
                    <option value="cm">Centímetros (cm)</option>
                    <option value="inch">Polegadas (inch)</option>
                    <option value="pt">Pontos (pt - 1/72 pol)</option>
                    <option value="px">Pixels (px - 96 DPI)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 10, color: 'var(--cad-text-muted)', display: 'block' }}>Face / Lado:</label>
                  <select
                    value={selectedSide}
                    onChange={(e) => setSelectedSide(e.target.value as any)}
                    style={{
                      width: '100%',
                      background: 'var(--cad-bg-input, #111)',
                      color: '#fff',
                      border: '1px solid var(--cad-border-default, #444)',
                      borderRadius: 4,
                      padding: '4px 6px',
                      fontSize: 12,
                    }}
                  >
                    <option value="exterior">Exterior (Design Side)</option>
                    <option value="interior">Interior (Die Side)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 10, color: 'var(--cad-text-muted)', display: 'block' }}>Perfil de Regras:</label>
                  <select
                    value={selectedProfileId}
                    onChange={(e) => {
                      setSelectedProfileId(e.target.value);
                      recomputeValidation(colorOverrides, layerOverrides);
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--cad-bg-input, #111)',
                      color: '#fff',
                      border: '1px solid var(--cad-border-default, #444)',
                      borderRadius: 4,
                      padding: '4px 6px',
                      fontSize: 12,
                    }}
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabela de Mapeamento por Cores / Layers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setActiveMappingType('colors')}
                      style={{
                        background: activeMappingType === 'colors' ? 'var(--cad-accent, #00d2b4)' : 'rgba(255,255,255,0.06)',
                        color: activeMappingType === 'colors' ? '#000' : '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        cursor: 'pointer',
                      }}
                    >
                      <Palette size={13} />
                      <span>Cores ({doc.colorStats.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveMappingType('layers')}
                      style={{
                        background: activeMappingType === 'layers' ? 'var(--cad-accent, #00d2b4)' : 'rgba(255,255,255,0.06)',
                        color: activeMappingType === 'layers' ? '#000' : '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        cursor: 'pointer',
                      }}
                    >
                      <Layers size={13} />
                      <span>Camadas ({doc.layerStats.length})</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setDoc(null);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--cad-accent)',
                      fontSize: 11,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Trocar Arquivo
                  </button>
                </div>

                <div
                  style={{
                    maxHeight: 240,
                    overflowY: 'auto',
                    border: '1px solid var(--cad-border-subtle, #2a313d)',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.2)',
                  }}
                >
                  {activeMappingType === 'colors' ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#fff' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px', width: 40 }}>Cor</th>
                          <th style={{ padding: '8px 10px' }}>Atributo / Hex / Código</th>
                          <th style={{ padding: '8px 10px', width: 90 }}>Entidades</th>
                          <th style={{ padding: '8px 10px', width: 220 }}>Classificação Mapeada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doc.colorStats.map((cs) => {
                          const currentTarget = colorOverrides[cs.colorKey] || cs.suggestedTarget || 'UNCLASSIFIED';
                          return (
                            <tr
                              key={cs.colorKey}
                              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                            >
                              <td style={{ padding: '6px 10px' }}>
                                <div
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 4,
                                    background: cs.colorKey,
                                    border: '1px solid #666',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{cs.colorKey}</span>
                                {cs.color.raw && (
                                  <span style={{ fontSize: 10, color: 'var(--cad-text-muted)', marginLeft: 8 }}>
                                    ({cs.color.raw})
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--cad-accent)' }}>
                                {cs.entityCount}
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <select
                                  value={currentTarget}
                                  onChange={(e) => handleColorTargetChange(cs.colorKey, e.target.value as CadClassificationTarget)}
                                  style={{
                                    width: '100%',
                                    background: 'var(--cad-bg-input, #111)',
                                    color: TARGET_OPTIONS.find((t) => t.value === currentTarget)?.color || '#fff',
                                    border: '1px solid var(--cad-border-default, #444)',
                                    borderRadius: 4,
                                    padding: '4px 6px',
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  {TARGET_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value} style={{ color: opt.color }}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#fff' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px' }}>Nome da Camada (Layer)</th>
                          <th style={{ padding: '8px 10px', width: 90 }}>Entidades</th>
                          <th style={{ padding: '8px 10px', width: 220 }}>Classificação Mapeada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doc.layerStats.map((ls) => {
                          const currentTarget = layerOverrides[ls.layerName] || ls.suggestedTarget || 'UNCLASSIFIED';
                          return (
                            <tr
                              key={ls.layerName}
                              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                            >
                              <td style={{ padding: '6px 10px' }}>
                                <span style={{ fontWeight: 700 }}>{ls.layerName}</span>
                              </td>
                              <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--cad-accent)' }}>
                                {ls.entityCount}
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <select
                                  value={currentTarget}
                                  onChange={(e) => handleLayerTargetChange(ls.layerName, e.target.value as CadClassificationTarget)}
                                  style={{
                                    width: '100%',
                                    background: 'var(--cad-bg-input, #111)',
                                    color: TARGET_OPTIONS.find((t) => t.value === currentTarget)?.color || '#fff',
                                    border: '1px solid var(--cad-border-default, #444)',
                                    borderRadius: 4,
                                    padding: '4px 6px',
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  {TARGET_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value} style={{ color: opt.color }}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Salvar Perfil de Fornecedor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  {!isSavingProfile ? (
                    <button
                      type="button"
                      onClick={() => setIsSavingProfile(true)}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--cad-border-subtle, #333)',
                        borderRadius: 4,
                        padding: '4px 8px',
                        color: 'var(--cad-text-secondary, #ccc)',
                        fontSize: 11,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <Save size={13} />
                      <span>Salvar regras como Perfil de Fornecedor</span>
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="text"
                        placeholder="Ex: Fornecedor ABC"
                        value={saveProfileName}
                        onChange={(e) => setSaveProfileName(e.target.value)}
                        style={{
                          background: 'var(--cad-bg-input, #111)',
                          color: '#fff',
                          border: '1px solid var(--cad-border-default, #444)',
                          borderRadius: 4,
                          padding: '4px 8px',
                          fontSize: 11,
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSaveCustomProfile}
                        style={{
                          background: 'var(--cad-accent, #00d2b4)',
                          color: '#000',
                          border: 'none',
                          borderRadius: 4,
                          padding: '4px 10px',
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsSavingProfile(false)}
                        style={{
                          background: 'transparent',
                          color: '#888',
                          border: 'none',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {profileSavedSuccess && (
                    <span style={{ fontSize: 11, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={13} /> Perfil salvo com sucesso!
                    </span>
                  )}
                </div>
              </div>

              {/* Etapa 3: Ação Rápida de Classificação Manual quando houver linhas não classificadas */}
              {validationReport && validationReport.classifiedCounts.unclassified > 0 && (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid #f59e0b',
                    borderRadius: 8,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: 13 }}>
                        LINHA NÃO CLASSIFICADA ({validationReport.classifiedCounts.unclassified} entidades)
                      </div>
                      <div style={{ color: '#ccc', fontSize: 11, marginTop: 2 }}>
                        Defina a função para as entidades restantes para garantir corte e dobra corretos no 2D e 3D:
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => classifyAllUnclassified('CUT')}
                        style={{
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          padding: '6px 14px',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        [ CORTE ]
                      </button>
                      <button
                        type="button"
                        onClick={() => classifyAllUnclassified('CREASE')}
                        style={{
                          background: '#10b981',
                          color: '#000',
                          border: 'none',
                          borderRadius: 4,
                          padding: '6px 14px',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        [ VINCO ]
                      </button>
                      <button
                        type="button"
                        onClick={() => classifyAllUnclassified('PERF')}
                        style={{
                          background: '#f59e0b',
                          color: '#000',
                          border: 'none',
                          borderRadius: 4,
                          padding: '6px 14px',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        [ PERFURAÇÃO ]
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumo de Validação Industrial e Diagnóstico */}
              {validationReport && (
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--cad-border-subtle, #2a313d)',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowDiagnostic((prev) => !prev)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {validationReport.geometryStatus === 'PASS' ? (
                        <CheckCircle2 size={16} color="#10b981" />
                      ) : (
                        <AlertTriangle size={16} color="#f59e0b" />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                        DIAGNÓSTICO TÉCNICO CAD: {validationReport.geometryStatus} ({validationReport.totalEntitiesFound} entidades)
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, color: '#ef4444' }}>
                        Corte: {validationReport.classifiedCounts.cut} ({validationReport.totalCutMm} mm)
                      </span>
                      <span style={{ fontSize: 11, color: '#10b981' }}>
                        Vinco: {validationReport.classifiedCounts.crease} ({validationReport.totalCreaseMm} mm)
                      </span>
                      {validationReport.classifiedCounts.perf > 0 && (
                        <span style={{ fontSize: 11, color: '#f59e0b' }}>
                          Picote: {validationReport.classifiedCounts.perf}
                        </span>
                      )}
                      {showDiagnostic ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {showDiagnostic && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #333', fontSize: 11, color: '#ccc' }}>
                      {/* Resumo Oficial do Teste de Integridade (Seção 19) */}
                      <div
                        style={{
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid var(--cad-border-subtle, #333)',
                          borderRadius: 6,
                          padding: 12,
                          fontFamily: 'monospace',
                          fontSize: 11,
                          marginBottom: 12,
                          lineHeight: 1.6,
                        }}
                      >
                        <div style={{ fontWeight: 800, color: 'var(--cad-accent)', marginBottom: 6 }}>
                          IMPORTAÇÃO CONCLUÍDA
                        </div>
                        <div>Arquivo: {doc.filename}</div>
                        <div style={{ marginTop: 6, fontWeight: 700, color: '#fff' }}>Entidades:</div>
                        <div>Lines: {linesCount}</div>
                        <div>Arcs: {arcsCount}</div>
                        <div>Paths: {pathsCount}</div>
                        <div style={{ marginTop: 6, fontWeight: 700, color: '#fff' }}>Classificação:</div>
                        <div>CUT: {validationReport.classifiedCounts.cut}</div>
                        <div>CREASE: {validationReport.classifiedCounts.crease}</div>
                        <div>PERF: {validationReport.classifiedCounts.perf}</div>
                        <div>UNCLASSIFIED: {validationReport.classifiedCounts.unclassified}</div>
                        <div style={{ marginTop: 6, fontWeight: 700, color: '#fff' }}>Bounding Box:</div>
                        <div>{validationReport.bounds.width.toFixed(1)} × {validationReport.bounds.height.toFixed(1)} mm</div>
                        <div style={{ marginTop: 6 }}>Escala: 1:1 ({selectedUnit})</div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div>• <strong>Bounding Box:</strong> {validationReport.bounds.width.toFixed(1)} x {validationReport.bounds.height.toFixed(1)} mm</div>
                          <div>• <strong>Duplicatas Removidas:</strong> {validationReport.duplicatesRemoved}</div>
                          <div>• <strong>Bézier Convertidos:</strong> {validationReport.bezierConvertedCount}</div>
                        </div>
                        <div>
                          <div>• <strong>Auto-Reparos de Gaps:</strong> {validationReport.autoRepairs.length}</div>
                          <div>• <strong>Entidades não classificadas:</strong> {validationReport.classifiedCounts.unclassified}</div>
                          <div>• <strong>Entidades não suportadas:</strong> {validationReport.unsupportedEntities.length}</div>
                        </div>
                      </div>

                      {doc.errors.length > 0 && (
                        <div style={{ marginTop: 8, color: '#ef4444' }}>
                          <strong>Erros:</strong> {doc.errors.join(' | ')}
                        </div>
                      )}
                      {doc.warnings.length > 0 && (
                        <div style={{ marginTop: 6, color: '#f59e0b' }}>
                          <strong>Avisos:</strong> {doc.warnings.join(' | ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--cad-border-subtle, #2a313d)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--cad-bg-header, #15181f)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--cad-border-default, #444)',
                borderRadius: 6,
                padding: '6px 14px',
                color: 'var(--cad-text-secondary, #ccc)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>

            {doc && (
              <button
                type="button"
                onClick={handleSelectNewFile}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--cad-border-default, #444)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  color: '#fff',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
                title="Descartar este arquivo e escolher outro arquivo de faca"
              >
                <FileUp size={13} color="var(--cad-accent)" />
                <span>Escolher Outro Arquivo</span>
              </button>
            )}
          </div>

          {doc && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => recomputeValidation(colorOverrides, layerOverrides)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--cad-border-default, #444)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  color: '#fff',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} />
                <span>Revalidar Faca</span>
              </button>

              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={doc.errors.length > 0 && doc.isRasterOnly}
                style={{
                  background: 'var(--cad-accent, #00d2b4)',
                  color: '#000000',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 18px',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: doc.errors.length > 0 && doc.isRasterOnly ? 'not-allowed' : 'pointer',
                  opacity: doc.errors.length > 0 && doc.isRasterOnly ? 0.5 : 1,
                  boxShadow: '0 2px 8px rgba(0, 210, 180, 0.4)',
                }}
              >
                <Sparkles size={14} />
                <span>IMPORTAR E ABRIR EM 2D</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
