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
