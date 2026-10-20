import { aAccion, ErrorIa, ESQUEMA, instrucciones, type Interprete } from "./interpretar";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Gemini por su API REST (plan gratuito). Solo se envía el mensaje, los nombres de comercios y productos: nada de contactos. */
export function crearGemini(o: { apiKey: string; model: string; fetchImpl?: typeof fetch }): Interprete {
  const f = o.fetchImpl ?? fetch;
  return {
    nombre: `gemini:${o.model}`,
    async interpretar(texto, ctx) {
      let res: Response;
      try {
        res = await f(`${BASE}/${o.model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instrucciones(ctx) }] },
            contents: [{ role: "user", parts: [{ text: texto.slice(0, 2000) }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA, temperature: 0.1 },
          }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new ErrorIa("No he podido contactar con la IA. Usa el comando directamente (/ayuda) o inténtalo en un momento.");
      }
      if (res.status === 429) throw new ErrorIa("La IA ha llegado a su límite gratuito por hoy. Usa los comandos (/ayuda).");
      if (!res.ok) throw new ErrorIa(`La IA no ha respondido bien (${res.status}). Usa el comando directamente (/ayuda).`);
      const r = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const out = r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      try {
        return aAccion(JSON.parse(out));
      } catch {
        throw new ErrorIa("La IA ha devuelto algo raro. Prueba otra vez o usa el comando (/ayuda).");
      }
    },
  };
}
