FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV TIMEBOT_STATE_DIR=/app/state
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node . .
RUN mkdir -p /app/state && chown node:node /app/state
USER node
CMD ["node", "taskbot.js"]
