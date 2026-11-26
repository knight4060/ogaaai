import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) {
        return res.status(403).json({ error: "Cross-origin request rejected" });
      }
    } catch {
      return res.status(403).json({ error: "Invalid origin" });
    }
  }

  const mcpReady = Boolean(process.env.MCP_SHARED_SECRET?.trim());
  const ttsReady = Boolean(process.env.GEMINI_API_KEY?.trim());
  const missing: string[] = [];
  if (!mcpReady) missing.push("MCP_SHARED_SECRET");
  if (!ttsReady) missing.push("GEMINI_API_KEY");

  return res.status(200).json({
    ready: mcpReady,
    ttsReady,
    missing,
    service: "OgAI MCP",
    endpoint: "/api/mcp"
  });
}
