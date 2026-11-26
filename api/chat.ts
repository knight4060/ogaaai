import type { VercelRequest, VercelResponse } from "@vercel/node";

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-latest", "gemini-2.0-flash"];
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
  const contents = body?.contents;
  if (!Array.isArray(contents) || contents.length === 0) return send(res, 400, { error: "Chat contents talab qilinadi." });
  if (JSON.stringify(contents).length > 100_000) return send(res, 413, { error: "So'rov juda katta." });
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.slice(0, 6000) : "";
  let lastError = "Gemini so'rovi bajarilmadi.";
  for (const model of MODELS) {
    try {
      const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents, ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}) }),
        signal: AbortSignal.timeout(55_000)
      });
      const data = await upstream.json();
      if (upstream.ok) return send(res, 200, { data, model });
      lastError = data?.error?.message || `Gemini HTTP ${upstream.status}`;
      if (![400, 404, 429].includes(upstream.status)) break;
    } catch (e) { lastError = e instanceof Error ? e.message : "Tarmoq xatosi"; }
  }
  return send(res, 502, { error: lastError });
}
