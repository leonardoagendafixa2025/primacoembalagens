# PLMPackLib Web ↔ Adobe Illustrator Bridge (Fase 6)

## 1. Visão Geral e Arquitetura

O **Illustrator Bridge** é o módulo oficial de integração bidirecional e de alta fidelidade entre o **PLMPackLib Web CAD Pro** e o **Adobe Illustrator (versões 2020 a 2025+)**.

O objetivo fundamental da integração é permitir que designers de embalagem recebam a faca canônica 1:1, desenhem a arte com todos os recursos gráficos do Illustrator e devolvam a arte para projeção imediata no visualizador 3D do PLMPackLib Web, **sem qualquer alteração na matemática do motor CAD certificado**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                            PLMPackLib Web                              │
│         (LoopTopologyEngine / FoldingTreeEngine / WebGL 3D)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 1. ABRIR NO ILLUSTRATOR
                                    │    (IllustratorProjectPayload - Faca Vetorial 1:1)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     PLMPackLib Bridge Local (Node.js)                  │
│                     127.0.0.1:48123 (HTTP + WebSocket)                 │
└───────────────────┬────────────────────────────────▲───────────────────┘
                    │                                │
      PowerShell COM / ExtendScript                  │ 2. ENVIAR ARTE P/ PLM
      (run_jsx.ps1 / CEP Extension)                  │    - vectorSvg (SVG Puro Vetorial)
                    │                                │    - textureDataUri (PNG 300 DPI)
                    ▼                                │    - metadata (Revisão, Sessão)
┌────────────────────────────────────────────────────┴───────────────────┐
│                           Adobe Illustrator 2025                       │
│    Camadas: CUT | CREASE | PERF | ARTWORK (Vetores) | GUIDES_INFO      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Contrato de Dados Canônico (`IllustratorProjectPayload`)

A comunicação utiliza um contrato estrito serializado em JSON com validação de schema e semântica de proveniência:

```typescript
export interface IllustratorProjectPayload {
  schemaVersion: 1;
  projectRevision: number;           // Incrementado a cada alteração de geometria
  illustratorSessionId: string;       // Identificador único da sessão (ai_sess_...)
  projectId: string;                  // Ex: "proj_fefco_0429"
  projectName: string;                // Nome visual amigável
  modelId: string;                    // ID canônico no catálogo (ex: "fefco_0429")
  modelCode: string;                  // Código técnico (ex: "FEFCO 0429")
  modelName: string;                  // Nome técnico da embalagem
  dimensions: {                       // Dimensões nominais (mm)
    L: number;
    B: number;
    H: number;
    [key: string]: number;
  };
  parameters: Record<string, number>;
  canonicalGeometry: {                // Geometria pura vinda da PackagingGeometry
    bounds: { minX, minY, maxX, maxY, width, height };
    segments: Array<{ x0, y0, x1, y1, type: 'cut'|'crease'|'perfo'|'bleed'|'dimension', id?: string }>;
    arcs: Array<{ cx, cy, r, startAngle, endAngle, type: 'cut'|'crease', id?: string }>;
  };
  dieline: { ... };                   // Faca estrutural consumida pelos renderizadores
  panels: Array<{                     // Polígonos de cada painel fechado
    id: string;
    name: string;
    isRoot: boolean;
    polygon: Array<{ x: number; y: number }>;
    bbox: { minX, minY, maxX, maxY, width, height };
  }>;
  hinges: Array<{                     // Dobradiças cinemáticas reais
    hingeId: string;
    parentPanelId: string;
    childPanelId: string;
    x0: number; y0: number; x1: number; y1: number;
    nominalAngleDeg: number;
  }>;
  substrate: {                        // Material e perfil de papelão/cartão
    id: string;
    name: string;
    thickness: number;
    outerColor: string;
    innerColor: string;
  };
  artwork?: {                         // Arte sincronizada (quando existente)
    textureDataUri?: string;
    updatedAt?: string;
    scale?: number;
    position?: { x: number; y: number };
  };
  units: 'mm';                        // Unidade métrica obrigatória
  scale: 1.0;                         // Escala 1:1 rigorosa
  timestamp: string;
}
```

---

## 3. Protocolo e Endpoints de Comunicação

