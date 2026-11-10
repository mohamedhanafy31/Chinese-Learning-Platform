# syntax=docker/dockerfile:1
FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @app/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @app/shared build \
  && pnpm --filter @app/api build \
  && pnpm --filter @app/api deploy --prod /prod/api

FROM build AS migrate

USER node
CMD ["apps/api/node_modules/.bin/prisma", "migrate", "deploy"]

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV UPLOADS_DIR=/app/uploads
WORKDIR /app
COPY --from=build --chown=node:node /prod/api ./
# The compose volume mounts here; owning the directory lets the non-root user
# write to a freshly created volume.
RUN mkdir -p /app/uploads/images && chown -R node:node /app/uploads

USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
