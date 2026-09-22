#!/usr/bin/env bash
# Periksa bentuk permintaan Anthropic di Edge Function memakai tipe SDK resmi.
# Edge Function berjalan di Deno sehingga di luar jangkauan `tsc` proyek; yang
# diperiksa di sini adalah bagian paling rawan salahnya — bentuk permintaan API.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
npx tsc --ignoreConfig --noEmit --strict --skipLibCheck \
  --moduleResolution bundler --module esnext --target es2022 \
  "$REPO/supabase/functions/_uji/bentuk-permintaan.ts"
echo "✓ Bentuk permintaan Anthropic cocok dengan tipe SDK resmi."
