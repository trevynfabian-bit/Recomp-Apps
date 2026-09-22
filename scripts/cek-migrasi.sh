#!/usr/bin/env bash
# Jalankan migrasi Supabase di Postgres lokal yang bersih, lalu uji RLS-nya.
#
# Tujuannya memastikan SQL benar-benar jalan dan kebijakan RLS benar-benar
# mengisolasi data ANTAR pengguna — bukan sekadar terlihat benar saat dibaca.
# Tidak menyentuh proyek Supabase mana pun.
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGROOT=${PGROOT:-/var/tmp/recomp-cek-migrasi}
PORT=${PORT:-55432}
DB=recomp_cek
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bersihkan() {
  su postgres -c "PATH=$PGBIN:\$PATH pg_ctl -D $PGROOT/data stop -m immediate" >/dev/null 2>&1 || true
}
trap bersihkan EXIT

echo "→ Menyiapkan Postgres bersih di $PGROOT"
bersihkan
rm -rf "$PGROOT"
mkdir -p "$PGROOT"
chown postgres:postgres "$PGROOT"
chmod 700 "$PGROOT"
su postgres -c "PATH=$PGBIN:\$PATH initdb -D $PGROOT/data -A trust -U postgres" >/dev/null
su postgres -c "PATH=$PGBIN:\$PATH pg_ctl -D $PGROOT/data -l $PGROOT/pg.log -o '-p $PORT -k $PGROOT' start" >/dev/null
sleep 2

PSQL="psql -v ON_ERROR_STOP=1 -h $PGROOT -p $PORT -U postgres -q"
$PSQL -c "create database $DB;" >/dev/null
PSQL="$PSQL -d $DB"

echo "→ Memasang tiruan auth Supabase (hanya untuk uji lokal)"
$PSQL -c 'create extension if not exists "pgcrypto";' >/dev/null
$PSQL -f "$REPO/supabase/tests/harness.sql" >/dev/null

echo "→ Menjalankan migrasi"
for f in "$REPO"/supabase/migrations/*.sql; do
  echo "   • $(basename "$f")"
  $PSQL -f "$f" >/dev/null
done

echo "→ Menjalankan migrasi SEKALI LAGI (harus idempoten)"
for f in "$REPO"/supabase/migrations/*.sql; do
  $PSQL -f "$f" >/dev/null
done

$PSQL -f "$REPO/supabase/tests/izin.sql" >/dev/null

echo "→ Menjalankan uji RLS"
for f in "$REPO"/supabase/tests/rls_*.sql; do
  echo "   • $(basename "$f")"
  $PSQL -f "$f"
done

echo "→ Memastikan RLS aktif di semua tabel publik"
$PSQL -c "
  do \$\$
  declare r record;
  begin
    for r in
      select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
    loop
      if not (select relrowsecurity from pg_class where relname = r.relname) then
        raise exception 'Tabel % tidak mengaktifkan RLS', r.relname;
      end if;
    end loop;
  end \$\$;"

echo
echo "✓ Semua migrasi jalan, idempoten, dan RLS terbukti mengisolasi per pemilik."
