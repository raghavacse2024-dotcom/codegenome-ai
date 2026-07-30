# CodeGenome AI

CodeGenome AI turns a public GitHub repository into an evidence-backed technical-debt report, business-cost estimate, grounded repository Q&A, and downloadable refactoring scaffold.

## What Works

The production app runs as one Render web service. Vite builds the React dashboard, Express serves the static bundle, and the same Node process exposes:

- `GET /api/health`: service status, timestamp, and live/demo mode.
- `POST /api/analyze`: validates a public GitHub URL, samples repository files, runs Architecture -> Technical Debt -> Risk & Cost -> Refactor Planner -> Review, and returns an `analysisId`.
- `POST /api/download`: downloads a ZIP of generated scaffold files for a completed analysis.
- `POST /api/qa`: answers questions grounded in the completed analysis.

The analyzed repository is never modified.

## Local Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. The Node API runs at `http://localhost:3001`.

## Environment Variables

- `VITE_API_URL`: frontend API base URL. Use `http://localhost:3001` locally; leave unset on Render so same-origin `/api` works.
- `OPENAI_API_KEY`: optional server-side key for live OpenAI-enhanced agent reasoning.
- `OPENAI_MODEL`: optional model name, for example `gpt-4-turbo`.
- `GITHUB_TOKEN`: optional token for higher GitHub public API limits.
- `PORT`: Render sets this automatically. Local default is `3001`.

Without OpenAI credentials, the app runs honest demo mode. If GitHub access is unavailable, it uses deterministic representative demo data and labels the result clearly as demo-safe.

## Render Deployment

1. Push `main` to GitHub.
2. Open `https://dashboard.render.com/blueprint/new?repo=https://github.com/raghavacse2024-dotcom/codegenome-ai`.
3. Apply the included `render.yaml` Blueprint.
4. Add optional secrets in Render: `OPENAI_API_KEY` and `GITHUB_TOKEN`.
5. Confirm `/api/health` returns `status: "ok"`.

## Verification

```bash
npm test
npm run build
```

The test suite covers URL validation, repository sampling, GitHub rate-limit archive fallback, demo-safe fallback, and ordered five-agent orchestration.
