import type { VercelRequest, VercelResponse } from "@vercel/node";

const VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Zephyr", "Leda", "Orus"] as const;

type AudioBlock = { type?: string; data?: string; mime_type?: string; mimeType?: string };
type GeminiInteraction = {
  output_audio?: AudioBlock;
  steps?: Array<{ type?: string; content?: AudioBlock[] }>;
  status?: string;
  error?: { message?: string };
};

function send(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

function sameOrigin(req: VercelRequest) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// The SDK exposes interaction.output_audio, but the raw REST response places
// audio in steps[].content[] with type === "audio".
function extractAudio(payload: GeminiInteraction): { data: string; mimeType: string } | null {
  const convenienceAudio = payload.output_audio;
  if (typeof convenienceAudio?.data === "string" && convenienceAudio.data.length > 0) {
    return {
      data: convenienceAudio.data,
      mimeType: convenienceAudio.mime_type || convenienceAudio.mimeType || "audio/wav"
    };
  }

  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex--) {
    const step = steps[stepIndex];
    if (step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (let contentIndex = step.content.length - 1; contentIndex >= 0; contentIndex--) {
      const block = step.content[contentIndex];
      if (block?.type === "audio" && typeof block.data === "string" && block.data.length > 0) {
        return {
          data: block.data,
          mimeType: block.mime_type || block.mimeType || "audio/wav"
        };
      }
    }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }
  if (!sameOrigin(req)) return send(res, 403, { error: "Cross-origin request rejected" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return send(res, 503, { error: "Serverda GEMINI_API_KEY sozlanmagan." });

  let body: any;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return send(res, 400, { error: "JSON so'rovi noto'g'ri." });
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voice = VOICES.includes(body?.voice) ? body.voice : "Kore";
  const style = typeof body?.style === "string" ? body.style.trim().slice(0, 300) : "";
  if (!text || text.length > 5000) {
    return send(res, 400, { error: "Matn 1–5000 belgi bo'lishi kerak." });
  }

  const model = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
  const textPart: Record<string, unknown> = { type: "text", text };
  if (style) textPart.annotations = [{ type: "speech_metadata", style }];

  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model,
        input: [{ type: "user_input", content: [textPart] }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] }
      }),
      signal: AbortSignal.timeout(55_000)
    });

    const payload = await upstream.json() as GeminiInteraction;
    if (!upstream.ok) {
      return send(res, 502, { error: payload?.error?.message || `Gemini TTS HTTP ${upstream.status}` });
    }

    const audio = extractAudio(payload);
    if (!audio) {
      const outputTypes = (payload.steps || [])
        .filter(step => step.type === "model_output")
        .flatMap(step => step.content || [])
        .map(block => block.type || "unknown");
      console.error("Gemini TTS response contained no audio block:", {
        status: payload.status,
        outputTypes,
        model
      });
      return send(res, 502, {
        error: "Gemini audio blokini qaytarmadi.",
        detail: `status=${payload.status || "unknown"}; output types=${outputTypes.join(",") || "none"}`
      });
    }

    return send(res, 200, { audio: audio.data, mimeType: audio.mimeType, model, voice });
  } catch (error) {
    return send(res, 502, {
      error: error instanceof Error ? error.message : "TTS server xatosi"
    });
  }
}
