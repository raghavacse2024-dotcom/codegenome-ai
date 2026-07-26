# CodeGenome AI

CodeGenome AI turns a public GitHub repository into an evidence-backed technical-debt report, business-cost estimate, and downloadable refactoring scaffold. It was built for Theme 1: Agentic Coding.

## What it does

Five sequential agents make their handoffs visible in the dashboard:

1. **Architecture** identifies framework signals, layers, and boundary violations.
2. **Technical Debt** ranks static-analysis hotspots.
3. **Risk & Cost** converts debt into priority and annual maintenance drag.
4. **Refactor Planner** writes an additive module and test scaffold.
5. **Review** validates evidence, safety, and test coverage.

The app only accepts public `https://github.com/owner/repository` URLs. It never writes to the analyzed repository.

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. The Node API runs at `http://localhost:3001`.

`GITHUB_TOKEN` is optional but increases public GitHub API rate limits. `OPENAI_API_KEY` and `OPENAI_MODEL` are both optional; when configured, the server asks OpenAI to improve each agent’s structured output. Without them, CodeGenome runs a clearly labelled deterministic demo-safe analysis, so demos remain usable without credentials.

## Render deployment

This repository includes a single-service [Render Blueprint](./render.yaml).

1. Push `main` to GitHub.
2. Open `https://dashboard.render.com/blueprint/new?repo=https://github.com/raghavacse2024-dotcom/codegenome-ai`.
3. Set the optional secrets in Render: `GITHUB_TOKEN`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.
4. Apply the Blueprint. Render builds Vite, runs the Node service, and checks `/api/health`.

## Three-minute demo

- **0:00–0:15:** State the problem: teams lose time understanding unfamiliar, debt-heavy codebases.
- **0:15–0:45:** Paste a public GitHub URL and show the five agents planning, handing off evidence, and self-reviewing.
- **0:45–1:30:** Explain the architecture map, ranked debt hotspots, and business-cost estimate.
- **1:30–2:30:** Open the generated module/test scaffolds, copy or download them, and point out that the planner writes code rather than only suggesting it.
- **2:30–3:00:** Show the review verdict and explain the agentic loop: understand → plan → write → validate.

## Verification

```bash
npm test
npm run build
```

The test suite covers GitHub URL validation and ordered five-agent orchestration. The UI covers API failures, GitHub rate-limit guidance, a persistent local history, and an offline-safe fallback.
