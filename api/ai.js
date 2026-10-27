// Función serverless de Vercel: proxy hacia Gemini. La clave nunca llega al navegador.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Falta GEMINI_API_KEY' });
  const prompt = String((req.body && req.body.prompt) || '').slice(0, 6000);
  if (!prompt) return res.status(400).json({ error: 'prompt vacío' });
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
      })
    });
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: 'Gemini ' + r.status });
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(502).json({ error: 'No se pudo obtener respuesta de la IA' });
  }
}
