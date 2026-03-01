FROM node:22-bookworm-slim

WORKDIR /workspace

ARG AIH_DEFAULT_PROFILE=codex

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    NODE_ENV=production \
    AIH_RUNTIME_PROFILES=codex,claude,gemini \
    AIH_RUNTIME_PROFILE=${AIH_DEFAULT_PROFILE}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git bash \
  && rm -rf /var/lib/apt/lists/* \
  && install -d -m 0755 /opt/aih/profiles \
  && printf '%s\n' 'RUNTIME_VENDOR=codex' > /opt/aih/profiles/codex.env \
  && printf '%s\n' 'RUNTIME_VENDOR=claude' > /opt/aih/profiles/claude.env \
  && printf '%s\n' 'RUNTIME_VENDOR=gemini' > /opt/aih/profiles/gemini.env

ENTRYPOINT ["/bin/bash", "-lc", "set -euo pipefail; profile=\"${AIH_RUNTIME_PROFILE:-codex}\"; case \"$profile\" in codex|claude|gemini) ;; *) echo \"Unsupported AIH_RUNTIME_PROFILE: $profile\" >&2; exit 64 ;; esac; export AIH_RUNTIME_PROFILE=\"$profile\"; profile_file=\"/opt/aih/profiles/${profile}.env\"; if [ -f \"$profile_file\" ]; then set -a; . \"$profile_file\"; set +a; fi; exec \"$@\"", "--"]
CMD ["bash"]
