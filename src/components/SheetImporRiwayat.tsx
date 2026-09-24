import { useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import {
  formatAngka,
  formatRentangTanggal,
  tanggalDariWaktu,
  tanggalHariIni,
  uraiCsvHevy,
  uraiCsvUkuran,
} from '@recomp/logika';
import type { BarisDilewati } from '@recomp/logika';
import { Isian } from './Isian';
import { KeadaanGagal } from './Keadaan';
import { StatusProses } from './StatusProses';
import { JudulSheet, KerangkaSheet } from './KerangkaSheet';
import { PilihanSegmen } from './PilihanSegmen';
import { Tombol } from './Tombol';
import { jalankanImporRiwayat, KesalahanImpor, type IsiImpor } from '@/data/imporRiwayat';
import { ketukBerhasil } from '@/lib/haptics';
import { supabaseSiap } from '@/lib/supabase';
import {
  CONTOH_CSV_HEVY,
  CONTOH_CSV_UKURAN,
  mockHasilAppleHealth,
  mockJalankanImpor,
  RENTANG_APPLE_HEALTH,
} from '@/mocks/impor';
import { colors, spacing, typography, ukuran } from '@/theme';
import { Panel } from './Card';

/** Sumber impor; sama dengan `import_jobs.sumber` di PRD. */
export type SumberImpor = 'hevy_csv' | 'apple_health' | 'ukuran_lama';

type Pratinjau = {
  /** Kalimat ringkas, mis. "3 sesi · 7 set · 8–12 September". */
  ringkas: string;
  /** Berapa baris/entri yang akan diimpor. */
  jumlah: number;
  /** Kata benda untuk `jumlah`, mis. "sesi", "tanggal". */
  satuan: string;
  catatan: string[];
  dilewati: BarisDilewati[];
  /** Isi yang akan dikirim; `null` untuk Apple Health (dibaca perangkat saat impor). */
  isi: IsiImpor | null;
};

type Langkah =
  | { jenis: 'masukan' }
  | { jenis: 'pratinjau'; p: Pratinjau }
  | { jenis: 'proses'; p: Pratinjau; selesai: number }
  | { jenis: 'selesai'; p: Pratinjau };

type Props = {
  sumber: SumberImpor | null;
  onTutup: () => void;
  /** Dipanggil setelah impor selesai, untuk memperbarui status kartunya. */
  onSelesai: (sumber: SumberImpor, ringkas: string) => void;
};

const JUDUL: Record<SumberImpor, string> = {
  hevy_csv: 'Impor riwayat Hevy',
  apple_health: 'Impor riwayat Apple Health',
  ukuran_lama: 'Impor ukuran lama',
};

/** Berapa baris dilewati yang ditampilkan sebelum diringkas "dan N lainnya". */
const MAKS_DILEWATI_TAMPIL = 5;

/**
 * Impor riwayat sekali: masukan → PRATINJAU → proses → selesai.
 *
 * Pratinjau tidak bisa dilewati. Impor adalah satu-satunya tempat di app ini
 * yang menulis ratusan baris sekaligus, dan satu kolom yang bergeser atau
 * satuan pound yang terbaca kilogram merusak semuanya. Yang dilewati parser
 * ditampilkan per baris dengan alasannya, sebelum apa pun disimpan.
 *
 * Berkas ditempel sebagai teks untuk sementara: pemilih berkas di perangkat
 * datang bersama backend-nya. Parsernya sudah yang sebenarnya.
 */
export function SheetImporRiwayat({ sumber, onTutup, onSelesai }: Props) {
  const [langkah, setLangkah] = useState<Langkah>({ jenis: 'masukan' });
  const [teks, setTeks] = useState('');
  /** Nama berkas yang dipilih; `null` bila isinya ditempel atau contoh. */
  const [namaBerkas, setNamaBerkas] = useState<string | null>(null);
  const [memilih, setMemilih] = useState(false);
  /** Berkas pilihan yang ditolak parser: nama + alasan, ditampilkan sebagai keadaan gagal. */
  const [tolak, setTolak] = useState<{ nama: string; alasan: string } | null>(null);
  const router = useRouter();
  const [galat, setGalat] = useState<string | null>(null);
  const [rentang, setRentang] = useState<(typeof RENTANG_APPLE_HEALTH)[number]['kunci']>('365');

  useEffect(() => {
    if (sumber === null) return;
    setLangkah({ jenis: 'masukan' });
    setTeks('');
    setNamaBerkas(null);
    setTolak(null);
    setGalat(null);
    setRentang('365');
  }, [sumber]);

  if (sumber === null) return null;

  /**
   * Pilih berkas CSV dari perangkat (Files/iCloud Drive/unduhan), baca isinya,
   * lalu langsung ke pratinjau: memilih berkas adalah jalan utama, menempel
   * isi adalah cadangan. Membatalkan pemilihan tidak dihitung galat.
   */
  async function pilihBerkas() {
    setMemilih(true);
    try {
      const hasil = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (hasil.canceled || hasil.assets.length === 0) return;
      const aset = hasil.assets[0];
      // Web memberi objek File; iOS/Android memberi URI berkas salinan di cache.
      const isi = aset.file ? await aset.file.text() : await (await fetch(aset.uri)).text();
      setTeks(isi);
      setNamaBerkas(aset.name);
      setGalat(null);
      setTolak(null);
      periksa(isi, aset.name);
    } catch {
      setGalat('Berkas belum bisa dibaca. Coba pilih lagi, atau tempel isinya di kolom di bawah.');
    } finally {
      setMemilih(false);
    }
  }

  /** Galat urai: berkas pilihan jadi keadaan "ditolak", isi tempelan jadi galat kolom. */
  function gagalUrai(alasan: string, nama: string | null) {
    if (nama) setTolak({ nama, alasan });
    else setGalat(alasan);
  }

  function periksa(isiTeks: string = teks, nama: string | null = null) {
    if (sumber === null) return;
    if (sumber === 'apple_health') {
      const r = RENTANG_APPLE_HEALTH.find((x) => x.kunci === rentang)!;
      const hasil = mockHasilAppleHealth(r.hari);
      setLangkah({
        jenis: 'pratinjau',
        p: {
          ringkas: hasil.map((h) => `${formatAngka(h.jumlah)} ${h.label}`).join(' · '),
          jumlah: hasil.reduce((t, h) => t + h.jumlah, 0),
          satuan: 'entri',
          catatan: [
            `Rentang: ${r.label.toLowerCase()} terakhir.`,
            'Berat dari Apple Health ditandai "sinkron"; berat yang Anda ketik sendiri tidak ditimpa.',
          ],
          dilewati: [],
          isi: null,
        },
      });
      return;
    }

    if (sumber === 'hevy_csv') {
      const h = uraiCsvHevy(isiTeks);
      if ('galat' in h) return gagalUrai(h.galat, nama);
      if (h.sesi.length === 0) return gagalUrai('Tidak ada satu pun set yang bisa diimpor.', nama);
      const dari = tanggalDariWaktu(h.sesi[0].mulai);
      const sampai = tanggalDariWaktu(h.sesi[h.sesi.length - 1].mulai);
      setLangkah({
        jenis: 'pratinjau',
        p: {
          ringkas: `${formatAngka(h.sesi.length)} sesi · ${formatAngka(h.jumlahSet)} set · ${formatRentangTanggal(dari, sampai)}`,
          jumlah: h.sesi.length,
          satuan: 'sesi',
          catatan: h.satuanBeban === 'lb' ? ['Beban di berkas dalam pound; dikonversi ke kilogram.'] : [],
          dilewati: h.dilewati,
          isi: { sumber: 'hevy_csv', sesi: h.sesi },
        },
      });
      return;
    }

    const u = uraiCsvUkuran(isiTeks, tanggalHariIni());
    if ('galat' in u) return gagalUrai(u.galat, nama);
    if (u.baris.length === 0) return gagalUrai('Tidak ada satu pun baris ukuran yang bisa diimpor.', nama);
    setLangkah({
      jenis: 'pratinjau',
      p: {
        ringkas: `${formatAngka(u.baris.length)} tanggal · ${formatRentangTanggal(u.baris[0].tanggal, u.baris[u.baris.length - 1].tanggal)}`,
        jumlah: u.baris.length,
        satuan: 'tanggal',
        catatan: [],
        dilewati: u.dilewati,
        isi: { sumber: 'ukuran_lama', baris: u.baris },
      },
    });
  }

  async function impor(p: Pratinjau) {
    if (sumber === null) return;
    setGalat(null);
    setLangkah({ jenis: 'proses', p, selesai: 0 });
    // Tanpa Supabase (pratinjau web, pengembangan) — dan untuk Apple Health
    // sampai pembaca HealthKit native ada — kemajuannya tiruan.
    if (supabaseSiap && p.isi !== null) {
      try {
        await jalankanImporRiwayat(p.isi, p.ringkas, p.dilewati, (selesai) =>
          setLangkah({ jenis: 'proses', p, selesai }),
        );
      } catch (e) {
        setGalat(e instanceof KesalahanImpor ? e.message : 'Impor gagal. Coba lagi.');
        setLangkah({ jenis: 'pratinjau', p });
        return;
      }
    } else {
      await mockJalankanImpor(p.jumlah, (selesai) => setLangkah({ jenis: 'proses', p, selesai }));
    }
    ketukBerhasil();
    onSelesai(sumber, p.ringkas);
    setLangkah({ jenis: 'selesai', p });
  }

  return (
    <KerangkaSheet
      terbuka
      // Selama menulis, sheet tidak bisa ditutup dari latar: impor yang
      // terputus di tengah jalan meninggalkan riwayat setengah jadi.
      onTutup={langkah.jenis === 'proses' ? null : onTutup}
      label="Impor riwayat"
    >
      <JudulSheet>{JUDUL[sumber]}</JudulSheet>

      {langkah.jenis === 'masukan' ? (
        sumber === 'apple_health' ? (
          <>
            <Teks>
              Berat pagi, langkah, energi aktif, dan tidur dari rentang yang dipilih. Cukup sekali; setelah
              itu data baru masuk sendiri.
            </Teks>
            <PilihanSegmen
              opsi={RENTANG_APPLE_HEALTH.map((r) => ({ nilai: r.kunci, label: r.label }))}
              terpilih={rentang}
              onPilih={setRentang}
            />
            <View style={{ gap: spacing.sm }}>
              <Tombol label="Lihat pratinjau" onPress={() => periksa()} />
              <Tombol varian="bertepi" label="Nanti saja" onPress={onTutup} />
            </View>
          </>
        ) : (
          <>
            <Teks>
              {sumber === 'hevy_csv'
                ? 'Di Hevy: Profil › Settings › Export & Import Data › Export Workouts, lalu pilih berkas CSV-nya di sini.'
                : 'Tabel ukuran lama: satu baris per tanggal, kolom Tanggal lalu Pinggang, Dada, Leher, Lengan kiri/kanan, Paha kiri/kanan (cm). Simpan dari Excel sebagai CSV.'}
            </Teks>
            {tolak ? (
              <KeadaanGagal
                tampilan="polos"
                judul={`${tolak.nama} ditolak`}
                keterangan={`${tolak.alasan} ${
                  sumber === 'hevy_csv'
                    ? 'Yang diterima: ekspor "Export Workouts" dari Hevy, dengan kolom title, start_time, exercise_title, set_index, dan reps.'
                    : 'Yang diterima: CSV dengan kolom Tanggal dan minimal satu kolom ukuran (Pinggang, Dada, Leher, Lengan, Paha).'
                } Tidak ada data yang diubah.`}
              />
            ) : null}
            <Tombol
              label={tolak ? 'Pilih berkas lain' : 'Pilih berkas CSV'}
              ikon="document-attach-outline"
              memproses={memilih}
              onPress={() => void pilihBerkas()}
            />
            <Teks redup>Atau tempel isinya:</Teks>
            <Isian
              mono
              label="Isi berkas CSV"
              value={teks}
              onChangeText={(t) => {
                setTeks(t);
                setNamaBerkas(null);
                setTolak(null);
                if (galat) setGalat(null);
              }}
              placeholder="Tempel isi CSV di sini"
              galat={galat}
            />
            <Tombol
              varian="teks"
              ukuran="kecil"
              label="Pakai berkas contoh"
              onPress={() => {
                setTeks(sumber === 'hevy_csv' ? CONTOH_CSV_HEVY : CONTOH_CSV_UKURAN);
                setGalat(null);
              }}
            />
            <View style={{ gap: spacing.sm }}>
              <Tombol varian="bertepi" label="Lihat pratinjau" nonaktif={teks.trim().length === 0} onPress={() => periksa()} />
              <Tombol varian="bertepi" label="Nanti saja" onPress={onTutup} />
            </View>
          </>
        )
      ) : null}

      {langkah.jenis === 'pratinjau' ? (
        <>
          <View style={{ gap: spacing.xs }}>
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
              Akan diimpor{namaBerkas ? ` dari ${namaBerkas}` : ''}
            </Text>
            <Text style={{ ...typography.bodyTebal, color: colors.teks }}>{langkah.p.ringkas}</Text>
          </View>
          {langkah.p.catatan.map((c) => (
            <Teks key={c}>{c}</Teks>
          ))}
          {langkah.p.dilewati.length > 0 ? <DaftarDilewati dilewati={langkah.p.dilewati} /> : null}
          <Teks redup>Mengimpor ulang tidak menggandakan data, dan tidak menimpa yang sudah tercatat di app.</Teks>
          {galat ? (
            <Text accessibilityRole="alert" style={{ ...typography.labelBiasa, color: colors.teks }}>
              {galat}
            </Text>
          ) : null}
          <View style={{ gap: spacing.sm }}>
            <Tombol
              label={`Impor ${formatAngka(langkah.p.jumlah)} ${langkah.p.satuan}`}
              onPress={() => impor(langkah.p)}
            />
            {/* Bukan "Kembali": label itu sudah dipakai tombol kembali layar di
                belakang sheet, dan dua tombol berlabel sama membingungkan
                pembaca layar. Labelnya menyebut apa yang akan diubah. */}
            <Tombol varian="bertepi"
              label={sumber === 'apple_health' ? 'Ganti rentang' : 'Ganti berkas'}
              onPress={() => {
                setGalat(null);
                setLangkah({ jenis: 'masukan' });
              }}
            />
          </View>
        </>
      ) : null}

      {langkah.jenis === 'proses' ? (
        <View style={{ paddingVertical: spacing.md }}>
          <StatusProses
            keadaan="berjalan"
            judul={`Mengimpor… ${formatAngka(langkah.selesai)} dari ${formatAngka(langkah.p.jumlah)} ${langkah.p.satuan}`}
            progres={{ selesai: langkah.selesai, total: langkah.p.jumlah }}
          />
        </View>
      ) : null}

      {langkah.jenis === 'selesai' ? (
        <>
          <StatusProses keadaan="berhasil" judul={`${formatAngka(langkah.p.jumlah)} ${langkah.p.satuan} diimpor`} />
          {/* Ringkasan hasil: apa yang masuk, dari mana, dan apa yang tidak. */}
          <Panel style={{ gap: spacing.sm }}>
            {namaBerkas ? <BarisRingkas label="Berkas" nilai={namaBerkas} /> : null}
            <BarisRingkas label="Masuk" nilai={langkah.p.ringkas} />
            <BarisRingkas
              label="Dilewati"
              nilai={langkah.p.dilewati.length > 0 ? `${langkah.p.dilewati.length} baris, seperti di pratinjau` : 'tidak ada'}
            />
            <BarisRingkas label="Duplikat" nilai="tidak digandakan; catatan yang sudah ada tidak ditimpa" />
          </Panel>
          <View style={{ gap: spacing.sm }}>
            <Tombol label="Selesai" onPress={onTutup} />
            <Tombol
              varian="bertepi"
              label={TUJUAN[sumber].label}
              onPress={() => {
                onTutup();
                router.navigate(TUJUAN[sumber].rute);
              }}
            />
          </View>
        </>
      ) : null}
    </KerangkaSheet>
  );
}

/** Tempat hasil impor terlihat di app, per sumber. */
const TUJUAN: Record<SumberImpor, { label: string; rute: '/latihan' | '/ukuran' | '/tren' }> = {
  hevy_csv: { label: 'Lihat di Latihan', rute: '/latihan' },
  apple_health: { label: 'Lihat di Tren', rute: '/tren' },
  ukuran_lama: { label: 'Lihat di Ukuran tubuh', rute: '/ukuran' },
};

function BarisRingkas({ label, nilai }: { label: string; nilai: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <Text style={{ ...typography.caption, color: colors.teksSamar, width: ukuran.kolomTabel.lebar, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ ...typography.labelBiasa, color: colors.teks, flex: 1 }}>{nilai}</Text>
    </View>
  );
}

function DaftarDilewati({ dilewati }: { dilewati: BarisDilewati[] }) {
  const tampil = dilewati.slice(0, MAKS_DILEWATI_TAMPIL);
  const sisa = dilewati.length - tampil.length;
  return (
    <Panel style={{ gap: spacing.xs }}>
      <Text style={{ ...typography.label, color: colors.aksen.teks }}>
        {dilewati.length} baris dilewati
      </Text>
      {tampil.map((d) => (
        <Text key={`${d.baris}-${d.alasan}`} style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
          Baris {d.baris} — {d.alasan}
        </Text>
      ))}
      {sisa > 0 ? (
        <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>dan {sisa} lainnya</Text>
      ) : null}
    </Panel>
  );
}

function Teks({ children, redup = false }: { children: React.ReactNode; redup?: boolean }) {
  return (
    <Text
      style={{
        ...typography.labelBiasa,
        color: redup ? colors.teksSamar : colors.teksRedup,
      }}
    >
      {children}
    </Text>
  );
}
