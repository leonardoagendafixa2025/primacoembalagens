# Exportação HTML 3D Autônoma (Fase 6)

## 1. Visão Geral e Filosofia de Design

A ação **Exportar HTML do 3D** gera um arquivo autônomo e autossuficiente (`.html`) que permite que clientes, convertedores, operadores de produção e designers visualizem e interajam com a embalagem em 3D diretamente no navegador, **sem depender de nenhum servidor, instalação local ou dev server do PLMPackLib**.

```
┌────────────────────────────────────────────────────────┐
│                    PLMPackLib Web                      │
│     (Modelo Ativo · Faca Canônica · Parâmetros)        │
└──────────────────────────┬─────────────────────────────┘
                           │ [ EXPORTAR HTML DO 3D ]
                           ▼
┌────────────────────────────────────────────────────────┐
│                   Html3DExporter.ts                    │
│  - Extrai topologia via LoopTopologyEngine             │
│  - Constrói árvore via FoldingTreeEngine               │
│  - Computa matrizes de mundo via Kinematic3DEngine     │
│  - Serializa malhas e furos analíticos                 │
└──────────────────────────┬─────────────────────────────┘
                           │ GERA ARQUIVO ÚNICO
                           ▼
┌────────────────────────────────────────────────────────┐
│      modelo_300x200x150_3d.html (Autônomo)             │
│  - Interface WebGL Three.js Real                       │
│  - OrbitControls 360°                                  │
│  - Slider de Dobra Dinâmico 0% -> 100%                 │
│  - Animação de dobra contínua                          │
│  - Metadados canônicos completos                       │
└────────────────────────────────────────────────────────┘
```

---

## 2. Regra Fundamental: Geometria Real vs Proibição de BoxGeometry

> **REGRA ABSOLUTA (Seções 20 e 30):**
> O exportador NÃO cria cubos aproximados, `BoxGeometry`, caixas genéricas ou bounding boxes.

A visualização 3D contida no HTML é construída a partir da **mesma geometria canônica e topologia** utilizada pelo aplicativo:
* Cada painel estrutural (`StructuralPanel`) é reconstruído com seu contorno analítico exato (`outerBoundary.vertices`) via `THREE.Shape` e `THREE.ShapeGeometry`.
* Furos (`holes`) são perfurados com exatidão analítica sem preenchimento.
* As matrizes de articulação cinemática derivam estritamente do `Kinematic3DEngine`, garantindo que:
  * Em **0% de dobra**: todas as peças residem coplanares no plano $Z = 0$, reproduzindo exatamente o desenho da faca 2D sem distorção métrica.
  * Em **100% de dobra**: a caixa atinge o estado montado exato conforme os ângulos nominais e regras cinemáticas do modelo.

---

## 3. Controles e Funcionalidades no Visualizador 3D

O arquivo HTML exportado inclui:

1. **Controle de Dobra (Slider 0% a 100%)**:
   * `0%`: Faca 100% aberta e plana sobre o chão virtual.
   * `100%`: Embalagem 100% montada.
   * Valores intermediários ($0 < t < 1$): Interpolação quaterniônica SLERP das matrizes rígidas, livre de deformação métrica intra-painel.
2. **Animação Automática (▶ Animar / ⏸ Pausar)**:
   * Ciclo contínuo de montagem e abertura automática ($0\% \to 100\% \to 0\%$) a 60 FPS.
3. **Atalhos Rápidos**:
   * **Faca Aberta (0%)**: Redefine imediatamente para o estado plano 2D.
   * **Montado (100%)**: Redefine imediatamente para o estado tridimensional montado.
   * **Resetar Câmera**: Reposiciona a câmera e o alvo na posição de enquadramento ideal.
4. **OrbitControls 360°**:
   * Botão esquerdo / toque: rotação orbital completa em torno da base.
   * Botão direito / toque com dois dedos: pan lateral/vertical.
   * Roda do mouse / pinça: zoom suave com amortecimento inercial (`dampingFactor = 0.06`).
5. **Card de Informações Técnicas**:
   * Exibição do código do modelo, nome, dimensões (L × B × H × Espessura), contagem de painéis, contagem de vincos articulados e tipo de substrato.

---

## 4. Estado do Projeto e Metadados Forenses Embutidos

No rodapé do documento HTML, um script com identificador semântico armazena o estado completo do projeto em JSON estruturado:

```html
<script id="plmpack-metadata" type="application/json">
{
  "generator": "PLMPackLib Web CAD Pro v2.4 (Fase 6)",
  "schemaVersion": 1,
  "projectId": "proj_fefco_0429",
  "modelId": "fefco_0429",
  "modelCode": "FEFCO 0429",
  "modelName": "Caixa com Tampa e Travas Laterais",
  "dimensions": { "L": 300, "B": 200, "H": 150, "Ep": 0.6 },
  "parameters": { "L": 300, "B": 200, "H": 150, "Ep": 0.6 },
  "substrate": {
    "name": "Papel Duplex / Triplex",
    "thickness": 0.6,
    "outerColor": "#FFFFFF",
    "innerColor": "#F5F5F0"
  },
  "bounds": { "minX": -150, "minY": -100, "maxX": 150, "maxY": 100, "width": 300, "height": 200 },
  "panelsCount": 17,
  "hingesCount": 12,
  "initialFoldState": 1.0,
  "timestamp": "2026-09-22T16:45:00.000Z"
}
</script>
```

---

## 5. Compatibilidade e Execução

* **Navegadores Homologados**: Google Chrome, Mozilla Firefox, Microsoft Edge, Apple Safari, Opera (desktop e mobile).
* **Protocolo**: Pode ser aberto diretamente pelo sistema de arquivos (`file:///C:/.../modelo_3d.html`) por duplo-clique no Windows Explorer / macOS Finder, ou hospedado em qualquer servidor web estático (Apache, Nginx, S3, Vercel, etc.).
* **Responsividade**: Adapta-se automaticamente a telas de smartphones, tablets e monitores Ultrawide (4K).
