# App Sintaxis

Práctica de análisis sintáctico: pizarra con trazos enderezados, funciones por color, validación, ayudas y solucionarios (PDF/DOCX/TXT).

## Despliegue
1. Sube esta carpeta a un repositorio de GitHub.
2. En Vercel: Add New > Project > importa el repositorio (sin framework, sin build).
3. En Settings > Environment Variables añade `GEMINI_API_KEY` (clave de Google AI Studio). Opcional: `GEMINI_MODEL`.
4. Despliega. Sin la clave, todo funciona salvo generar frases y validar con IA.

## Estructura
- `index.html`: la app completa (HTML, CSS y JS).
- `api/ai.js`: proxy a Gemini.

## Claves de IA (Vercel > Settings > Environment Variables)
- `OPENAI_API_KEY` (ChatGPT) y/o `GEMINI_API_KEY` (Gemini). Si una falla, se usa la otra.
- Opcionales: `OPENAI_MODEL`, `GEMINI_MODEL`, `AI_PRIMARY` (`openai` o `gemini`).
- Tras añadirlas: Redeploy.
