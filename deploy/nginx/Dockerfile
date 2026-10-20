# Builds the frontend and serves it with Nginx, which also load-balances /api over the API containers.
# Build context: the repo root (see deploy/docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /app

COPY Frontend/package*.json ./
RUN npm ci

COPY Frontend/ ./
# The API is on the same origin as the page, behind this Nginx.
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
