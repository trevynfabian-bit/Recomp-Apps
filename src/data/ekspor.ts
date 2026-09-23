import type { HasilLab, PeriodeFase, TabelEkspor } from '@recomp/logika';
import { mockRiwayatPercakapan } from '@/mocks/coach';
import { mockDailyLogHariIni, mockFoodLogsHariIni, mockRiwayatBerat } from '@/mocks/dailyLog';
import { supabase } from '@/lib/supabase';
import { mockSesiLatihan } from '@/mocks/latihan';
import { mockUkuran } from '@/mocks/ukuran';
import type { DayType, DayTypeTarget, Profile } from '@/types/domain';

/**
 * Tabel-tabel ekspor, dirakit dari keadaan app.
 *
 * Profil, riwayat fase, target, dan hasil lab datang dari penyedia (yang sedang
 * berlaku, termasuk suntingan di sesi ini); catatan harian, makanan, ukuran,
 * latihan, dan percakapan dari data tiruan yang sama dengan
 * layar-layarnya. Satuan disebut di nama kolom; semuanya metrik seperti yang
 * tersimpan, apa pun satuan tampilan yang dipilih.
 *
 * Ini jalur tiruan (tanpa kredensial Supabase). Dengan Supabase, tabelnya
 * datang dari server lewat `eksporDataSaya` di bawah — termasuk yang hanya
 * ada di server, seperti data tersinkron (`health_data`).
 */
export function kumpulkanTabelEkspor(m: {
  profil: Profile;
  riwayatFase: PeriodeFase[];
  tipeHari: DayType[];
  target: DayTypeTarget[];
  hasilLab: HasilLab[];
}): TabelEkspor[] {
  const namaTipe = (id: string) => m.tipeHari.find((d) => d.id === id)?.nama ?? id;
  const hariIni = mockDailyLogHariIni;

  return [
    {
      nama: 'profil',
      label: 'profil',
      kolom: ['nama', 'satuan_tampilan', 'fase_aktif', 'tinggi_cm', 'jenis_kelamin', 'tanggal_lahir', 'batas_pinggang_cm'],
      baris: [[m.profil.nama, m.profil.satuan, m.profil.fase_aktif, m.profil.tinggi_cm, m.profil.jenis_kelamin, m.profil.tanggal_lahir, m.profil.batas_pinggang_cm]],
    },
    {
      nama: 'riwayat_fase',
      label: 'periode fase',
      kolom: ['fase', 'mulai', 'selesai', 'berat_awal_kg'],
      baris: m.riwayatFase.map((p) => [p.fase, p.mulai, p.selesai, p.beratAwalKg]),
    },
    {
      nama: 'target_tipe_hari',
      label: 'target tipe hari',
      kolom: ['tipe_hari', 'fase', 'kalori_kcal', 'protein_g', 'lemak_g', 'batas_sat_fat_g'],
      baris: m.target.map((t) => [namaTipe(t.day_type_id), t.fase, t.target_kalori, t.target_protein_g, t.target_lemak_g, t.batas_sat_fat_g]),
    },
    {
      nama: 'catatan_harian',
      label: 'hari tercatat',
      kolom: ['tanggal', 'berat_pagi_kg', 'sumber_berat', 'tipe_hari', 'kalori_kcal', 'protein_g', 'lemak_g', 'karbo_g', 'sat_fat_g', 'target_kalori_kcal', 'catatan'],
      baris: mockRiwayatBerat.map((r) => {
        const log = r.tanggal === hariIni.tanggal ? hariIni : null;
        return [
          r.tanggal,
          r.berat_pagi_kg,
          r.sumber_berat,
          log ? namaTipe(log.day_type_id) : null,
          log?.kalori ?? null,
          log?.protein_g ?? null,
          log?.lemak_g ?? null,
          log?.karbo_g ?? null,
          log?.sat_fat_g ?? null,
          log?.target_kalori ?? null,
          log?.catatan ?? null,
        ];
      }),
    },
    {
      nama: 'makanan',
      label: 'entri makanan',
      kolom: ['tanggal', 'nama_makanan', 'kalori_kcal', 'protein_g', 'lemak_g', 'karbo_g', 'sat_fat_g', 'sumber'],
      baris: mockFoodLogsHariIni.map((f) => [hariIni.tanggal, f.nama_makanan, f.kalori, f.protein_g, f.lemak_g, f.karbo_g, f.sat_fat_g, f.sumber]),
    },
    {
      nama: 'ukuran_tubuh',
      label: 'pengukuran tubuh',
      kolom: ['tanggal', 'pinggang_cm', 'dada_cm', 'leher_cm', 'lengan_kiri_cm', 'lengan_kanan_cm', 'paha_kiri_cm', 'paha_kanan_cm'],
      baris: mockUkuran.map((u) => [u.tanggal, u.pinggang_cm, u.dada_cm, u.leher_cm, u.lengan_kiri_cm, u.lengan_kanan_cm, u.paha_kiri_cm, u.paha_kanan_cm]),
    },
    {
      nama: 'latihan',
      label: 'set latihan',
      kolom: ['mulai', 'sesi', 'durasi_menit', 'latihan', 'set_ke', 'jenis_set', 'beban_kg', 'reps'],
      baris: mockSesiLatihan().flatMap((s) =>
        s.latihan.flatMap((l) => l.sets.map((set) => [s.mulai, s.nama, s.durasi_menit, l.latihan, set.set_ke, set.jenis ?? null, set.beban_kg, set.reps])),
      ),
    },
    {
      nama: 'percakapan_coach',
      label: 'pesan coach',
      kolom: ['percakapan', 'waktu', 'peran', 'teks'],
      baris: mockRiwayatPercakapan.flatMap((p) => p.pesan.map((x) => [p.judul, x.waktu, x.peran, x.teks])),
    },
    ...tabelHasilLab(m.hasilLab),
  ];
}

