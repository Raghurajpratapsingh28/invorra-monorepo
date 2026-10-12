FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY prisma prisma
RUN npm ci
COPY apps/api apps/api
RUN npx prisma generate --schema prisma/schema.prisma && npm run build -w @invorra/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
