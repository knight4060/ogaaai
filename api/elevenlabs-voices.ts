import type { VercelRequest, VercelResponse } from "@vercel/node";

function send(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: "Method not allowed" });
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: "Cross-origin request rejected" });
    } catch {
      return send(res, 403, { error: "Invalid origin" });
    }
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return send(res, 503, { error: "ElevenLabs API key sozlanmagan. Vercel'da ELEVENLABS_API_KEY qo‘shing." });

  try {
    const upstream = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false", {
      method: "GET",
      headers: { "xi-api-key": apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(20_000)
    });
    if (!upstream.ok) {
      const raw = await upstream.text().catch(() => "");
      let message = raw.slice(0, 600) || `ElevenLabs HTTP ${upstream.status}`;
      try {
        const parsed = JSON.parse(raw);
        message = parsed?.detail?.message || parsed?.detail || parsed?.error || message;
      } catch {}
      return send(res, 502, { error: String(message) });
    }

    const payload = await upstream.json() as {
      voices?: Array<{ voice_id?: string; name?: string; category?: string; labels?: Record<string, string> }>;
      has_more?: boolean;
    };
    const voices = (payload.voices || [])
      .filter(v => typeof v.voice_id === "string" && typeof v.name === "string")
      .map(v => ({
        id: v.voice_id,
        name: v.name,
        category: v.category || "",
        language: v.labels?.language || v.labels?.accent || ""
      }));
    return send(res, 200, { voices, hasMore: Boolean(payload.has_more) });
  } catch (error) {
    return send(res, 502, { error: error instanceof Error ? error.message : "ElevenLabs ovozlarini olishda xatolik." });
  }
}
