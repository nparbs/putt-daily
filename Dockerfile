FROM node:24-slim

WORKDIR /app

COPY package.json ./
COPY server/ ./server/
COPY client/ ./client/
COPY shared/ ./shared/

ENV NODE_ENV=production PORT=8795

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8795

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8795/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/server.js"]
