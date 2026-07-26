# Architecture

CodeGenome is a single Render web service. Vite compiles the React dashboard to `dist/`; Express serves that static output and exposes its API under `/api`.

```text
Browser → POST /api/analyze → GitHub public API → five sequential agents → JSON dashboard
                                  └→ OpenAI Responses API (optional enhancement)
```

The deterministic agent outputs are the baseline and are always available. When both `OPENAI_API_KEY` and `OPENAI_MODEL` are set, each agent asks OpenAI to improve its existing structured result. Invalid or unavailable model output is discarded, preserving the deterministic result.

The service fetches at most 75 supported source files, each no larger than 45 KB. The browser only supplies a canonical public GitHub repository URL; credentials remain server-side.
