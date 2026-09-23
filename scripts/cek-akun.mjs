/**
 * Memeriksa masuk akun: validasi email, pemetaan galat Supabase Auth ke pesan,
 * nada pesan, pemulihan sesi tersimpan (masuk otomatis), dan bahwa SETIAP
 * layar app terlindung sesi.
 *
 * Yang terakhir paling mudah rusak diam-diam: expo-router mendaftarkan layar
 * yang tidak disebut di tata letak secara otomatis, di LUAR `Stack.Protected`.
 * Layar baru yang lupa didaftarkan bisa dibuka lewat tautan dalam oleh orang
 * yang sudah keluar — tanpa ada yang terlihat rusak.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const kerja = mkdtempSync(join(tmpdir(), 'akun-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['akun.ts', 'pengingat.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const {
  emailSah, kodeGagalMasuk, PESAN_GAGAL_MASUK, buatSesiTersimpan, pulihkanSesi, pesanPemulihanSesi,
  LAMA_SESI_HARI, VERSI_SESI_TERSIMPAN,
} = require(join(kerja, 'keluar', 'akun.js'));
const { pelanggaranNada } = require(join(kerja, 'keluar', 'pengingat.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}

console.log('Validasi email');
for (const e of ['trevyn@contoh.id', ' nama.panjang+tag@sub.domain.co.id ', 'a@b.io']) cek(`sah: "${e}"`, emailSah(e));
for (const e of ['', 'trevyn', 'trevyn@', '@contoh.id', 'tre vyn@contoh.id', 'trevyn@contoh', 'trevyn@contoh.i', 'a@@b.io'])
  cek(`tidak sah: "${e}"`, !emailSah(e));

console.log('\nGalat Supabase Auth → pesan');
const kasus = [
  [{ code: 'invalid_credentials', status: 400 }, 'kredensial'],
  [{ code: 'user_not_found', status: 400 }, 'kredensial'],
  [{ code: 'email_not_confirmed', status: 400 }, 'belum-dikonfirmasi'],
  [{ code: 'over_request_rate_limit', status: 429 }, 'dibatasi'],
  [{ code: 'over_email_send_rate_limit' }, 'dibatasi'],
  [{ status: 429 }, 'dibatasi'],
  [{ status: 0, message: 'Failed to fetch' }, 'jaringan'],
  [{ message: 'Network request failed' }, 'jaringan'],
  [{ code: 'unexpected_failure', status: 500 }, 'lain'],
  [null, 'lain'],
];
for (const [g, harap] of kasus) {
  const hasil = kodeGagalMasuk(g);
  cek(`${JSON.stringify(g)} → ${harap}`, hasil === harap, `dapat ${hasil}`);
}
// Tidak membocorkan keberadaan akun: email tak terdaftar & sandi salah SAMA.
cek('email tak terdaftar dijawab sama dengan kata sandi salah',
  PESAN_GAGAL_MASUK[kodeGagalMasuk({ code: 'user_not_found' })] === PESAN_GAGAL_MASUK[kodeGagalMasuk({ code: 'invalid_credentials' })]);

console.log('\nSesi tersimpan & masuk otomatis');
const HARI = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-09-01T07:00:00Z');
const pengguna = { id: 'u-1', email: 'trevyn@contoh.id' };
const sesi0 = buatSesiTersimpan(pengguna, t0);
cek(`sesi baru berlaku ${LAMA_SESI_HARI} hari`, Date.parse(sesi0.berlakuSampai) - t0.getTime() === LAMA_SESI_HARI * HARI);
cek('sesi baru berversi terkini', sesi0.versi === VERSI_SESI_TERSIMPAN);
const teks0 = JSON.stringify(sesi0);

const t1 = new Date(t0.getTime() + 10 * HARI);
const h1 = pulihkanSesi(teks0, t1);
cek('masih berlaku → masuk', h1.sesi !== null && h1.sesi.pengguna.email === pengguna.email);
cek('masa berlaku digeser dari saat dibuka', h1.sesi && Date.parse(h1.sesi.berlakuSampai) === t1.getTime() + LAMA_SESI_HARI * HARI);
cek('waktu masuk pertama dipertahankan', h1.sesi && h1.sesi.masukPada === sesi0.masukPada);
// Rutin dibuka: tidak pernah berakhir walau jauh melewati 30 hari sejak masuk.
let s = sesi0;
let t = t0;
for (let i = 0; i < 12; i += 1) {
  t = new Date(t.getTime() + 20 * HARI);
  const h = pulihkanSesi(JSON.stringify(s), t);
  s = h.sesi ?? s;
  if (!h.sesi) break;
}
cek('dibuka tiap 20 hari selama 240 hari → tetap masuk', Date.parse(s.berlakuSampai) > t.getTime());

const batas = new Date(Date.parse(sesi0.berlakuSampai));
const tepat = pulihkanSesi(teks0, batas);
cek('tepat di batas → berakhir', tepat.sesi === null && tepat.alasan === 'berakhir');
cek('sedetik sebelum batas → masih berlaku', pulihkanSesi(teks0, new Date(batas.getTime() - 1000)).sesi !== null);
const lewat = pulihkanSesi(teks0, new Date(batas.getTime() + 5 * HARI));
cek('berakhir membawa email untuk diisi lebih dulu', lewat.sesi === null && lewat.email === pengguna.email);

const rusak = [
  ['bukan JSON', '{sesi'],
  ['null JSON', 'null'],
  ['angka', '42'],
  ['versi lain', JSON.stringify({ ...sesi0, versi: VERSI_SESI_TERSIMPAN + 1 })],
  ['tanpa versi', JSON.stringify({ ...sesi0, versi: undefined })],
  ['tanpa pengguna', JSON.stringify({ ...sesi0, pengguna: undefined })],
  ['id kosong', JSON.stringify({ ...sesi0, pengguna: { id: '', email: pengguna.email } })],
  ['email tidak sah', JSON.stringify({ ...sesi0, pengguna: { id: 'u-1', email: 'bukan-email' } })],
  ['tanggal tidak sah', JSON.stringify({ ...sesi0, berlakuSampai: 'besok' })],
  ['tanggal berupa angka', JSON.stringify({ ...sesi0, berlakuSampai: 1893456000000 })],
];
for (const [nama, teks] of rusak) {
  const h = pulihkanSesi(teks, t1);
  cek(`${nama} → rusak (belum masuk, tanpa email)`, h.sesi === null && h.alasan === 'rusak' && h.email === undefined,
    JSON.stringify(h));
}
cek('null → kosong', pulihkanSesi(null, t1).alasan === 'kosong');
cek('string kosong → kosong', pulihkanSesi('', t1).alasan === 'kosong');
// Isi tambahan dari luar tidak ikut terbawa ke sesi yang dipulihkan.
const bertambah = pulihkanSesi(JSON.stringify({ ...sesi0, pengguna: { ...pengguna, peran: 'admin' }, token: 'x' }), t1);
cek('isi tambahan dibuang', bertambah.sesi && JSON.stringify(Object.keys(bertambah.sesi.pengguna)) === '["id","email"]' && !('token' in bertambah.sesi));

cek('pertama kali: tanpa pesan', pesanPemulihanSesi('kosong') === null);
cek('isi rusak: tanpa pesan (bukan urusan pengguna)', pesanPemulihanSesi('rusak') === null);
const pesanBerakhir = pesanPemulihanSesi('berakhir');
cek('berakhir: ada pesan, netral, tanpa angka', !!pesanBerakhir && pelanggaranNada(pesanBerakhir).length === 0 && !/\d/.test(pesanBerakhir));

console.log('\nNada pesan');
for (const [kode, pesan] of Object.entries(PESAN_GAGAL_MASUK)) {
  const p = pelanggaranNada(pesan);
  cek(`${kode} netral`, p.length === 0, `melanggar: ${p.join(', ')}`);
}
// Kalimat yang ditulis langsung di layar masuk & sheet keluar: semua
// literal string & teks JSX, dibaca lewat parser TypeScript, bukan regex.
const ts = require('typescript');
function kalimatDi(berkas) {
  const sumber = ts.createSourceFile(berkas, readFileSync(berkas, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hasil = [];
  (function jelajah(n) {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) {
      const t = n.text.replace(/\s+/g, ' ').trim();
      // Kalimat untuk manusia: ada spasi & huruf (bukan nama ikon, warna, atau kunci).
      if (/\s/.test(t) && /[a-z]{3}/i.test(t)) hasil.push(t);
    }
    ts.forEachChild(n, jelajah);
  })(sumber);
  return hasil;
}
const kalimatMasuk = kalimatDi('app/masuk.tsx');
const kalimatKeluar = kalimatDi('src/components/SheetKeluarAkun.tsx');
cek('layar masuk punya kalimat untuk diperiksa', kalimatMasuk.length >= 8, `hanya ${kalimatMasuk.length}`);
cek('sheet keluar punya kalimat untuk diperiksa', kalimatKeluar.length >= 5, `hanya ${kalimatKeluar.length}`);
for (const t of [...kalimatMasuk, ...kalimatKeluar]) {
  const p = pelanggaranNada(t);
  cek(`netral: "${t.length > 70 ? `${t.slice(0, 67)}...` : t}"`, p.length === 0, `melanggar: ${p.join(', ')}`);
}

console.log('\nPerlindungan sesi');
const tataLetak = readFileSync('app/_layout.tsx', 'utf8');
const blok = (guard) => {
  const m = tataLetak.match(new RegExp(`<Stack\\.Protected guard=\\{${guard}\\}>([\\s\\S]*?)</Stack\\.Protected>`));
  return m ? [...m[1].matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((x) => x[1]) : null;
};
const terlindung = blok('sudahMasuk');
const tamu = blok('!sudahMasuk');
cek('blok layar app ditemukan', terlindung !== null);
cek('blok layar tamu ditemukan', tamu !== null);
const layarApp = readdirSync('app', { withFileTypes: true })
  .map((d) => (d.isDirectory() ? d.name : d.name.replace(/\.tsx$/, '')))
  .filter((n) => !n.startsWith('_') && !n.startsWith('+'));
for (const n of layarApp) {
  if (n === 'masuk') {
    cek('layar masuk hanya untuk yang keluar', (tamu ?? []).includes('masuk') && !(terlindung ?? []).includes('masuk'));
  } else {
    cek(`"${n}" terlindung sesi`, (terlindung ?? []).includes(n), 'tambahkan <Stack.Screen> di blok guard={sudahMasuk}');
  }
}
cek('tamu hanya melihat layar masuk', JSON.stringify(tamu) === '["masuk"]', `tamu = ${JSON.stringify(tamu)}`);
// State per akun (profil, target, koneksi, kiriman, berkas ekspor) dimulai ulang tiap pengguna berganti.
const kunciProfil = tataLetak.indexOf("<PenyediaProfil key={pengguna?.id ?? 'tamu'}>");
cek('penyedia per akun berkunci id pengguna', kunciProfil >= 0);
for (const penyedia of ['PenyediaSinkron', 'PenyediaTarget', 'PenyediaEkspor']) {
  const i = tataLetak.indexOf(`<${penyedia}>`);
  cek(`${penyedia} di dalam penyedia berkunci`, kunciProfil >= 0 && i > kunciProfil && i < tataLetak.indexOf('</PenyediaProfil>'));
}
// Kiriman Realtime tidak boleh muncul di atas layar masuk.
cek('banner data masuk hanya saat masuk', /\{sudahMasuk \? <BannerDataMasuk \/> : null\}/.test(tataLetak));

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan akun lulus');
process.exit(gagal ? 1 : 0);
