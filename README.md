# OgAI — Multi-engine Voice Studio

OgAI is a single-page AI studio deployed on Vercel. TTS API credentials are stored server-side and are never sent to the browser.

## Voice engines

- **Google Gemini** — existing Gemini Interactions TTS endpoint; default model `gemini-3.8-flash-tts`.
- **OpenAI GPT TTS** — `gpt-4o-mini-tts` Speech API with built-in voices and optional speaking instructions.
- **ElevenLabs** — Eleven v4 / v3 through the Text-to-Dialogue API, with the account's voices loaded from the ElevenLabs Voices API. Uzbek is selected as the requested language.

The ElevenLabs voice selector reads the account's available voices from `GET /api/elevenlabs-voices`. The API key stays on the Vercel server.

## API routes

- `POST /api/chat` — Gemini chat proxy.
- `POST /api/tts` — selects the Gemini, OpenAI, or ElevenLabs TTS provider.
- `GET /api/elevenlabs-voices` — returns the voice list from the configured ElevenLabs account.
- `POST /api/mcp` — stateless Streamable HTTP MCP endpoint.
- `GET /api/mcp-status` — MCP server readiness check.

## Vercel environment variables

Set the keys in **Vercel → Project → Settings → Environment Variables**:

- `GEMINI_API_KEY` — Google AI Studio key.
- `GEMINI_TTS_MODEL` — optional; defaults to `gemini-3.8-flash-tts`.
- `OPENAI_API_KEY` — OpenAI API key. This is billed separately from ChatGPT Go.
- `ELEVENLABS_API_KEY` — ElevenLabs API key.
- `MCP_SHARED_SECRET` — long random bearer secret for the MCP endpoint.

Never commit real API keys. `.env.example` contains placeholders only.

## Important OpenAI Speech API lifecycle note

The current `gpt-4o-mini-tts` Speech API is deprecated and is scheduled to shut down on **January 6, 2027**. The OpenAI Speech API guide recommends migrating to the Realtime API model family for new conversational voice applications. The current website integration is a straightforward TTS file-generation path and will need a migration before that shutdown date.

OpenAI's built-in voices are optimized for English. For Uzbek speech, try the ElevenLabs Eleven v4 option first; quality still depends on the chosen voice.

## Deploy

Connect this repository to Vercel and deploy `main`. After adding or changing environment variables, redeploy.

## Local development

```bash
npm install
npx vercel dev
```

Create `.env.local` with the same environment variables. Do not commit it.

## Security

The TTS and voice-list routes keep third-party API keys on the server and reject cross-origin browser requests. This is not a complete rate limiter; add per-IP/user rate limiting and monitor provider usage before making the site broadly public.

## Current MCP scope

The MCP server still exposes its existing Gemini TTS tools. The three-engine selector is currently part of the OgAI website UI.
