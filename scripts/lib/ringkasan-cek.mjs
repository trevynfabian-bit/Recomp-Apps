/**
 * Ringkasan lulus/gagal bersama untuk penjaga desain (`cek:desain`,
 * `cek:hardcode`, `cek:kontras`).
 *
 * Setiap penjaga mencatat hasilnya per bagian; di akhir, `cetak()` menulis
 * satu tabel yang sama bentuknya di ketiga penjaga: berapa yang lulus per
 * bagian, total, dan HASIL yang tegas (LULUS/GAGAL) beserta daftar yang harus
 * diperbaiki. Pembaca cukup melihat blok terakhir, tidak perlu menggulir.
 *
 * Bila variabel lingkungan `CEK_RINGKASAN_BERKAS` diisi (dipakai oleh
 * `cek:desain-semua`), ringkasannya juga ditambahkan sebagai satu baris JSON
 * ke berkas itu supaya bisa digabung.
 */
import { appendFileSync } from 'node:fs';

const GARIS = '─'.repeat(60);

export function buatRingkasan(nama) {
  const bagian = [];
  let aktif = null;

  function bagianBaru(judul) {
    aktif = { judul, lulus: 0, gagal: [] };
    bagian.push(aktif);
  }

  return {
    /** Mulai bagian baru; hasil `catat()` berikutnya masuk ke sini. */
    bagian: bagianBaru,
    /** Catat satu pemeriksaan. `jumlah` = banyaknya pelanggaran (info). */
    catat(judul, lulus, jumlah = 0) {
      if (!aktif) bagianBaru('Umum');
      if (lulus) aktif.lulus += 1;
      else aktif.gagal.push({ judul, jumlah });
    },
    get gagal() {
      return bagian.reduce((n, b) => n + b.gagal.length, 0);
    },
    /**
     * Cetak ringkasan akhir. `saran` tampil saat gagal (ke mana harus
     * melihat). Mengembalikan kode keluar: 0 bila semua lulus, 1 bila tidak.
     */
    cetak({ saran } = {}) {
      const lebar = Math.max(...bagian.map((b) => b.judul.length), 10);
      const totalLulus = bagian.reduce((n, b) => n + b.lulus, 0);
      const totalGagal = bagian.reduce((n, b) => n + b.gagal.length, 0);
      console.log(`\n${GARIS}\nRingkasan ${nama}`);
      for (const b of bagian) {
        const semua = b.lulus + b.gagal.length;
        console.log(`  ${b.gagal.length ? '✗' : '✓'} ${b.judul.padEnd(lebar)}  ${b.lulus}/${semua} lulus`);
      }
      console.log(`  Total: ${totalLulus} lulus, ${totalGagal} gagal dari ${totalLulus + totalGagal} pemeriksaan`);
      if (totalGagal) {
        console.log(`\nHASIL: GAGAL (${totalGagal} pemeriksaan perlu diperbaiki)`);
        for (const b of bagian)
          for (const g of b.gagal)
            console.log(`  ✗ ${b.judul} › ${g.judul}${g.jumlah > 1 ? ` (${g.jumlah} temuan)` : ''}`);
        if (saran) console.log(saran);
      } else {
        console.log('\nHASIL: LULUS');
      }
      console.log(GARIS);

      if (process.env.CEK_RINGKASAN_BERKAS) {
        appendFileSync(
          process.env.CEK_RINGKASAN_BERKAS,
          `${JSON.stringify({
            nama,
            lulus: totalLulus,
            gagal: totalGagal,
            daftarGagal: bagian.flatMap((b) => b.gagal.map((g) => `${b.judul} › ${g.judul}`)),
          })}\n`,
        );
      }
      return totalGagal ? 1 : 0;
    },
  };
}
