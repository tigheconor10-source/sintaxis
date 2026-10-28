// Función serverless de Vercel: proxy hacia ChatGPT (OpenAI) y Gemini, con respaldo entre ambos.
// Las claves nunca llegan al navegador. Variables en Vercel: OPENAI_API_KEY y/o GEMINI_API_KEY.
export const config = { maxDuration: 60 };

const RETRY = [404, 408, 409, 429, 500, 502, 503, 504];
const clean = (t) => String(t || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

async function geminiModels(key) {
  const fixed = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'].filter(Boolean);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', { headers: { 'x-goog-api-key': key } });
    const d = await r.json();
    const live = (d.models || [])
      .filter((m) => /flash/i.test(m.name) && !/(image|tts|live|audio|embed|thinking|preview-0|exp)/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''))
      .sort()
      .reverse();
    return [...new Set([...fixed.slice(0, 1), ...live.slice(0, 4), ...fixed.slice(1)])];
  } catch (e) {
    return fixed;
  }
}

async function callGemini({ key, prompt, img, search, plain, deadline }) {
  const txt = search || plain;
  let last = 'Gemini sin respuesta';
  const parts = [{ text: prompt }];
  if (img && img.data) parts.push({ inlineData: { mimeType: String(img.mime || 'image/jpeg'), data: String(img.data) } });
  for (const model of await geminiModels(key)) {
    if (Date.now() > deadline) break;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(plain
          ? { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.3 } }
          : search
          ? { contents: [{ role: 'user', parts }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.3 } }
          : { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: img ? 0.1 : 0.7 } })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        last = `Gemini (${model}) ${r.status}: ${(data.error && data.error.message) || 'error'}`;
        continue;
      }
      const c = data?.candidates?.[0];
      if (txt) {
        const texto = (c?.content?.parts || []).map((x) => x.text || '').join('').trim();
        const seen = new Set();
        const fuentes = (c?.groundingMetadata?.groundingChunks || []).map((g) => g.web).filter((w) => w && w.uri && !seen.has(w.uri) && seen.add(w.uri)).slice(0, 5).map((w) => ({ title: w.title || w.uri, uri: w.uri }));
        if (!texto) { last = `Gemini (${model}): respuesta vacía`; continue; }
        return { ok: true, body: { texto, fuentes } };
      }
      return { ok: true, body: JSON.parse(clean(c?.content?.parts?.[0]?.text)) };
    } catch (e) {
      last = `Gemini (${model}): ${e.message}`;
    }
  }
  return { ok: false, error: last };
}

async function callOpenAI({ key, prompt, img, search, plain, deadline }) {
  const txt = search || plain;
  let last = 'ChatGPT sin respuesta';
  const content = [{ type: 'text', text: prompt }];
  if (img && img.data) content.push({ type: 'image_url', image_url: { url: `data:${img.mime || 'image/jpeg'};base64,${img.data}` } });
  const models = plain
    ? [process.env.OPENAI_MODEL, 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1', 'gpt-5-mini']
    : search
    ? ['gpt-4o-search-preview', 'gpt-4o-mini-search-preview', process.env.OPENAI_MODEL, 'gpt-4.1-mini', 'gpt-4o-mini']
    : [process.env.OPENAI_MODEL, 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1'];
  for (const model of [...new Set(models.filter(Boolean))]) {
    if (Date.now() > deadline) break;
    const isSearch = !plain && /search/.test(model);
    try {
      const body = { model, messages: [{ role: 'user', content }] };
      if (isSearch) body.web_search_options = {};
      else if (!txt) { body.response_format = { type: 'json_object' }; body.temperature = img ? 0.1 : 0.7; }
      else body.temperature = 0.3;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        last = `ChatGPT (${model}) ${r.status}: ${(data.error && data.error.message) || 'error'}`;
        if (r.status === 401) break;
        continue;
      }
      const msg = data?.choices?.[0]?.message;
      const text = msg?.content || '';
      if (txt) {
        if (!text.trim()) { last = `ChatGPT (${model}): respuesta vacía`; continue; }
        const seen = new Set();
        const fuentes = plain ? [] : (msg.annotations || []).map((a) => a.url_citation).filter((w) => w && w.url && !seen.has(w.url) && seen.add(w.url)).slice(0, 5).map((w) => ({ title: w.title || w.url, uri: w.url }));
        return { ok: true, body: { texto: text.trim(), fuentes } };
      }
      return { ok: true, body: JSON.parse(clean(text)) };
    } catch (e) {
      last = `ChatGPT (${model}): ${e.message}`;
    }
  }
  return { ok: false, error: last };
}

export default async function handler(req, res) {
  const gKey = process.env.GEMINI_API_KEY;
  const oKey = process.env.OPENAI_API_KEY;
  if (req.method === 'GET') {
    // Diagnóstico: abre /api/ai en el navegador para ver qué IA responde.
    const dl = () => Date.now() + 15000;
    const t = { prompt: 'Responde solo con JSON: {"ok":"si"}', deadline: 0 };
    const g = gKey ? await callGemini({ ...t, key: gKey, deadline: dl() }) : { ok: false, error: 'sin GEMINI_API_KEY' };
    const o = oKey ? await callOpenAI({ ...t, key: oKey, deadline: dl() }) : { ok: false, error: 'sin OPENAI_API_KEY' };
    return res.status(200).json({ chatgpt: o.ok ? 'OK' : o.error, gemini: g.ok ? 'OK' : g.error });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  if (!gKey && !oKey) return res.status(500).json({ error: 'Falta OPENAI_API_KEY o GEMINI_API_KEY en Vercel (y hay que redesplegar tras añadirla).' });
  const prompt = String((req.body && req.body.prompt) || '').slice(0, 24000);
  if (!prompt) return res.status(400).json({ error: 'prompt vacío' });
  const img = req.body && req.body.image;
  const search = !!(req.body && req.body.search);
  const mk = (plain, ms) => {
    const gem = gKey && (() => callGemini({ key: gKey, prompt, img, search, plain, deadline: Date.now() + ms }));
    const gpt = oKey && (() => callOpenAI({ key: oKey, prompt, img, search, plain, deadline: Date.now() + ms }));
    // Gemini primero y ChatGPT de respaldo. Cambia con AI_PRIMARY=gemini|openai.
    const pref = (process.env.AI_PRIMARY || 'gemini').toLowerCase();
    return (pref === 'gemini' ? [gem, gpt] : [gpt, gem]).filter(Boolean);
  };
  const errors = [];
  const pass = async (plain, ms) => {
    for (const run of mk(plain, ms)) {
      const out = await run();
      if (out.ok) return out.body;
      errors.push(out.error);
    }
    return null;
  };
  let body = await pass(false, search ? 12000 : 20000);
  // Si la búsqueda falla en ambas, se responde igualmente sin búsqueda (nunca error).
  if (!body && search) body = await pass(true, 18000);
  if (body) return res.status(200).json(body);
  return res.status(503).json({ error: errors.join(' | ') });
}
