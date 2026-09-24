import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pesanGagalHubungkan, PROFIL_SUMBER, samarkanKunci, validasiKunciHevy } from '@recomp/logika';
import type { HasilHubungkan, SumberData } from '@recomp/logika';
import { KerangkaSheet } from './KerangkaSheet';
import { Tombol, TombolBertepi, TombolUtama } from './Tombol';
import { ketukBerhasil } from '@/lib/haptics';
import { colors, radius, spacing, typography } from '@/theme';
import { Isian } from './Isian';

type Langkah =
  | { jenis: 'penjelasan' }
  | { jenis: 'proses' }
  | { jenis: 'berhasil'; kunciSamar: string | null }
  | { jenis: 'gagal'; alasan: Extract<HasilHubungkan, { ok: false }>['alasan'] };

type Props = {
  /** Sumber yang sedang dihubungkan; `null` berarti sheet tertutup. */
  sumber: SumberData | null;
  onTutup: () => void;
  /**
   * Jalankan otorisasi yang sebenarnya. Disuntikkan dari layar supaya task
   * backend cukup menukar fungsinya (izin HealthKit, OAuth, simpan kunci di
   * server) tanpa menyentuh alur tampilannya.
   */
  hubungkan: (sumber: SumberData, kunci: string | null) => Promise<HasilHubungkan>;
  onTerhubung: (sumber: SumberData) => void;
};

/**
 * Alur menghubungkan satu sumber data: jelaskan → minta izin → hasil.
 *
 * Langkah PENJELASAN tidak dilewati, termasuk untuk Apple Health. Dialog izin
 * iOS hanya muncul sekali; kalau pengguna menolaknya karena tidak tahu untuk
 * apa, app tidak bisa memunculkannya lagi dan satu-satunya jalan kembali adalah
 * Pengaturan iPhone. Jadi alasan meminta izin harus sampai SEBELUM dialog itu.
 *
 * Tiga jenis otorisasi, satu kerangka:
 *   • healthkit — dialog izin Apple Health. iOS tidak memberi tahu app jenis
 *     data mana yang ditolak, jadi hasilnya jujur soal itu alih-alih menebak;
 *   • oauth (Strava, WHOOP) — halaman layanan itu; bisa DIBATALKAN saat
 *     menunggu, karena pengguna yang menutup browser tidak mengirim apa pun;
 *   • kunci_api (Hevy) — kunci ditempel, diperiksa bentuknya DI SINI sebelum
 *     dikirim, dan hanya empat karakter terakhirnya yang ditampilkan kembali.
 */
