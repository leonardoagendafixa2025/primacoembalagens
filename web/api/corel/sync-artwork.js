// Endpoint Serverless Vercel: POST /api/corel/sync-artwork
// Recebe o PNG em Base64 exportado pelo CorelDRAW e cria uma sessão 3D

// Cache efêmero em memória para instâncias ativas
const globalArtworkSessions = global.artworkSessions || (global.artworkSessions = new Map());

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const sessionId = req.query.session || req.query.id;
    if (!sessionId || !globalArtworkSessions.has(sessionId)) {
      return res.status(404).json({ success: false, error: 'Sessão 3D não encontrada ou expirada.' });
    }
    const session = globalArtworkSessions.get(sessionId);
    return res.status(200).json({ success: true, session });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    let artworkBase64 = body.artworkBase64 || body.image || body.dataUri || '';
    const projectId = body.projectId || 'projeto_corel_' + Date.now();
    const modelCode = body.modelCode || 'FEFCO_0201';

    if (!artworkBase64) {
      return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada no payload.' });
    }

    if (!artworkBase64.startsWith('data:image')) {
      artworkBase64 = 'data:image/png;base64,' + artworkBase64;
    }

    // Gerar UUID de sessão anônima
    const sessionId = 'session_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
    
    const sessionData = {
      sessionId,
      projectId,
      modelCode,
      textureDataUri: artworkBase64,
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 horas
    };

    globalArtworkSessions.set(sessionId, sessionData);

    // Limpar sessões antigas
    if (globalArtworkSessions.size > 200) {
      const now = Date.now();
      for (const [key, val] of globalArtworkSessions.entries()) {
        if (val.expiresAt < now) globalArtworkSessions.delete(key);
      }
    }

    const view3dUrl = `https://primacorembalagens.vercel.app/?session=${sessionId}&model=${modelCode}`;

    return res.status(200).json({
      success: true,
      provider: 'PRIMACOR EMBALAGENS',
      message: 'Arte sincronizada com sucesso!',
      sessionId,
      view3dUrl,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Erro no processamento da arte: ' + err.message,
    });
  }
}
