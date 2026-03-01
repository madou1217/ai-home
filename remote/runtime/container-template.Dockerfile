#
# Reproducibility guidance:
# 1) Pin the base image by digest in CI (example: node:22-bookworm-slim@sha256:...).
# 2) Set DEBIAN_SNAPSHOT to a UTC timestamp (YYYYMMDDTHHMMSSZ) to freeze apt indices.
#    Example: --build-arg DEBIAN_SNAPSHOT=20260301T000000Z
#
FROM node:22-bookworm-slim

WORKDIR /workspace

ARG AIH_DEFAULT_PROFILE=codex
ARG DEBIAN_SNAPSHOT=

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    NODE_ENV=production \
    AIH_RUNTIME_PROFILES=codex,claude,gemini \
    AIH_RUNTIME_PROFILE=${AIH_DEFAULT_PROFILE}

RUN set -eux; \
  if [ -n "${DEBIAN_SNAPSHOT}" ]; then \
    sed -ri \
      -e "s#https?://deb.debian.org/debian#http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}#g" \
      -e "s#https?://security.debian.org/debian-security#http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}#g" \
      /etc/apt/sources.list.d/debian.sources; \
    printf '%s\n' 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99snapshot; \
  fi; \
  apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    git \
  && rm -rf /var/lib/apt/lists/* \
  && install -d -m 0755 /opt/aih/profiles \
  && printf '%s\n' 'RUNTIME_VENDOR=codex' > /opt/aih/profiles/codex.env \
  && printf '%s\n' 'RUNTIME_VENDOR=claude' > /opt/aih/profiles/claude.env \
  && printf '%s\n' 'RUNTIME_VENDOR=gemini' > /opt/aih/profiles/gemini.env

ENTRYPOINT ["/bin/bash", "-lc", "set -euo pipefail; profile=\"${AIH_RUNTIME_PROFILE:-codex}\"; case \"$profile\" in codex|claude|gemini) ;; *) echo \"Unsupported AIH_RUNTIME_PROFILE: $profile\" >&2; exit 64 ;; esac; export AIH_RUNTIME_PROFILE=\"$profile\"; profile_file=\"/opt/aih/profiles/${profile}.env\"; if [ -f \"$profile_file\" ]; then set -a; . \"$profile_file\"; set +a; fi; exec \"$@\"", "--"]
CMD ["bash"]
