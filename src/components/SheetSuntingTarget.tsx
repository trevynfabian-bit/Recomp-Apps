import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { formatAngka, ISIAN_KOSONG, isianBerubah, isianDariTarget, periksaTarget, rincianKaloriMakro } from '@recomp/logika';
import type { Fase, IsianTarget, KolomTarget, NilaiTarget } from '@recomp/logika';
import { InputTarget } from './InputTarget';
import { KerangkaSheet } from './KerangkaSheet';
import { TombolBertepi, TombolUtama } from './Tombol';
import { KesalahanTarget } from '@/data/target';
import { ketukBerhasil } from '@/lib/haptics';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  namaTipeHari: string;
  fase: Fase;
  /** `null` bila target ini belum pernah diisi: kolom mulai kosong. */
  tersimpan: NilaiTarget | null;
  /** Simpan satu target; melempar bila gagal (isian tetap ada), `KesalahanTarget` membawa pesannya. */
  simpan: (nilai: NilaiTarget) => Promise<void>;
};

const KOLOM: { kunci: KolomTarget; label: string; unit: string; akses: string }[] = [
  { kunci: 'kalori', label: 'Kalori', unit: 'kcal', akses: 'kalori dalam kilokalori' },
  { kunci: 'protein', label: 'Protein', unit: 'g', akses: 'protein dalam gram' },
  { kunci: 'lemak', label: 'Lemak', unit: 'g', akses: 'lemak dalam gram' },
  { kunci: 'satFat', label: 'Batas sat fat', unit: 'g', akses: 'batas sat fat dalam gram' },
];

/**
 * Sunting SATU target: kalori, protein, lemak, dan batas sat fat untuk satu
 * tipe hari di satu fase.
 *
 * Dibuka dari kartu atau sel matriks yang sedang dibaca, jadi mengubah satu
 * angka tidak perlu membuka form seluruh halaman. Di bawah kolom, kalori
 * dibagi ke makronya (protein, lemak, sisanya karbo) dan ikut bergerak saat
 * mengetik: menaikkan lemak 10 g memakan 90 kcal dari karbo, dan itu terlihat
 * sebelum disimpan, bukan setelah hari berjalan.
 *
 * Aturan pemeriksaan sama dengan form halaman (`periksaTarget`): galat tampil
 * setelah kolom ditinggalkan atau saat menyimpan.
 */