O serviço de bridge opera localmente em `http://127.0.0.1:48123` e `ws://127.0.0.1:48123`:

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/status` | Retorna status da Bridge, se o Illustrator está em execução e arte ativa |
| `POST` | `/api/open` | Recebe o `IllustratorProjectPayload`, compila o script ExtendScript e aciona o Illustrator via COM |
| `POST` | `/api/artwork` | Recebe a arte exportada do Illustrator (PNG 300 DPI Base64) e notifica clientes via WebSocket |
| `GET` | `/api/latest-artwork` | Retorna a última arte sincronizada e metadados associados |
| `WS` | `/` | WebSocket para push de eventos em tempo real (`ARTWORK_UPDATED`, `STATUS_CHANGED`) |

---

## 4. Organização Semântica de Camadas no Illustrator

Ao abrir o projeto no Adobe Illustrator, o script gera o documento em CMYK na escala 1:1 exata e organiza os elementos nas seguintes camadas padronizadas (Seção 12):

* **`ARTWORK`**: Camada principal no topo, desprotegida e ativa para desenho, importação de imagens e criação de arte gráfica pelo designer.
* **`CUT`**: Linhas e arcos de corte sólido com Spot Color "Corte" (Vermelho / Magenta 100%). Bloqueada para proteção contra edição acidental.
* **`CREASE`**: Linhas e arcos de vinco com Spot Color "Vinco" (Verde-água / Cyan 100% Yellow 30%) com traço tracejado. Bloqueada.
* **`PERF`**: Linhas de picote com Spot Color "Picote" (Laranja / Magenta 50% Yellow 100%) com micro-tracejado. Bloqueada.
* **`GUIDES_INFO`**: Guias técnicas contendo cotas dimensionais, sangrias e contornos pontilhados de cada painel estrutural identificados por nota (`PLMPACK_PANEL:P001:Fundo`). Bloqueada.

---

## 5. Fluxos de Operação (Botões Principais)

### Fluxo 1: [ ABRIR NO ILLUSTRATOR ]
1. Usuário clica no botão **Abrir no Illustrator** na barra superior do PLMPackLib Web.
2. O PLMPackLib extrai a geometria canônica (`dieline`) e gera o pacote padronizado `createProjectExchangePackage()`.
3. O payload é enviado via HTTP POST para `http://127.0.0.1:48123/api/open`.
4. A Bridge gera o script ExtendScript com o payload embutido e aciona o Illustrator via automação COM (`powershell -ExecutionPolicy Bypass`).
5. O Illustrator abre um novo documento ou atualiza a prancheta do documento existente do projeto em tempo real.
6. A interface do PLMPackLib exibe o status **Recebido** e depois **Conectado**.

### Fluxo 2: [ ENVIAR ARTE PARA PLMPACKLIB ]
1. O designer edita sua arte na camada `ARTWORK` no Illustrator.
2. Na extensão CEP do Illustrator (ou via macro de exportação), o script oculta temporariamente as camadas técnicas e exporta a prancheta em PNG 24-bit a 300 DPI com transparência.
3. A arte é enviada via POST para `http://127.0.0.1:48123/api/artwork` com `projectId`, `projectRevision` e `illustratorSessionId`.
4. A Bridge transmite o evento `ARTWORK_UPDATED` via WebSocket para o navegador.
5. O PLMPackLib Web recebe o Base64, valida a revisão e mapeia a textura instantaneamente sobre os painéis no Three.js com confetes de confirmação visual.
6. O botão exibe **Arte Sincronizada ✓**.

---

## 6. Versionamento e Resolução de Conflitos

Para impedir que artes antigas sejam aplicadas silenciosamente sobre projetos cujas medidas foram alteradas:
* Cada payload carrega `projectRevision` (iniciando em 1).
* Se o usuário altera dimensões (ex: L de 300 para 450 mm), `projectRevision` sobe para 2.
* Se uma arte devolvida pelo Illustrator reportar uma revisão anterior (`incomingRevision < currentRevision`), a Bridge dispara o erro:
  ```text
  PROJECT_REVISION_CONFLICT
  ```
* O PLMPackLib exibe o status **Conflito de versão** e alerta o operador sobre a incompatibilidade dimensional.

---

## 7. Segurança

* **Endereçamento Local Estrito**: A Bridge Node.js vincula-se exclusivamente a `127.0.0.1` (localhost), não escutando interfaces externas de rede.
* **Validação de Payload**: Todas as requisições passam por validação de tamanho (máximo 50 MB) e verificação estrita de schema.
* **Isolamento de Processos**: Nenhuma instrução de shell arbitrária é aceita pela API; a execução restringe-se aos scripts de modelo gerados internamente.

---

## 8. Guia de Instalação do Plugin / Bridge

1. **Iniciar a Bridge Local**:
   Execute o inicializador na raiz do projeto:
   ```cmd
   Iniciar_Bridge.bat
   ```
   Ou via terminal:
   ```bash
   node bridge/server.cjs
   ```
   A mensagem `[PLMPackLib Bridge] Online na porta 48123` será exibida.

2. **Instalação do Painel CEP no Adobe Illustrator (Opcional para painel flutuante)**:
   * Copie a pasta `extensions/com.primacor.plmpacklib` para o diretório de extensões CEP do Adobe:
     * Windows: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\`
   * No Registro do Windows (`regedit`), ative o modo de depuração para carregar extensões não assinadas:
     * `HKEY_CURRENT_USER\Software\Adobe\CSXS.11\PlayerDebugMode = "1"`
     * `HKEY_CURRENT_USER\Software\Adobe\CSXS.12\PlayerDebugMode = "1"`
   * Reinicie o Adobe Illustrator e acesse: **Janela → Extensões → PRIMACOR EMBALAGENS**.

3. **Modo 1-Clique Direto (Sem extensão CEP)**:
   * Com a Bridge rodando, não é obrigatório ter o painel CEP instalado: o botão **Abrir no Illustrator** na Web abrirá o documento no Illustrator automaticamente via COM Automation.
