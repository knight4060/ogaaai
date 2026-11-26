# OgAI — Vercel + Gemini + MCP

OgAI is deployed as a static single-page app with Vercel serverless API routes. Gemini API keys stay on the server.

## API routes

- `POST /api/chat` — proxies Gemini chat requests from the website.
- `POST /api/tts` — generates WAV speech through the Gemini Interactions API.
- `POST /api/mcp` — stateless Streamable HTTP MCP endpoint.

## MCP tools

- `ogai_get_voices` — lists the available TTS voice names.
- `ogai_generate_tts` — generates audio from supplied text and returns MCP audio content.

## Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables**:

- `GEMINI_API_KEY`: Google AI Studio API key.
- `MCP_SHARED_SECRET`: long random secret used as MCP Bearer token.
- `GEMINI_TTS_MODEL`: optional, defaults to `gemini-3.8-flash-tts`.

Never commit real secrets. `.env.example` contains placeholders only.

## Deploy

Connect this repository to Vercel and deploy the `main` branch. After setting environment variables, redeploy.

MCP URL: `https://YOUR-VERCEL-DOMAIN/api/mcp`

For ChatGPT custom MCP setup, use Streamable HTTP, Bearer authentication, and the `MCP_SHARED_SECRET` value.

## Local development

```bash
npm install
npx vercel dev
```

Create `.env.local` with the same three variables (do not commit it).

## Security note

The API routes reject cross-origin browser requests, but that is not a substitute for rate limiting. Before making the site broadly public, add per-IP/user rate limits and usage monitoring to `/api/chat` and `/api/tts`.

## Current scope

The MCP server provides OgAI TTS and voice listing. HyperFrames video generation/rendering is not implemented in this version.
