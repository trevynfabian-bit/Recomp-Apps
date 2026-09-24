import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  formatDesimal,
  formatTanggalPanjang,
  majuHari,
  RENTANG_UKURAN_CM,
  selisihHari,
  tanggalHariIni,
} from '@recomp/logika';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import type { UkuranTubuh } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, typography, ukuran } from '@/theme';

/** Satu pencatatan baru; `id` diberikan oleh pemanggil (nanti oleh Postgres). */
export type UkuranBaru = Omit<UkuranTubuh, 'id'>;

type KunciUkuran = keyof Omit<UkuranTubuh, 'id' | 'tanggal'>;

/**
 * Rentang masuk akal per bagian tubuh, dalam cm.
 *
 * Bukan penghakiman atas tubuh siapa pun — batasnya sengaja lebar. Tugasnya
 * cuma satu: menahan salah ketik yang mustahil (85 jadi 8,5 atau 850), karena
 * satu angka liar merusak seluruh tren mingguan di layar ini.
 */
const RENTANG: Record<KunciUkuran, { min: number; maks: number }> = RENTANG_UKURAN_CM;

/** Urutan isi form: dari atas ke bawah tubuh, kiri sebelum kanan. */
const FIELD: { kunci: KunciUkuran; label: string }[] = [
  { kunci: 'leher_cm', label: 'Leher' },
  { kunci: 'dada_cm', label: 'Dada' },
  { kunci: 'pinggang_cm', label: 'Pinggang' },
  { kunci: 'lengan_kiri_cm', label: 'Lengan kiri' },
  { kunci: 'lengan_kanan_cm', label: 'Lengan kanan' },
  { kunci: 'paha_kiri_cm', label: 'Paha kiri' },
  { kunci: 'paha_kanan_cm', label: 'Paha kanan' },
];

/**
 * Perubahan sepekan yang tidak wajar untuk ukuran tubuh (cm).
 * Di atas ini pengguna diminta mengonfirmasi — sama seperti penjaga salah
 * ketik di kartu timbang pagi.
 */
const AMBANG_KONFIRMASI_CM = 3;

/** Jarak ideal antar pencatatan; di luar rentang ini diberi keterangan. */
const JARAK_IDEAL_MIN = 5;
const JARAK_IDEAL_MAKS = 10;

/** Sejauh mana tanggal boleh digeser ke belakang dari hari ini. */
const MUNDUR_MAKS_HARI = 14;

type StatusSimpan = 'idle' | 'konfirmasi' | 'menyimpan' | 'tersimpan' | 'gagal';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  /**
   * SELURUH pencatatan yang ada, urut lama → baru.
   *
   * Bukan hanya yang terakhir: tanggal bisa digeser di form, jadi sheet perlu
   * tahu apakah tanggal terpilih sudah terisi (berarti memperbarui, bukan
   * menambah) dan pencatatan mana yang jadi pembanding selisihnya.
   */
  catatan: UkuranTubuh[];
  /**
   * Menyimpan pencatatan. Boleh async dan boleh menolak — sheet menampilkan
   * "Menyimpan…", "Tersimpan", atau "Gagal" sesuai hasilnya, jadi penggantian
   * ke penulisan Supabase nanti tidak mengubah komponen ini.
   */
  onSimpan: (ukuran: UkuranBaru) => void | Promise<void>;
};

/**
 * Formulir catat ukuran mingguan.
 *
 * Tujuh angka itu banyak untuk diketik seminggu sekali, jadi form ini TIDAK
 * dimulai dari kosong: semua field terisi ukuran pekan lalu, dan pengguna hanya
 * menyentuh yang berubah. Konsekuensinya harus dijaga jujur — tiap baris
 * menandai apakah angkanya sudah diubah atau masih salinan pekan lalu, dan
 * menyimpan tanpa satu pun perubahan minta konfirmasi dulu, karena tren yang
 * datar karena salinan tidak bisa dibedakan dari tubuh yang memang tidak
 * bergerak.
 *
 * Tanggal yang SUDAH terisi tidak ditolak, tapi berpindah ke mode memperbarui:
 * mengukur ulang atau membetulkan salah ketik di hari yang sama itu wajar, dan
 * satu tanggal hanya boleh punya satu pencatatan supaya tren tidak bercabang.
 */
