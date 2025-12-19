# ============================================
# Custom Caddy with Rate Limiting Module
# Built: 2025-12-19
# Reason: Standard Caddy image lacks rate_limit module
# ============================================

FROM caddy:2.8.4-builder AS builder

RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:2.8.4

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
