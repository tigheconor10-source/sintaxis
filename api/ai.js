// Función serverless de Vercel: proxy hacia Gemini. La clave nunca llega al navegador.
export const config = { maxDuration: 30 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY = [404, 429, 500, 502, 503, 504];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Falta la variable GEMINI_API_KEY en Vercel (y hay que redesplegar tras añadirla).' });
  const prompt = String((req.body && req.body.prompt) || '').slice(0, 6000);
  if (!prompt) return res.status(400).json({ error: 'prompt vacío' });
  const img = req.body && req.body.image;
  const parts = [{ text: prompt }];
  if (img && img.data) parts.push({ inlineData: { mimeType: String(img.mime || 'image/jpeg'), data: String(img.data) } });
  const models = [process.env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.0-flash'].filter(Boolean);
  const t0 = Date.now();
  let last = 'sin respuesta';
  for (let round = 0; round < 3; round++) {
    for (const model of models) {
      if (Date.now() - t0 > 24000) return res.status(503).json({ error: last });
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { responseMimeType: 'application/json', temperature: img ? 0.1 : 0.7 }
          })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = (data.error && data.error.message) || 'error';
          last = `Gemini (${model}) ${r.status}: ${msg}`;
          if (RETRY.includes(r.status) || (r.status === 400 && /model/i.test(msg))) continue;
          return res.status(502).json({ error: last });
        }
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
        return res.status(200).json(JSON.parse(clean));
      } catch (e) {
        last = `Fallo con ${model}: ${e.message}`;
      }
    }
    await sleep(1500 * (round + 1));
  }
  return res.status(503).json({ error: last });
}