/**
 * Hasil lab sebagai tabel ekspor untuk jalur tiruan. Dengan Supabase, tabel
 * yang sama (nama, label, kolom — dijaga `npm run cek:ekspor`) datang dari
 * `ekspor_data_saya`.
 */
export function tabelHasilLab(hasilLab: HasilLab[]): TabelEkspor[] {
  return [
    {
      nama: 'hasil_lab',
      label: 'hasil lab',
      kolom: ['tanggal', 'nama', 'laboratorium', 'jumlah_penanda'],
      baris: hasilLab.map((h) => [h.tanggal, h.nama, h.laboratorium, h.penanda.length]),
    },
    {
      nama: 'penanda_lab',
      label: 'penanda lab',
      // Rentang rujukan dari laboratorium, dibawa apa adanya.
      kolom: ['tanggal', 'panel', 'penanda', 'nilai', 'satuan', 'rujukan_min', 'rujukan_maks'],
      baris: hasilLab.flatMap((h) => h.penanda.map((p) => [h.tanggal, h.nama, p.nama, p.nilai, p.satuan, p.rujukanMin, p.rujukanMaks])),
    },
  ];
}

/**
 * Seluruh data milik akun dari server (`ekspor_data_saya`): profil, fase,
 * tipe hari & target, catatan harian, makanan, ukuran, latihan, data
 * tersinkron, sumber data, redistribusi, percakapan coach, ringkasan,
 * evaluasi, dan preferensi — dalam bentuk `TabelEkspor` yang sama.
 * RLS yang menjaga: yang terbaca hanya milik akun yang masuk.
 */
export async function eksporDataSaya(): Promise<{ dibuatPada: string; tabel: TabelEkspor[] }> {
  const { data, error } = await supabase.rpc('ekspor_data_saya');
  if (error) throw new Error(error.message);
  return { dibuatPada: data.dibuat_pada, tabel: data.tabel };
}

/** Hitungan baris per tabel, untuk memperlihatkan isi ekspor sebelum berkasnya disiapkan. */
export async function ringkasEksporDataSaya(): Promise<{ label: string; jumlah: number }[]> {
  const { data, error } = await supabase.rpc('ringkas_ekspor_data_saya');
  if (error) throw new Error(error.message);
  return data.map(({ label, jumlah }) => ({ label, jumlah: Number(jumlah) }));
}
