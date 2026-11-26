import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Zephyr", "Leda", "Orus"] as const;
function jsonError(res: VercelResponse, status: number, message: string) { return res.status(status).json({ error: message }); }
function createOgAIServer() {
  const server = new McpServer({ name: "ogai", version: "1.0.0" });
  server.registerTool("ogai_get_voices", {
    title: "OgAI ovozlarini ko'rish",
    description: "OgAI Gemini TTS ovozlari ro'yxatini qaytaradi.",
    inputSchema: {}
  }, async () => ({
    content: [{ type: "text", text: JSON.stringify({ voices: VOICES, defaultVoice: "Kore", model: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts" }, null, 2) }]
  }));
  server.registerTool("ogai_generate_tts", {
    title: "OgAI orqali ovoz yaratish",
    description: "OgAI Gemini TTS yordamida berilgan matndan audio yaratadi. O'zbekcha matn qabul qilinadi.",
    inputSchema: {
      text: z.string().min(1).max(5000).describe("Ovozga aylantiriladigan matn, maksimal 5000 belgi."),
      voice: z.enum(VOICES).default("Kore"),
      style: z.string().max(300).optional()
    }
  }, async ({ text, voice, style }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { isError: true, content: [{ type: "text", text: "Server sozlanmagan: GEMINI_API_KEY mavjud emas." }] };
    try {
      const model = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
      const textPart: Record<string, unknown> = { type: "text", text };
      if (style?.trim()) textPart.annotations = [{ type: "speech_metadata", style: style.trim() }];
      const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ model, input: [{ type: "user_input", content: [textPart] }], response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] } }),
        signal: AbortSignal.timeout(50_000)
      });
      const payload = await upstream.json() as { output_audio?: { data?: string; mime_type?: string }; error?: { message?: string } };
      if (!upstream.ok) return { isError: true, content: [{ type: "text", text: `OgAI TTS xatosi: ${payload?.error?.message || upstream.status}` }] };
      const audioBase64 = payload?.output_audio?.data;
      if (!audioBase64) return { isError: true, content: [{ type: "text", text: "Google TTS javobida audio ma'lumoti topilmadi." }] };
      const mimeType = payload.output_audio?.mime_type || "audio/wav";
      return { content: [{ type: "text", text: `OgAI audio tayyor. Model: ${model}. Ovoz: ${voice}. Format: ${mimeType}.` }, { type: "audio", data: audioBase64, mimeType }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum server xatosi";
      return { isError: true, content: [{ type: "text", text: `OgAI TTS bajarilmadi: ${message}` }] };
    }
  });
  return server;
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return jsonError(res, 405, "MCP endpoint POST so'rovlarini qabul qiladi."); }
  const expectedSecret = process.env.MCP_SHARED_SECRET;
  if (!expectedSecret) return jsonError(res, 503, "MCP sozlanmagan: MCP_SHARED_SECRET mavjud emas.");
  const authorization = req.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!suppliedSecret || suppliedSecret !== expectedSecret) return jsonError(res, 401, "Unauthorized");
  const server = createOgAIServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => { void transport.close(); void server.close(); });
  } catch (error) {
    console.error("OgAI MCP request failed:", error);
    if (!res.headersSent) return jsonError(res, 500, "OgAI MCP ichki xatoligi.");
  }
}
