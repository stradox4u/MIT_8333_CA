# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS development
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:8080/@vite/client").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]
