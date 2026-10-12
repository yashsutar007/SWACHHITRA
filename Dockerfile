FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Ensure the image has trusted CA roots for HTTPS and verified MySQL TLS.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the lockfiles first so dependency installation can be cached.
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev

# Keep the app's expected layout: server code at /app/server and pages at /app/client.
WORKDIR /app
COPY server ./server
COPY client ./client

# Do not run the web application as root.
RUN chown -R node:node /app
USER node

EXPOSE 5000
CMD ["sh", "-c", "node server/scripts/check-deployment-config.js --production && exec node server/server.js"]
