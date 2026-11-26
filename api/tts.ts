import type { VercelRequest, VercelResponse } from "@vercel/node";

const GEMINI_VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Zephyr", "Leda", "Orus"] as const;
const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"] as const;
const ELEVEN_MODELS = ["eleven_v4", "eleven_v3"] as const;

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
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function extractGeminiAudio(payload: GeminiInteraction): { data: string; mimeType: string } | null {
  const direct = payload.output_audio;
  if (typeof direct?.data === "string" && direct.data.length) {
    return { data: direct.data, mimeType: direct.mime_type || direct.mimeType || "audio/wav" };
  }
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (let j = step.content.length - 1; j >= 0; j--) {
      const block = step.content[j];
      if (block?.type === "audio" && typeof block.data === "string" && block.data.length) {
        return { data: block.data, mimeType: block.mime_type || block.mimeType || "audio/wav" };
      }
    }
  }
  return null;
}
async function getProviderError(response: Response, fallback: string) {
  const raw = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || parsed?.detail?.message || parsed?.detail || fallback;
  } catch {
    return raw.slice(0, 800) || fallback;
  }
}
function encodeAudio(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64");
}
function extensionForMime(mimeType: string) {
  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("flac")) return "flac";
  return "audio";
}

async function generateGemini(text: string, voice: string, style: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini uchun Vercel'da GEMINI_API_KEY sozlanmagan.");
  const model = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
  const textPart: Record<string, unknown> = { type: "text", text };
  if (style) textPart.annotations = [{ type: "speech_metadata", style }];
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
  if (!upstream.ok) throw new Error(await getProviderError(upstream, `Gemini TTS HTTP ${upstream.status}`));
  const payload = await upstream.json() as GeminiInteraction;
  const audio = extractGeminiAudio(payload);
  if (!audio) throw new Error("Gemini audio blokini qaytarmadi.");
  return { audio: audio.data, mimeType: audio.mimeType, model, voice, provider: "gemini" };
}

async function generateOpenAI(text: string, voice: string, style: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI uchun Vercel'da OPENAI_API_KEY sozlanmagan.");
  if (!(OPENAI_VOICES as readonly string[]).includes(voice)) throw new Error("OpenAI ovozi noto‘g‘ri tanlangan.");
  const model = "gpt-4o-mini-tts";
  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      ...(style ? { instructions: style } : {}),
      response_format: "mp3"
    }),
    signal: AbortSignal.timeout(55_000)
  });
  if (!upstream.ok) throw new Error(await getProviderError(upstream, `OpenAI Speech API HTTP ${upstream.status}`));
  const mimeType = upstream.headers.get("content-type") || "audio/mpeg";
  return { audio: encodeAudio(await upstream.arrayBuffer()), mimeType, model, voice, provider: "openai" };
}

async function generateElevenLabs(text: string, voice: string, model: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ElevenLabs uchun Vercel'da ELEVENLABS_API_KEY sozlanmagan.");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(voice)) throw new Error("ElevenLabs Voice ID noto‘g‘ri.");
  if (!(ELEVEN_MODELS as readonly string[]).includes(model)) throw new Error("ElevenLabs modeli noto‘g‘ri.");
  const url = new URL("https://api.elevenlabs.io/v1/text-to-dialogue");
  url.searchParams.set("output_format", "mp3_44100_128");
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({
      model_id: model,
      language_code: "uz",
      inputs: [{ text, voice_id: voice }]
    }),
    signal: AbortSignal.timeout(55_000)
  });
  if (!upstream.ok) throw new Error(await getProviderError(upstream, `ElevenLabs TTS HTTP ${upstream.status}`));
  const mimeType = upstream.headers.get("content-type") || "audio/mpeg";
  return { audio: encodeAudio(await upstream.arrayBuffer()), mimeType, model, voice, provider: "elevenlabs" };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }
  if (!sameOrigin(req)) return send(res, 403, { error: "Cross-origin request rejected" });

  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return send(res, 400, { error: "JSON so'rovi noto'g'ri." }); }

  const provider = ["gemini", "openai", "elevenlabs"].includes(body?.provider) ? body.provider : "gemini";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voice = typeof body?.voice === "string" ? body.voice.trim() : "";
  const style = typeof body?.style === "string" ? body.style.trim().slice(0, 500) : "";
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  const maxChars = provider === "openai" ? 4096 : provider === "elevenlabs" ? 2000 : 5000;
  if (!text || text.length > maxChars) {
    return send(res, 400, { error: `Matn 1–${maxChars} belgi bo‘lishi kerak.` });
  }

  try {
    const result = provider === "openai"
      ? await generateOpenAI(text, voice || "marin", style)
      : provider === "elevenlabs"
        ? await generateElevenLabs(text, voice, model || "eleven_v4")
        : await generateGemini(text, (GEMINI_VOICES as readonly string[]).includes(voice) ? voice : "Kore", style);
    return send(res, 200, {
      ...result,
      fileExtension: extensionForMime(result.mimeType)
    });
  } catch (error) {
    return send(res, 502, { error: error instanceof Error ? error.message : "TTS server xatosi" });
  }
}
