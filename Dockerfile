# Single-operator gateway container. HTTPS MUST be provided by the hosting ingress.
# Do not publish the upstream HTTP port directly on a public interface.
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8787 \
    BIND_ADDRESS=0.0.0.0 \
    ALLOW_PROXY_BIND=true
WORKDIR /srv/safari-ai-agent
COPY --chown=node:node package.json ./
COPY --chown=node:node gateway ./gateway
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "gateway/server.mjs"]