export function SheetSuntingTarget({ terbuka, onTutup, namaTipeHari, fase, tersimpan, simpan }: Props) {
  const awal = () => (tersimpan ? isianDariTarget(tersimpan) : ISIAN_KOSONG);
  const [isian, setIsian] = useState<IsianTarget>(awal);
  const [disentuh, setDisentuh] = useState<Partial<Record<KolomTarget, true>>>({});
  const [cobaSimpan, setCobaSimpan] = useState(false);
  const [status, setStatus] = useState<'diam' | 'menyimpan' | 'gagal'>('diam');
  const [pesanGagal, setPesanGagal] = useState('');

  useEffect(() => {
    if (!terbuka) return;
    setIsian(awal());
    setDisentuh({});
    setCobaSimpan(false);
    setStatus('diam');
    // Hanya saat dibuka: nilai tersimpan yang berubah sesudahnya berasal dari simpanan ini sendiri.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terbuka]);

  if (!terbuka) return null;

  const hasil = periksaTarget(isian);
  const galat = hasil.sah ? {} : hasil.galat;
  const tampilGalat = (k: KolomTarget) => Boolean(galat[k]) && (cobaSimpan || Boolean(disentuh[k]));
  const berubah = isianBerubah(isian, tersimpan);
  const menyimpan = status === 'menyimpan';
  const rincian = hasil.sah ? rincianKaloriMakro(hasil.nilai) : null;

  async function jalankan() {
    if (!hasil.sah) {
      setCobaSimpan(true);
      return;
    }
    setStatus('menyimpan');
    try {
      await simpan(hasil.nilai);
      ketukBerhasil();
      onTutup();
    } catch (e) {
      setPesanGagal(e instanceof KesalahanTarget ? e.message : 'Belum tersimpan. Periksa koneksi, lalu coba lagi; isian Anda masih di sini.');
      setStatus('gagal');
    }
  }

  return (
    <KerangkaSheet terbuka onTutup={menyimpan ? null : onTutup} label={`Target ${namaTipeHari}`}>
      <Text style={{ ...typography.title, color: colors.text }}>
        {namaTipeHari} · {fase}
      </Text>
      <Text style={{ ...typography.labelBiasa, color: colors.textMuted }}>
        {tersimpan
          ? `Tersimpan: ${formatAngka(tersimpan.target_kalori)} kcal. Perubahan berlaku mulai hari ini.`
          : 'Belum ada target untuk tipe hari ini di fase ini. Isi keempat angkanya; berlaku mulai hari ini.'}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {KOLOM.map((k) => (
          <InputTarget
            key={k.kunci}
            label={k.label}
            unit={k.unit}
            nilai={isian[k.kunci]}
            aksesLabel={`${namaTipeHari}, ${fase}: ${k.akses}`}
            ditandai={tampilGalat(k.kunci)}
            onUbah={(t) => {
              setIsian((x) => ({ ...x, [k.kunci]: t }));
              if (status === 'gagal') setStatus('diam');
            }}
            onTinggalkan={() => setDisentuh((d) => ({ ...d, [k.kunci]: true }))}
            nonaktif={menyimpan}
          />
        ))}
      </View>

      {KOLOM.some((k) => tampilGalat(k.kunci)) ? (
        <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
          {KOLOM.filter((k) => tampilGalat(k.kunci)).map((k) => (
            <Text key={k.kunci} style={{ ...typography.labelBiasa, color: colors.aksenTeks.coral }}>
              {galat[k.kunci]}
            </Text>
          ))}
        </View>
      ) : null}

      {rincian ? <RincianKalori rincian={rincian} /> : (
        <Text style={{ ...typography.labelBiasa, color: colors.textFaint }}>
          Pembagian kalori muncul setelah isian lengkap dan sah.
        </Text>
      )}

      {status === 'gagal' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.aksenTeks.coral }}>
          {pesanGagal}
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <TombolUtama label="Simpan" nonaktif={!berubah} memproses={menyimpan} onPress={() => void jalankan()} />
        <TombolBertepi label="Batal" onPress={onTutup} nonaktif={menyimpan} />
      </View>
    </KerangkaSheet>
  );
}

/** Kalori terbagi ke makro: satu bar bertumpuk, dan angkanya ditulis — tidak pernah warna saja. */
function RincianKalori({ rincian }: { rincian: ReturnType<typeof rincianKaloriMakro> }) {
  const bagian = [
    { kunci: 'protein', label: 'Protein', kkal: rincian.proteinKkal, persen: rincian.persen.protein, warna: colors.macro.protein },
    { kunci: 'lemak', label: 'Lemak', kkal: rincian.lemakKkal, persen: rincian.persen.lemak, warna: colors.macro.lemak },
    { kunci: 'karbo', label: 'Sisa (karbo)', kkal: rincian.karboKkal, persen: rincian.persen.karbo, warna: colors.macro.karbo },
  ];
  return (
    <View
      accessible
      accessibilityLabel={`Pembagian kalori: ${bagian.map((b) => `${b.label} ${formatAngka(b.kkal)} kilokalori, ${b.persen} persen`).join('; ')}`}
      style={{ gap: spacing.sm }}
    >
      <Text style={{ ...typography.caption, color: colors.textMuted }}>PEMBAGIAN KALORI</Text>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: radius.pill, overflow: 'hidden', gap: spacing.xxs, backgroundColor: colors.surfaceSunken }}>
        {bagian.filter((b) => b.persen > 0).map((b) => (
          <View key={b.kunci} style={{ flex: b.persen, backgroundColor: b.warna }} />
        ))}
      </View>
      <View style={{ gap: spacing.xxs }}>
        {bagian.map((b) => (
          <View key={b.kunci} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.labelBiasa, color: colors.textMuted }}>{b.label}</Text>
            <Text style={{ ...typography.label, color: colors.text }}>
              {formatAngka(b.kkal)} kcal · {b.persen}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
