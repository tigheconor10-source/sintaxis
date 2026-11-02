// Formulario de contacto: envía el mensaje a tu correo con Resend.
// Variables en Vercel: RESEND_API_KEY (obligatoria), CONTACT_TO y CONTACT_FROM (opcionales).
export const config = { maxDuration: 15 };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hits = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ error: 'Falta RESEND_API_KEY en Vercel.' });
  const b = req.body || {};
  if (b.web) return res.status(200).json({ ok: true }); // campo trampa para bots
  const name = String(b.name || '').trim().slice(0, 100);
  const email = String(b.email || '').trim().slice(0, 200);
  const message = String(b.message || '').trim().slice(0, 4000);
  if (!name || message.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Revisa el nombre, el email y el mensaje.' });
  }
  const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 600000);
  if (list.length >= 3) return res.status(429).json({ error: 'Demasiados mensajes. Prueba en unos minutos.' });
  hits.set(ip, [...list, now]);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || 'Sintaxlab <contacto@sintaxlab.es>',
        to: [process.env.CONTACT_TO || 'contacto.sintaxlab@gmail.com'],
        reply_to: email,
        subject: `Contacto Sintaxlab: ${name}`.slice(0, 120),
        html: `<p><b>${esc(name)}</b> &lt;${esc(email)}&gt;</p><p style="white-space:pre-wrap">${esc(message)}</p>`
      })
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      console.warn('Resend', r.status, d);
      return res.status(502).json({ error: 'No se pudo enviar ahora mismo. Escríbenos por email.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'No se pudo enviar ahora mismo. Escríbenos por email.' });
  }
}
