# YCDO HMS web app (Phase 0: DRH registration + police dashboard).
# Static files only (no build step), served by nginx with SPA fallback to index.html.
# api-mock.js and bridge/ are not shipped: the mock is for local testing and the
# fingerprint service runs on the centre PCs.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html config.js api.js app.js biometrics.js drh.js billing.js styles.css /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
