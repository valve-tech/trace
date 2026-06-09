#!/usr/bin/env bash
#
# deploy-ipfs.sh — publish the Explore SPA to a self-hosted kubo (IPFS) node.
#
# The trace repo BUILDS the artifact; this script ADDS + PINS it to a kubo node
# you already run (the indexer box's node, where chifra publishes the unchained
# index). It deliberately does NOT touch DNS and holds no secrets — the kubo API
# endpoint is the only input, passed via env.
#
# The build is deterministic: identical source → identical CID, every time. So
# you can diff the printed CID against a previous release before flipping DNS.
#
# Usage
# -----
#   # On the node box (kubo API on localhost:5001):
#   npm run deploy:ipfs
#
#   # From your laptop, tunnel the node's API first:
#   ssh -N -L 5001:127.0.0.1:5001 <indexer-box> &
#   npm run deploy:ipfs
#
# Env
# ---
#   IPFS_API_ADDR   kubo API multiaddr.  Default: /ip4/127.0.0.1/tcp/5001
#   DNSLINK_DOMAIN  DNSLink hostname to print a record for.
#                   Default: ipfs.explore.valve.city
#   SKIP_BUILD      set to "1" to pin the existing packages/web/dist as-is
#                   (skips `npm run build:ipfs`).
#
# Requires: the `ipfs` (kubo) CLI on PATH, reachable to IPFS_API_ADDR.

set -euo pipefail

IPFS_API_ADDR="${IPFS_API_ADDR:-/ip4/127.0.0.1/tcp/5001}"
DNSLINK_DOMAIN="${DNSLINK_DOMAIN:-ipfs.explore.valve.city}"

# Resolve repo root from this script's location so it runs from anywhere.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/packages/web/dist"

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }

command -v ipfs >/dev/null 2>&1 || die "kubo \`ipfs\` CLI not on PATH."

# 1. Build the gateway-portable bundle (relative assets + HashRouter + baked
#    backend origin) unless told to reuse an existing dist.
if [ "${SKIP_BUILD:-}" = "1" ]; then
  info "SKIP_BUILD=1 — pinning existing $DIST"
  [ -f "$DIST/index.html" ] || die "no build at $DIST (run without SKIP_BUILD)."
else
  info "building IPFS bundle (npm run build:ipfs)"
  ( cd "$ROOT" && npm run --silent build:ipfs --workspace=packages/web )
fi

# 2. Fail fast if the kubo node isn't reachable, with a clearer message than
#    `ipfs add`'s "remove the api file" hint. `swarm peers` round-trips to the
#    daemon (returns 0 even with an empty peer list), unlike `version`, which
#    answers locally from the CLI and would mask a down API.
info "checking kubo API at $IPFS_API_ADDR"
ipfs --api "$IPFS_API_ADDR" swarm peers >/dev/null 2>&1 \
  || die "kubo API not reachable at $IPFS_API_ADDR. On the node box use the default; otherwise tunnel: ssh -N -L 5001:127.0.0.1:5001 <box>"

# 3. Add + pin the directory recursively. CIDv1 (base32) for gateway-friendly
#    subdomain resolution. -Q prints only the final root CID. --pin is implied
#    but stated for clarity / future-proofing.
info "adding + pinning $DIST"
CID="$(ipfs --api "$IPFS_API_ADDR" add -r -Q --cid-version 1 --pin=true "$DIST")"
[ -n "$CID" ] || die "ipfs add returned no CID."

# 4. Report. We stop at the pin — DNS is yours to set.
cat <<EOF

$(info "pinned to the node ✓")

  Root CID : $CID
  Gateway  : https://$DNSLINK_DOMAIN/  (once DNSLink points at the CID below)
  Verify   : ipfs --api $IPFS_API_ADDR cat $CID/index.html | head

  DNSLink record to set (your DNS provider — this script does NOT touch DNS):

    _dnslink.$DNSLINK_DOMAIN.  TXT  "dnslink=/ipfs/$CID"

  After the TXT propagates, confirm end-to-end:
    curl -fsS https://$DNSLINK_DOMAIN/ | grep -o '<title>[^<]*</title>'

EOF