export function SheetCatatUkuran({ terbuka, onTutup, catatan, onSimpan }: Props) {
  const [tanggal, setTanggal] = useState(tanggalHariIni);
  const [draf, setDraf] = useState<Record<KunciUkuran, string>>({} as Record<KunciUkuran, string>);
  const [disentuh, setDisentuh] = useState<Partial<Record<KunciUkuran, boolean>>>({});
  const [status, setStatus] = useState<StatusSimpan>('idle');

  const hariIni = tanggalHariIni();

  /** Pencatatan yang sudah ada di tanggal terpilih — kalau ada, ini mode perbarui. */
  const sudahAda = useMemo(
    () => catatan.find((c) => c.tanggal === tanggal) ?? null,
    [catatan, tanggal],
  );

  /** Pencatatan terbaru SEBELUM tanggal terpilih; dasar selisih di tiap baris. */
  const pembanding = useMemo(() => {
    const lebihTua = catatan.filter((c) => c.tanggal < tanggal);
    return lebihTua.length > 0
      ? lebihTua.reduce((a, b) => (a.tanggal >= b.tanggal ? a : b))
      : null;
  }, [catatan, tanggal]);

  /** Angka yang mengisi form: yang sudah tercatat di tanggal itu, atau pekan lalu. */
  const dasar = sudahAda ?? pembanding;

  // Isi ulang form saat sheet dibuka DAN saat tanggal berpindah ke pencatatan
  // lain. Digeser sehari dengan dasar yang sama tidak menghapus ketikan.
  useEffect(() => {
    if (!terbuka) return;
    setDraf(drafAwal(dasar));
    setDisentuh({});
    setStatus('idle');
  }, [terbuka, dasar]);

  // Tanggal selalu dimulai dari hari ini setiap sheet dibuka.
  useEffect(() => {
    if (terbuka) setTanggal(tanggalHariIni());
  }, [terbuka]);

  const baris = useMemo(
    () =>
      FIELD.map((f) => {
        const angka = urai(draf[f.kunci] ?? '');
        const rentang = RENTANG[f.kunci];
        // Selisih selalu diukur terhadap pencatatan SEBELUMNYA, bukan terhadap
        // angka yang sedang diperbarui — itu yang berarti buat tren.
        const lama = pembanding?.[f.kunci] ?? null;
        const terisi = dasar?.[f.kunci] ?? null;
        return {
          ...f,
          angka,
          rentang,
          lama,
          valid: angka !== null && angka >= rentang.min && angka <= rentang.maks,
          selisih: angka !== null && lama !== null ? bulat(angka - lama) : null,
          diubah: disentuh[f.kunci] === true && angka !== null && angka !== terisi,
        };
      }),
    [draf, disentuh, pembanding, dasar],
  );

  const semuaValid = baris.every((b) => b.valid);
  const jumlahDiubah = baris.filter((b) => b.diubah).length;
  const mode: 'baru' | 'perbarui' = sudahAda ? 'perbarui' : 'baru';
  /** Menyimpan salinan pekan lalu apa adanya — hanya relevan di mode baru. */
  const adaSalinan = mode === 'baru' && pembanding !== null && jumlahDiubah === 0;
  const lompatan = baris.filter((b) => b.selisih !== null && Math.abs(b.selisih) > AMBANG_KONFIRMASI_CM);

  /** Jarak ke pencatatan sebelumnya; null bila ini yang pertama. */
  const jarakHari = pembanding ? selisihHari(pembanding.tanggal, tanggal) : null;
  const bisaSimpan = semuaValid;
  const perluKonfirmasi = lompatan.length > 0 || adaSalinan;

  function ubah(kunci: KunciUkuran, teks: string) {
    setDraf((d) => ({ ...d, [kunci]: teks }));
    setDisentuh((s) => ({ ...s, [kunci]: true }));
    // Konfirmasi yang sudah muncul tidak boleh "nyangkut" setelah angka diperbaiki.
    if (status === 'konfirmasi') setStatus('idle');
  }

  function geserTanggal(delta: number) {
    ketukRingan();
    setTanggal((t) => {
      const berikut = majuHari(t, delta);
      const batasBawah = majuHari(hariIni, -MUNDUR_MAKS_HARI);
      if (berikut > hariIni || berikut < batasBawah) return t;
      return berikut;
    });
    if (status === 'konfirmasi') setStatus('idle');
  }

  function tekanSimpan() {
    if (!bisaSimpan) return;
    if (perluKonfirmasi && status !== 'konfirmasi') {
      ketukRingan();
      setStatus('konfirmasi');
      return;
    }
    void jalankanSimpan();
  }

  async function jalankanSimpan() {
    if (!bisaSimpan) return;
    setStatus('menyimpan');
    try {
      const nilai = Object.fromEntries(
        baris.map((b) => [b.kunci, bulat(b.angka as number)]),
      ) as Record<KunciUkuran, number>;
      await onSimpan({ tanggal, ...nilai });
      ketukBerhasil();
      setStatus('tersimpan');
      setTimeout(onTutup, 650);
    } catch {
      setStatus('gagal');
    }
  }

  const terkunci = status === 'menyimpan' || status === 'tersimpan';

  return (
    <Modal visible={terbuka} transparent animationType="slide" onRequestClose={onTutup}>
      <View style={{ flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' }}>
        {/* Area gelap di atas sheet: ketuk untuk menutup. */}
        <Pressable accessibilityLabel="Tutup" onPress={onTutup} style={{ flex: 1 }} />

        <View
          style={{
            maxHeight: '88%',
            backgroundColor: colors.permukaan,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.garis,
          }}
        >
          {/* Kepala sheet tidak ikut menggulung; beri jarak agar baris teratas
              tidak menempel ke judul saat daftar digulung. */}
          <View
            style={{
              alignItems: 'center',
              paddingTop: spacing.md,
              paddingBottom: spacing.md,
              gap: spacing.xs,
            }}
          >
            <View
              style={{
                width: ukuran.pegangan.lebar,
                height: ukuran.pegangan.tinggi,
                borderRadius: radius.pill,
                backgroundColor: colors.garis,
              }}
            />
            <Text
              style={{
                ...typography.caption,
                color: colors.teksSamar,
                textTransform: 'uppercase',
                marginTop: spacing.sm,
              }}
            >
              Catat ukuran mingguan
            </Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
          >
            {/* Tanggal pencatatan — bisa digeser karena ukur sering tertunda sehari. */}
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <TombolGeser
                  label="‹"
                  aksesLabel="Tanggal sehari lebih awal"
                  onPress={() => geserTanggal(-1)}
                />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ ...typography.body, color: colors.teks }}>
                    {formatTanggalPanjang(tanggal)}
                  </Text>
                  <Text style={{ ...typography.caption, color: colors.teksSamar, marginTop: spacing.xxs }}>
                    {tanggal === hariIni ? 'hari ini' : 'tanggal pencatatan'}
                  </Text>
                </View>
                <TombolGeser
                  label="›"
                  aksesLabel="Tanggal sehari lebih akhir"
                  onPress={() => geserTanggal(1)}
                />
              </View>

              {mode === 'perbarui' ? (
                <Keterangan nada="netral">
                  Tanggal ini sudah punya pencatatan, jadi menyimpan akan MENGGANTINYA — satu
                  tanggal satu pencatatan, supaya tren tidak bercabang.
                </Keterangan>
              ) : jarakHari !== null && jarakHari < JARAK_IDEAL_MIN ? (
                <Keterangan nada="amber">
                  Baru {jarakHari} hari dari pencatatan terakhir. Ukuran bergerak pelan — jarak
                  sekitar 7 hari membuat perubahannya lebih terbaca ketimbang galat meteran.
                </Keterangan>
              ) : jarakHari !== null && jarakHari > JARAK_IDEAL_MAKS ? (
                <Keterangan nada="netral">
                  {jarakHari} hari dari pencatatan terakhir, jadi selisih di bawah ini menampung
                  lebih dari sepekan perubahan.
                </Keterangan>
              ) : null}
            </View>

            {/* Tujuh field, sudah terisi angka yang ada — tinggal ubah yang berubah. */}
            <View style={{ gap: spacing.sm }}>
              {baris.map((b) => (
                <BarisInput
                  key={b.kunci}
                  label={b.label}
                  nilai={draf[b.kunci] ?? ''}
                  lama={b.lama}
                  selisih={b.selisih}
                  valid={b.valid}
                  onUbah={(t) => ubah(b.kunci, t)}
                />
              ))}
            </View>

            {/* Ringkas apa yang sebenarnya akan tersimpan. */}
            <View
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.permukaanCekung,
                gap: spacing.xs,
              }}
            >
              <Text style={{ ...typography.label, color: colors.teks }}>
                {dasar === null
                  ? 'Pencatatan pertama'
                  : `${jumlahDiubah} dari ${FIELD.length} ukuran diubah`}
              </Text>
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                {dasar === null
                  ? 'Angka ini jadi titik nol Anda — pencatatan berikutnya dibandingkan dengannya.'
                  : mode === 'perbarui'
                    ? `Field terisi pencatatan ${formatTanggalPanjang(tanggal)} yang sudah ada; selisih di kanan tetap dihitung terhadap pencatatan sebelumnya.`
                    : 'Field terisi ukuran pencatatan sebelumnya; yang tidak Anda sentuh tersimpan apa adanya.'}
              </Text>
            </View>

            {!semuaValid ? (
              <Keterangan nada="coral">
                Periksa angka yang ditandai merah — ada yang di luar rentang masuk akal untuk
                bagian tubuh itu.
              </Keterangan>
            ) : null}

            {status === 'konfirmasi' && lompatan.length > 0 ? (
              <Kotak nada="amber" judul={`Lompatan ${formatDesimal(AMBANG_KONFIRMASI_CM, 0)} cm ke atas`}>
                {lompatan
                  .map(
                    (b) =>
                      `${b.label} ${b.selisih! > 0 ? '+' : '−'}${formatDesimal(Math.abs(b.selisih!))} cm`,
                  )
                  .join(' · ')}
                {'\n'}Sepekan jarang mengubah ukuran sebanyak itu. Periksa sekali lagi, atau
                lanjutkan bila memang benar.
              </Kotak>
            ) : null}

            {status === 'konfirmasi' && lompatan.length === 0 && adaSalinan ? (
              <Kotak nada="amber" judul="Tidak ada angka yang berubah">
                Semua field masih persis ukuran pencatatan sebelumnya. Kalau Anda belum mengukur, batalkan
                saja — menyimpan salinan membuat tren terlihat datar padahal datanya tidak ada.
              </Kotak>
            ) : null}

            {status === 'gagal' ? (
              <Kotak nada="coral" judul="Gagal menyimpan">
                Angka Anda masih tersimpan di layar ini. Coba lagi.
              </Kotak>
            ) : null}

            {/* Cara mengukur: konsistensi titik ukur lebih menentukan daripada akurasi. */}
            <View style={{ gap: spacing.xs }}>
              <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
                Supaya angkanya bisa dibandingkan
              </Text>
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                Ukur pagi sebelum makan, otot rileks, meteran rata dan tidak menekan kulit.
                Pinggang di ketinggian pusar, leher di bawah jakun, lengan di titik tertebal.
                Yang paling menentukan bukan akurasinya, tapi memakai titik ukur yang SAMA tiap
                pekan — selisih 1 cm karena meteran bergeser tidak bisa dibedakan dari 1 cm yang
                Anda benar-benar peroleh.
              </Text>
            </View>

            <View style={{ gap: spacing.md, paddingBottom: spacing.xl }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labelSimpan(status, perluKonfirmasi, mode)}
                disabled={!bisaSimpan || terkunci}
                onPress={tekanSimpan}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  gap: spacing.sm,
                  backgroundColor:
                    status === 'tersimpan'
                      ? colors.status.sukses.isian
                      : bisaSimpan
                        ? colors.aksen.isian
                        : colors.permukaanCekung,
                  borderRadius: radius.lg,
                  minHeight: TAP_MIN,
                  paddingVertical: spacing.lg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {status === 'menyimpan' ? <ActivityIndicator size="small" color={colors.diAtasIsian} /> : null}
                {status === 'tersimpan' ? (
                  <Text style={{ ...typography.bodyTebal, color: colors.diAtasIsian }}>✓</Text>
                ) : null}
                <Text
                  style={{
                    ...typography.bodyTebal,
                    color: status === 'tersimpan' || bisaSimpan ? colors.diAtasIsian : colors.teksSamar,
                  }}
                >
                  {labelSimpan(status, perluKonfirmasi, mode)}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={terkunci}
                onPress={() => (status === 'konfirmasi' ? setStatus('idle') : onTutup())}
                style={{ minHeight: TAP_MIN, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ ...typography.label, color: colors.teksSamar }}>
                  {status === 'konfirmasi' ? 'Periksa lagi' : 'Batal'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Satu baris form: label, field angka, dan selisih terhadap pekan lalu.
 *
 * Selisih ditampilkan HIDUP saat mengetik, bukan setelah menyimpan — di situlah
 * salah ketik paling mudah tertangkap: "+12,0 cm" terbaca salah seketika,
 * sementara angka "97,4" sendirian kelihatan wajar.
 */
function BarisInput({
  label,
  nilai,
  lama,
  selisih,
  valid,
  onUbah,
}: {
  label: string;
  nilai: string;
  lama: number | null;
  selisih: number | null;
  valid: boolean;
  onUbah: (teks: string) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: TAP_MIN,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ ...typography.body, color: colors.teks }}>{label}</Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar, marginTop: spacing.xxs }}>
          {/*
            Keterangan diturunkan dari SELISIH, bukan dari apakah field sudah
            disentuh: di mode perbarui angka yang belum disentuh pun sudah
            berbeda dari pencatatan sebelumnya, dan "sama seperti sebelumnya"
            di sebelah "+0,5" akan saling membantah.
          */}
          {lama === null
            ? 'belum ada pembanding'
            : selisih === 0
              ? 'sama seperti sebelumnya'
              : `sebelumnya ${formatDesimal(lama)}`}
        </Text>
      </View>

      {/* Selisih hidup; lebar tetap agar kolom angka tidak bergoyang saat mengetik. */}
      <Text
        style={{
          ...typography.label,
          width: 62,
          textAlign: 'right',
          color: warnaSelisih(selisih),
        }}
      >
        {selisih === null || selisih === 0
          ? ''
          : `${selisih > 0 ? '+' : '−'}${formatDesimal(Math.abs(selisih))}`}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: valid ? colors.garisKontrol : colors.status.bahaya.isian,
          backgroundColor: colors.permukaanCekung,
        }}
      >
        <TextInput
          value={nilai}
          onChangeText={onUbah}
          keyboardType="decimal-pad"
          inputMode="decimal"
          selectTextOnFocus
          accessibilityLabel={`${label} dalam sentimeter`}
          style={{
            ...typography.body,
            // Lebar eksplisit: tanpa ini input di web memakai lebar bawaannya
            // (~20 karakter) dan mendorong unit keluar baris.
            width: 56,
            paddingVertical: spacing.md,
            textAlign: 'right',
            color: valid ? colors.teks : colors.status.bahaya.teks,
          }}
        />
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>cm</Text>
      </View>
    </View>
  );
}

