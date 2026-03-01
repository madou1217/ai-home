FROM node:22-bookworm-slim

WORKDIR /workspace

ENV NODE_ENV=production
ENV AIH_RUNTIME_PROFILE=container-node22

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git bash \
  && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["/bin/bash", "-lc"]
