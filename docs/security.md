# Security and data boundaries

- The API only accepts public HTTPS URLs on `github.com` with one owner and repository segment.
- GitHub and OpenAI keys are read only by the server from the process environment; they are never bundled into the Vite client.
- Repository sampling is capped at 75 code files and 45 KB per file to control request size, latency, and model context.
- OpenAI enhancement is optional. A malformed or failed response falls back to deterministic output rather than exposing an internal error.
- CodeGenome generates download-only scaffolds; it does not request GitHub write scopes or modify the repository being analyzed.
