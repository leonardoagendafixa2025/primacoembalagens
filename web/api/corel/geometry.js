// Endpoint Serverless Vercel: POST /api/corel/geometry
// Calcula a geometria paramétrica métrica 1:1 e retorna as primitivas para o CorelDRAW

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const modelCode = (body.modelCode || 'FEFCO_0201').toUpperCase().replace('-', '_');
    const L = Math.max(10, parseFloat(body.L) || 300.0);
    const B = Math.max(10, parseFloat(body.B) || 200.0);
    const H = Math.max(10, parseFloat(body.H) || 150.0);
    const thickness = parseFloat(body.thickness) || 3.0;

    const lines = [];
    const arcs = [];
    let totalWidth = 0;
    let totalHeight = 0;

    if (modelCode.includes('0201')) {
      // FEFCO 0201: Caixa com abas normais
      const flapH = (B / 2.0);
      const glueTab = 30.0;
      totalWidth = glueTab + L + B + L + B;
      totalHeight = H + (2 * flapH);

      // Contorno de Corte Externo (Vermelho #E60000)
      // Aba de cola + Painéis
      lines.push({ x1: 0, y1: flapH, x2: 0, y2: flapH + H, type: 'cut', color: '#E60000' });
      lines.push({ x1: 0, y1: flapH + H, x2: glueTab, y2: flapH + H, type: 'cut', color: '#E60000' });
      lines.push({ x1: 0, y1: flapH, x2: glueTab, y2: flapH, type: 'cut', color: '#E60000' });
      
      // Topo e Base (Cortes de separação das abas)
      lines.push({ x1: glueTab, y1: 0, x2: totalWidth, y2: 0, type: 'cut', color: '#E60000' });
      lines.push({ x1: glueTab, y1: totalHeight, x2: totalWidth, y2: totalHeight, type: 'cut', color: '#E60000' });
      lines.push({ x1: totalWidth, y1: 0, x2: totalWidth, y2: totalHeight, type: 'cut', color: '#E60000' });

      // Vincos Horizontais (Superior e Inferior - Azul #0066FF)
      lines.push({ x1: glueTab, y1: flapH, x2: totalWidth, y2: flapH, type: 'crease', color: '#0066FF' });
      lines.push({ x1: glueTab, y1: flapH + H, x2: totalWidth, y2: flapH + H, type: 'crease', color: '#0066FF' });

      // Vincos Verticais dos Painéis (Azul #0066FF)
      let currX = glueTab;
      const panels = [L, B, L, B];
      for (let i = 0; i < panels.length; i++) {
        lines.push({ x1: currX, y1: flapH, x2: currX, y2: flapH + H, type: 'crease', color: '#0066FF' });
        // Cortes de ranhura entre as abas
        if (i > 0) {
          lines.push({ x1: currX, y1: 0, x2: currX, y2: flapH, type: 'cut', color: '#E60000' });
          lines.push({ x1: currX, y1: flapH + H, x2: currX, y2: totalHeight, type: 'cut', color: '#E60000' });
        }
        currX += panels[i];
      }
    } else {
      // FEFCO 0429 / Genérico
      totalWidth = L + 2 * H + 60;
      totalHeight = B + 2 * H + 40;

      // Base central (Vincos)
      const x0 = H + 30;
      const y0 = H + 20;
      lines.push({ x1: x0, y1: y0, x2: x0 + L, y2: y0, type: 'crease', color: '#0066FF' });
      lines.push({ x1: x0 + L, y1: y0, x2: x0 + L, y2: y0 + B, type: 'crease', color: '#0066FF' });
      lines.push({ x1: x0 + L, y1: y0 + B, x2: x0, y2: y0 + B, type: 'crease', color: '#0066FF' });
      lines.push({ x1: x0, y1: y0 + B, x2: x0, y2: y0, type: 'crease', color: '#0066FF' });

      // Contorno externo (Corte)
      lines.push({ x1: 0, y1: 0, x2: totalWidth, y2: 0, type: 'cut', color: '#E60000' });
      lines.push({ x1: totalWidth, y1: 0, x2: totalWidth, y2: totalHeight, type: 'cut', color: '#E60000' });
      lines.push({ x1: totalWidth, y1: totalHeight, x2: 0, y2: totalHeight, type: 'cut', color: '#E60000' });
      lines.push({ x1: 0, y1: totalHeight, x2: 0, y2: 0, type: 'cut', color: '#E60000' });
    }

    return res.status(200).json({
      success: true,
      provider: 'PRIMACOR EMBALAGENS',
      modelCode,
      parameters: { L, B, H, thickness },
      unit: 'mm',
      bounds: {
        width: Math.round(totalWidth * 100) / 100,
        height: Math.round(totalHeight * 100) / 100,
      },
      layers: {
        dieline: 'FACA',
        artwork: 'PLMPACKLIB_ARTE',
      },
      primitives: {
        lines,
        arcs,
      },
      totalLines: lines.length,
      totalArcs: arcs.length,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Erro no cálculo de geometria: ' + err.message,
    });
  }
}