/** Tombol bulat untuk menggeser tanggal sehari. */
function TombolGeser({
  label,
  aksesLabel,
  onPress,
}: {
  label: string;
  aksesLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aksesLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        width: TAP_MIN,
        height: TAP_MIN,
        borderRadius: radius.pill,
        backgroundColor: colors.permukaanCekung,
        borderWidth: 1,
        borderColor: colors.garisKontrol,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ ...typography.title, color: colors.teks }}>{label}</Text>
    </Pressable>
  );
}

/** Keterangan satu baris di bawah kontrol. */
function Keterangan({
  nada,
  children,
}: {
  nada: 'amber' | 'coral' | 'netral';
  children: React.ReactNode;
}) {
  const warna =
    nada === 'amber' ? colors.status.peringatan.teks : nada === 'coral' ? colors.status.bahaya.teks : colors.teksSamar;
  return (
    <Text style={{ ...typography.caption, color: warna }}>{children}</Text>
  );
}

/** Kotak peringatan bertepi, dipakai untuk konfirmasi dan kegagalan. */
function Kotak({
  nada,
  judul,
  children,
}: {
  nada: 'amber' | 'coral';
  judul: string;
  children: React.ReactNode;
}) {
  const dasar = nada === 'amber' ? colors.status.peringatan.isian : colors.status.bahaya.isian;
  const teks = nada === 'amber' ? colors.status.peringatan.teks : colors.status.bahaya.teks;
  return (
    <View
      // Isian memakai surfaceSunken, bukan tint warnanya: tint 8% di atas
      // `surface` menaikkan luminansi latar sampai teks redup di dalamnya
      // jatuh ke 3,9:1. Warnanya tetap terbaca dari tepi dan judulnya.
      style={{
        gap: spacing.xs,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: dasar + '55',
        backgroundColor: colors.permukaanCekung,
      }}
    >
      <Text style={{ ...typography.label, color: teks }}>{judul}</Text>
      <Text style={{ ...typography.caption, color: colors.teksSamar }}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Nilai awal form: angka yang sudah tercatat di tanggal itu, atau ukuran pekan
 * lalu, atau kosong bila ini pencatatan pertama.
 */
function drafAwal(dasar: UkuranTubuh | null): Record<KunciUkuran, string> {
  return Object.fromEntries(
    FIELD.map((f) => [f.kunci, dasar ? formatDesimal(dasar[f.kunci]) : '']),
  ) as Record<KunciUkuran, string>;
}

/**
 * Warna selisih SENGAJA netral, bukan hijau/merah.
 *
 * Pinggang mengecil itu bagus, lengan mengecil tidak — arah yang sama berarti
 * hal berbeda per bagian tubuh, jadi mewarnainya per tanda akan menyesatkan.
 * Yang diwarnai hanya lompatan tak wajar, karena itu soal salah ketik.
 */
function warnaSelisih(selisih: number | null): string {
  if (selisih === null) return colors.teksSamar;
  return Math.abs(selisih) > AMBANG_KONFIRMASI_CM ? colors.status.peringatan.teks : colors.teksRedup;
}

function labelSimpan(
  status: StatusSimpan,
  perluKonfirmasi: boolean,
  mode: 'baru' | 'perbarui',
): string {
  switch (status) {
    case 'menyimpan':
      return 'Menyimpan…';
    case 'tersimpan':
      return 'Tersimpan';
    case 'gagal':
      return 'Coba lagi';
    case 'konfirmasi':
      return 'Ya, simpan';
    default:
      if (perluKonfirmasi) return 'Simpan…';
      return mode === 'perbarui' ? 'Perbarui ukuran' : 'Simpan ukuran';
  }
}

/** Urai input pengguna; menerima koma maupun titik sebagai pemisah desimal. */
function urai(teks: string): number | null {
  const bersih = teks.replace(',', '.').trim();
  if (bersih === '') return null;
  const n = Number(bersih);
  return Number.isFinite(n) ? n : null;
}

function bulat(n: number): number {
  return Math.round(n * 10) / 10;
}