export function SheetHubungkanSumber({ sumber, onTutup, hubungkan, onTerhubung }: Props) {
  const [langkah, setLangkah] = useState<Langkah>({ jenis: 'penjelasan' });
  const [kunci, setKunci] = useState('');
  const [tampilkanKunci, setTampilkanKunci] = useState(false);
  const [galatKunci, setGalatKunci] = useState<string | null>(null);
  // Upaya yang dibatalkan tidak boleh "menang" belakangan: jawaban yang tiba
  // setelah pengguna menekan Batal dibuang dengan membandingkan nomor upaya.
  const upaya = useRef(0);

  useEffect(() => {
    if (sumber === null) return;
    setLangkah({ jenis: 'penjelasan' });
    setKunci('');
    setTampilkanKunci(false);
    setGalatKunci(null);
  }, [sumber]);

  if (sumber === null) return null;

  const profil = PROFIL_SUMBER[sumber];

  async function mulai() {
    if (sumber === null) return;
    let kunciSah: string | null = null;
    if (profil.otorisasi === 'kunci_api') {
      const v = validasiKunciHevy(kunci);
      if (!v.ok) {
        setGalatKunci(v.alasan);
        return;
      }
      kunciSah = v.kunci;
    }

    const nomor = ++upaya.current;
    setLangkah({ jenis: 'proses' });
    let hasil: HasilHubungkan;
    try {
      hasil = await hubungkan(sumber, kunciSah);
    } catch {
      hasil = { ok: false, alasan: 'jaringan' };
    }
    if (nomor !== upaya.current) return;

    if (hasil.ok) {
      ketukBerhasil();
      onTerhubung(sumber);
      setLangkah({ jenis: 'berhasil', kunciSamar: kunciSah ? samarkanKunci(kunciSah) : null });
    } else {
      setLangkah({ jenis: 'gagal', alasan: hasil.alasan });
    }
  }

  function batal() {
    upaya.current += 1;
    setLangkah({ jenis: 'gagal', alasan: 'dibatalkan' });
  }

  const sedangProses = langkah.jenis === 'proses';

  return (
    <KerangkaSheet
      terbuka
      // Saat menunggu izin, latar tidak menutup sheet: hasilnya bisa tiba kapan
      // saja, dan sheet yang hilang di tengah jalan meninggalkan pertanyaan
      // "jadi terhubung atau tidak?". Pembatalan lewat tombol Batal yang jelas.
      onTutup={sedangProses ? null : onTutup}
      label="Sumber data"
    >
      {langkah.jenis === 'penjelasan' ? (
        <>
          <Text style={{ ...typography.title, color: colors.teks }}>Hubungkan {profil.nama}</Text>

          <View style={{ gap: spacing.sm }}>
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
              Yang dibaca
            </Text>
            {profil.membawa.map((m) => (
              <View key={m} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                <View style={{ width: 5, height: 5, borderRadius: radius.pill, backgroundColor: colors.teksRedup }} />
                <Text style={{ ...typography.body, color: colors.teks }}>{kapital(m)}</Text>
              </View>
            ))}
          </View>

          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            {profil.caraHubungkan}
          </Text>

          {profil.otorisasi === 'kunci_api' ? (
            <Isian
              label="Kunci API Hevy"
              value={kunci}
              onChangeText={(t) => {
                setKunci(t);
                if (galatKunci) setGalatKunci(null);
              }}
              placeholder="Tempel kunci API Hevy"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              secureTextEntry={!tampilkanKunci}
              textContentType="none"
              onSubmitEditing={mulai}
              galat={galatKunci}
              ekor={
                <Tombol
                  varian="teks"
                  nada="netral"
                  ukuran="kecil"
                  label={tampilkanKunci ? 'Sembunyikan' : 'Tampilkan'}
                  aksesLabel={tampilkanKunci ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                  onPress={() => setTampilkanKunci((v) => !v)}
                />
              }
            />
          ) : null}

          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
            Data tersimpan di akun Anda dan hanya bisa dibaca akun Anda. Kalori dari beberapa
            perangkat tidak pernah dijumlahkan.
          </Text>

          <View style={{ gap: spacing.sm }}>
            <TombolUtama
              label={
                profil.otorisasi === 'healthkit'
                  ? 'Lanjut ke izin Apple Health'
                  : profil.otorisasi === 'oauth'
                    ? `Lanjut ke ${profil.nama}`
                    : 'Hubungkan'
              }
              nonaktif={profil.otorisasi === 'kunci_api' && kunci.trim().length === 0}
              onPress={mulai}
            />
            <TombolBertepi label="Nanti saja" onPress={onTutup} />
          </View>
        </>
      ) : null}

      {langkah.jenis === 'proses' ? (
        <View style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl }}>
          <ActivityIndicator color={colors.aksen.teks} size="large" />
          <Text
            accessibilityLiveRegion="polite"
            style={{ ...typography.body, color: colors.teks, textAlign: 'center' }}
          >
            {profil.otorisasi === 'healthkit'
              ? 'Menunggu izin dari Apple Health…'
              : profil.otorisasi === 'oauth'
                ? `Menunggu persetujuan di ${profil.nama}…`
                : 'Memeriksa kunci ke Hevy…'}
          </Text>
          {/* Izin HealthKit dijawab dialog sistem, bukan halaman yang bisa
              ditinggal; hanya OAuth & kunci yang masuk akal dibatalkan. */}
          {profil.otorisasi !== 'healthkit' ? (
            <View style={{ alignSelf: 'stretch' }}>
              <TombolBertepi label="Batal" onPress={batal} />
            </View>
          ) : null}
        </View>
      ) : null}

      {langkah.jenis === 'berhasil' ? (
        <>
          <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md }}>
            <Text style={{ fontSize: 40, color: colors.status.sukses.teks }} accessibilityElementsHidden>
              ✓
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={{ ...typography.title, color: colors.teks, textAlign: 'center' }}
            >
              {profil.nama} terhubung
            </Text>
          </View>
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            {profil.mekanisme === 'webhook'
              ? `Data pertama masuk saat ada aktivitas baru di ${profil.nama}.`
              : 'Data pertama sedang ditarik. Statusnya terlihat di halaman Sumber data.'}
          </Text>
          {profil.otorisasi === 'healthkit' ? (
            <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
              iOS tidak memberi tahu app jenis data mana yang tidak Anda izinkan. Kalau salah satunya
              tidak pernah muncul, ubah izinnya di Pengaturan › Kesehatan › Akses Data & Perangkat.
            </Text>
          ) : null}
          {langkah.kunciSamar ? (
            <Text style={{ ...typography.label, color: colors.teksSamar }}>
              Kunci tersimpan: {langkah.kunciSamar}
            </Text>
          ) : null}
          <TombolUtama label="Selesai" onPress={onTutup} />
        </>
      ) : null}

      {langkah.jenis === 'gagal' ? (
        <GagalHubungkan
          sumber={sumber}
          alasan={langkah.alasan}
          onCobaLagi={() => setLangkah({ jenis: 'penjelasan' })}
          onTutup={onTutup}
        />
      ) : null}
    </KerangkaSheet>
  );
}

function GagalHubungkan({
  sumber,
  alasan,
  onCobaLagi,
  onTutup,
}: {
  sumber: SumberData;
  alasan: Extract<HasilHubungkan, { ok: false }>['alasan'];
  onCobaLagi: () => void;
  onTutup: () => void;
}) {
  const pesan = pesanGagalHubungkan(sumber, alasan);
  // Membatalkan sendiri bukan kegagalan: judulnya netral, tanpa warna peringatan.
  const netral = alasan === 'dibatalkan';
  return (
    <>
      <Text
        accessibilityLiveRegion="polite"
        style={{ ...typography.title, color: netral ? colors.teks : colors.status.bahaya.teks }}
      >
        {pesan.judul}
      </Text>
      <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
        {pesan.keterangan}
      </Text>
      <View style={{ gap: spacing.sm }}>
        <TombolUtama label="Coba lagi" onPress={onCobaLagi} />
        <TombolBertepi label="Tutup" onPress={onTutup} />
      </View>
    </>
  );
}

function kapital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
