// Endpoint Serverless Vercel: GET /api/corel/models
// Retorna a lista de modelos suportados para o complemento do CorelDRAW

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const models = [
    {
      code: 'FEFCO_0201',
      name: 'Caixa Padrão com Abas (FEFCO 0201)',
      category: 'FEFCO',
      defaultParams: { L: 300, B: 200, H: 150, thickness: 3.0 },
      description: 'Caixa americana padrão dobrável para papelão ondulado',
    },
    {
      code: 'FEFCO_0429',
      name: 'Bandeja com Travas Automáticas (FEFCO 0429)',
      category: 'FEFCO',
      defaultParams: { L: 300, B: 200, H: 80, thickness: 2.5 },
      description: 'Bandeja automontável com abas e travas angulares',
    },
    {
      code: 'ECMA_A20',
      name: 'Cartucho Fundo Automático (ECMA A20)',
      category: 'ECMA',
      defaultParams: { L: 120, B: 80, H: 180, thickness: 0.5 },
      description: 'Cartucho de papel cartão com fechamento automático',
    },
    {
      code: 'ECMA_A21',
      name: 'Cartucho com Abas Opostas (ECMA A21)',
      category: 'ECMA',
      defaultParams: { L: 100, B: 60, H: 140, thickness: 0.45 },
      description: 'Cartucho standard para embalagens farmacêuticas e cosméticas',
    },
  ];

  return res.status(200).json({
    success: true,
    provider: 'PRIMACOR EMBALAGENS',
    total: models.length,
    models,
  });
}
