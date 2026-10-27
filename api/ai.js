// Función serverless de Vercel: proxy hacia Gemini. La clave nunca llega al navegador.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Falta la variable GEMINI_API_KEY en Vercel (y hay que redesplegar tras añadirla).' });
  const prompt = String((req.body && req.body.prompt) || '').slice(0, 6000);
  if (!prompt) return res.status(400).json({ error: 'prompt vacío' });
  const models = [process.env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'].filter(Boolean);
  let last = 'sin respuesta';
  for (const model of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        last = `Gemini (${model}) ${r.status}: ${(data.error && data.error.message) || 'error'}`;
        if (r.status === 404 || r.status === 400 && /model/i.test(last)) continue;
        return res.status(r.status === 429 ? 429 : 502).json({ error: last });
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
      return res.status(200).json(JSON.parse(clean));
    } catch (e) {
      last = `Fallo con ${model}: ${e.message}`;
    }
  }
  return res.status(502).json({ error: last });
}
