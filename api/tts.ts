import type { VercelRequest, VercelResponse } from "@vercel/node";
const VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Zephyr", "Leda", "Orus"] as const;
function send(res: VercelResponse, status: number, body: unknown) { return res.status(status).json(body); }
function sameOrigin(req: VercelRequest) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: "Method not allowed" }); }
  if (!sameOrigin(req)) return send(res, 403, { error: "Cross-origin request rejected" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return send(res, 503, { error: "Serverda GEMINI_API_KEY sozlanmagan." });
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voice = VOICES.includes(body?.voice) ? body.voice : "Kore";
  const style = typeof body?.style === "string" ? body.style.trim().slice(0, 300) : "";
  if (!text || text.length > 5000) return send(res, 400, { error: "Matn 1–5000 belgi bo'lishi kerak." });
  const model = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
  const textPart: Record<string, unknown> = { type: "text", text };
  if (style) textPart.annotations = [{ type: "speech_metadata", style }];
  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ model, input: [{ type: "user_input", content: [textPart] }], response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] } }),
      signal: AbortSignal.timeout(55_000)
    });
    const payload = await upstream.json();
    if (!upstream.ok) return send(res, 502, { error: payload?.error?.message || `Gemini TTS HTTP ${upstream.status}` });
    const audio = payload?.output_audio?.data;
    if (!audio) return send(res, 502, { error: "Gemini javobida audio topilmadi." });
    return send(res, 200, { audio, mimeType: payload.output_audio.mime_type || "audio/wav", model, voice });
  } catch (e) { return send(res, 502, { error: e instanceof Error ? e.message : "TTS server xatosi" }); }
}
