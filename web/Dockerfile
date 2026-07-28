# ---- Build ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Baked into the JS bundle at build time
# CapRover → App Configs → Deployment → Build → Docker Build Args
ARG VITE_API_URL=/api
ARG VITE_BRANCH_NAME
ARG VITE_BRANCH_CODE
ARG VITE_BRANCH_PHONE

RUN npm run build

# ---- Production (nginx) ----
FROM nginx:alpine

# CapRover internal DNS — API Container HTTP Port must be 80 (not 3000).
# Do not set API_UPSTREAM to :3000. Override only if the API app name differs.
ENV API_UPSTREAM=http://srv-captain--hms-api-backend:80
# Lets the nginx template emit real $host / $uri after envsubst
ENV DOLLAR=$

COPY --from=build /app/dist /usr/share/nginx/html
# Official nginx image runs envsubst on templates/*.template → conf.d/
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1
