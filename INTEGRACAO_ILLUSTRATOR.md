# Integração Oficial PLMPackLib ↔ Adobe Illustrator 2025

Esta integração estabelece uma ponte bidirecional profissional entre o **PLMPackLib Web** (motor paramétrico CAD) e o **Adobe Illustrator 2025** (design gráfico de embalagens).

---

## 🎯 Filosofia de Projeto (Engenharia de Embalagem)

- **Faca Real como Única Fonte da Verdade:** Toda a geometria paramétrica (corte, vinco, sangria, cotas e painéis) é gerada pelo motor CAD do PLMPackLib e enviada com precisão milimétrica 1:1 ($1\text{ mm} = 72/25.4\text{ pt}$).
- **Organização Profissional de Camadas:**
  - `PLMPACKLIB_CORTE`: Linhas de corte (Spot Color `Corte` Pantone / CMYK 0/100/100/0, espessura 0.5 mm, bloqueada).
  - `PLMPACKLIB_VINCO`: Linhas de vinco pontilhadas (Spot Color `Vinco` CMYK 100/0/30/0, bloqueada).
  - `PLMPACKLIB_PAINEIS`: Guias técnicas com o nome de cada painel para referência.
  - `PLMPACKLIB_COTAS`: Dimensões e cotas técnicas de conferência.
  - `PLMPACKLIB_ARTE`: Camada destrancada e posicionada no topo onde o designer cria a arte.
- **Sincronização Não-Destrutiva:** Alterações de medidas ($L, B, H, Ep$) no PLMPackLib atualizam as camadas técnicas no Illustrator sem apagar ou mover a camada `PLMPACKLIB_ARTE`.
- **Mapeamento 3D em Tempo Real:** A arte desenhada no Illustrator é enviada diretamente para os painéis articulados do modelo 3D no Three.js (**Faca Real → Arte Real → 3D Real**).

---

## 🚀 Como Utilizar

### 1. Iniciar o Serviço de Ponte (Bridge)
O servidor local de ponte roda em segundo plano na porta `48123`:
```bash
node bridge/server.cjs
```
*(Já configurado para inicialização automática em ambiente de produção).*

### 2. No PLMPackLib Web
1. Selecione qualquer modelo (FEFCO ou ECMA) e ajuste as dimensões ($L, B, H, Ep$).
2. No cabeçalho superior, clique no botão laranja **[ Ai Illustrator ]**.
3. O projeto é aberto instantaneamente no Adobe Illustrator 2025 com a prancheta sob medida e todas as camadas configuradas.

### 3. No Adobe Illustrator 2025
1. Acesse o menu: **Janela (Window) → Extensões (Extensions) → PLMPackLib CAD Bridge**.
2. Desenhe rótulos, texturas, logos e grafismos na camada destrancada `PLMPACKLIB_ARTE`.
3. No painel da extensão, clique em **[ ENVIAR ARTE PARA PLMPACKLIB ]** (ou **[ ATUALIZAR 3D ]**).

### 4. Visualização 3D com Arte
- A aba **3D** do PLMPackLib Web recebe a arte em alta resolução instantaneamente via WebSocket e a mapeia sobre os painéis articulados da caixa.
- Dobre e desdobre a embalagem (0% a 100%) no visualizador 3D com a arte perfeitamente alinhada aos vincos e painéis!

---

## 📁 Estrutura de Arquivos

- `web/src/integrations/illustrator/`
  - `projectExchange.ts`: Tipagem e empacotamento do modelo para intercâmbio.
  - `jsxGenerator.ts`: Compilador ExtendScript que constrói prancheta, camadas e geometrias vetoriais 1:1.
  - `IllustratorBridgeClient.ts`: Cliente Web (HTTP REST + WebSocket) com fallback autônomo.
- `bridge/`
  - `server.cjs`: Servidor local Node.js (Porta 48123) que orquestra automação COM do Illustrator e troca de mensagens.
- `extensions/com.primacor.plmpacklib/`
  - Painel CEP oficial para Adobe Illustrator 2025 (`CSXS/manifest.xml`, UI HTML5/CSS e scripts ExtendScript).
  - Instalado em `%APPDATA%\Adobe\CEP\extensions\com.primacor.plmpacklib`.
