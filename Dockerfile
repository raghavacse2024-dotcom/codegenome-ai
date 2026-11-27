FROM node:22-bookworm-slim

# Install Python 3 runtime for isolated sandbox syntax/unittest validation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-minimal \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY firebase-applet-config.json ./firebase-applet-config.json

# Create unprivileged runtime user
RUN addgroup --system codegenome && adduser --system --ingroup codegenome codegenome \
  && chown -R codegenome:codegenome /app

USER codegenome

ENV NODE_ENV=production
ENV PORT=3000
ENV SANDBOX_MODE=auto

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
