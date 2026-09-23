#!/usr/bin/env bash
# Periksa Edge Function terhadap tipe SDK resmi — BERKAS ASLINYA, bukan salinan.
#
# Edge Function berjalan di Deno sehingga di luar jangkauan `tsc` proyek, padahal
# bagian paling rawan salahnya justru bentuk permintaan API: nama field,
# nilai effort, bentuk fallback, jenis blok respons. Sebelumnya yang diperiksa
# adalah SALINAN permintaannya (supabase/functions/_uji), dan salinan itu bisa
# tertinggal dari berkas aslinya tanpa ada yang tahu — model di berkas asli
# diganti, salinannya tetap lulus.
#
# Caranya: tiap `index.ts` disalin ke direktori sementara dengan struktur yang
# sama, penentu impor gaya Deno (`npm:paket@versi`) ditulis ulang ke nama paket
# yang terpasang di node_modules, lalu diperiksa `tsc` bersama tiruan minimal
# `Deno`. Versi SDK yang dipatok tiap fungsi juga dicocokkan dengan versi yang
# terpasang: pemeriksaan tipe terhadap versi lain tidak membuktikan apa pun.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERPASANG="$(node -p "require('$REPO/node_modules/@anthropic-ai/sdk/package.json').version")"
KERJA="$(mktemp -d)"
trap 'rm -rf "$KERJA"' EXIT

mkdir -p "$KERJA/supabase/functions" "$KERJA/packages/logika"
cp -r "$REPO/supabase/functions/." "$KERJA/supabase/functions/"
cp -r "$REPO/packages/logika/src" "$KERJA/packages/logika/src"
ln -s "$REPO/node_modules" "$KERJA/node_modules"

cat > "$KERJA/deno.d.ts" <<'TS'
// Tiruan minimal permukaan Deno yang dipakai Edge Function.
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
  const env: { get(nama: string): string | undefined };
}
TS

GAGAL=0
for f in "$KERJA"/supabase/functions/*/index.ts; do
  nama="$(basename "$(dirname "$f")")"

  # `|| true` wajib: dengan `pipefail`, grep yang tidak menemukan versi akan
  # menghentikan skrip DIAM-DIAM tanpa pesan — tepat kasus yang ingin dilaporkan.
  dipatok="$( (grep -o "npm:@anthropic-ai/sdk@[0-9.]*" "$f" || true) | head -1 | sed 's/.*@//')"
  if grep -q "npm:@anthropic-ai/sdk" "$f"; then
    if [ -z "$dipatok" ]; then
      echo "✗ $nama: versi SDK tidak dipatok"
      GAGAL=1
      continue
    fi
    if [ "$dipatok" != "$TERPASANG" ]; then
      echo "✗ $nama: SDK dipatok $dipatok, yang terpasang $TERPASANG"
      GAGAL=1
      continue
    fi
  fi

  sed -i -E \
    -e "s#npm:@anthropic-ai/sdk(@[0-9.]+)?#@anthropic-ai/sdk#g" \
    -e "s#npm:@supabase/supabase-js(@[0-9.]+)?#@supabase/supabase-js#g" \
    "$f"

  if (cd "$KERJA" && npx tsc --ignoreConfig --noEmit --strict --skipLibCheck \
        --moduleResolution bundler --module esnext --target es2022 \
        --allowImportingTsExtensions --lib es2022,dom \
        deno.d.ts "supabase/functions/$nama/index.ts"); then
    echo "✓ $nama: cocok dengan tipe SDK resmi ${TERPASANG}"
  else
    echo "✗ $nama: tidak cocok dengan tipe SDK resmi"
    GAGAL=1
  fi
done

if [ "$GAGAL" -ne 0 ]; then
  exit 1
fi
echo "✓ Semua Edge Function cocok dengan tipe SDK resmi, dan versinya sama dengan yang terpasang."
