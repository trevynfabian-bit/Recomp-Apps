import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { formatDesimal } from '@recomp/logika';
import { ketukBerhasil } from '@/lib/haptics';
import { colors, spacing, tint, typography, ukuran } from '@/theme';
import { KerangkaSheet } from './KerangkaSheet';
import { Tombol } from './Tombol';
import { Panel } from './Card';
import { PemilihAngka, uraiAngka } from './Pemilih';
import { Chip } from './Chip';

/** Satu ketukan tombol −/+ (cm). */
const LANGKAH_CM = 0.5;
const BATAS_MIN = 50;
const BATAS_MAKS = 160;

type StatusSimpan = 'idle' | 'menyimpan' | 'tersimpan' | 'gagal';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  /** Batas yang berlaku sekarang; null bila belum pernah ditetapkan. */
  batasCm: number | null;
  /** Lingkar pinggang terakhir — pembanding hidup saat menggeser batas. */
  pinggangSekarangCm: number;
  /** Lingkar pinggang pada pencatatan pertama, dipakai sebagai saran jangkar. */
  pinggangAwalCm: number | null;
  onSimpan: (batasCm: number) => void | Promise<void>;
};

/**
 * Pengaturan batas pinggang.
 *
 * Batas ini bukan target dan bukan penilaian — ia GARIS KEPUTUSAN. Saat Lean
 * Gain, sebagian kenaikan berat memang lemak; yang perlu diputuskan adalah
 * seberapa banyak yang masih bersedia diterima sebelum beralih ke Cut. Kalau
 * angkanya tidak ditetapkan di muka, keputusan itu diambil belakangan dengan
 * angka yang sudah terlanjur naik, dan hampir selalu ditunda.
 *
 * Karena itu sheet ini selalu menampilkan JARAK ke pinggang sekarang saat
 * angkanya digeser: batas yang berarti "sisa 0,2 cm" dan batas yang berarti
 * "sisa 3 cm" adalah dua keputusan yang sangat berbeda, dan itu tidak terlihat
 * dari angka batasnya sendiri.
 */
export function SheetBatasPinggang({
  terbuka,
  onTutup,
  batasCm,
  pinggangSekarangCm,
  pinggangAwalCm,
  onSimpan,
}: Props) {
  const nilaiAwal = batasCm ?? bulat(pinggangSekarangCm + 2);
  const [draf, setDraf] = useState(() => formatDesimal(nilaiAwal));
  const [status, setStatus] = useState<StatusSimpan>('idle');

  useEffect(() => {
    if (!terbuka) return;
    setDraf(formatDesimal(nilaiAwal));
    setStatus('idle');
  }, [terbuka, nilaiAwal]);

  const angka = uraiAngka(draf);
  const valid = angka !== null && angka >= BATAS_MIN && angka <= BATAS_MAKS;
  const sisa = angka !== null ? bulat(angka - pinggangSekarangCm) : null;
  const sudahLewat = sisa !== null && sisa < 0;

  /** Jangkar konkret; angka batas jauh lebih mudah dipilih relatif terhadap sesuatu. */
  const saran = [
    { label: '+1,0 cm dari sekarang', nilai: bulat(pinggangSekarangCm + 1) },
    { label: '+2,0 cm dari sekarang', nilai: bulat(pinggangSekarangCm + 2) },
    ...(pinggangAwalCm !== null && pinggangAwalCm !== pinggangSekarangCm
      ? [{ label: `pinggang awal (${formatDesimal(pinggangAwalCm)})`, nilai: bulat(pinggangAwalCm) }]
      : []),
  ];

  async function simpan() {
    if (!valid || angka === null) return;
    setStatus('menyimpan');
    try {
      await onSimpan(Math.round(angka * 10) / 10);
      ketukBerhasil();
      setStatus('tersimpan');
      setTimeout(onTutup, 650);
    } catch {
      setStatus('gagal');
    }
  }

  const terkunci = status === 'menyimpan' || status === 'tersimpan';

  return (
    <KerangkaSheet terbuka={terbuka} onTutup={onTutup} label="Batas pinggang">
      {/* − 86,0 cm + */}
      <PemilihAngka
        nilai={draf}
        onUbah={(t) => {
          setDraf(t);
          if (status === 'gagal') setStatus('idle');
        }}
        langkah={LANGKAH_CM}
        min={BATAS_MIN}
        maks={BATAS_MAKS}
        cadangan={angka ?? nilaiAwal}
        unit="cm"
        unitAkses="sentimeter"
        aksesLabel="Batas pinggang dalam sentimeter"
        galat={valid ? null : `Masukkan batas antara ${BATAS_MIN} dan ${BATAS_MAKS} cm.`}
      />

      {!valid ? null : (
        /* Jarak ke pinggang sekarang — arti sebenarnya dari angka di atas. */
        <Panel style={{ gap: spacing.xs, borderWidth: 1, borderColor: sudahLewat ? tint(colors.status.bahaya.isian, 'tepi') : 'transparent' }}>
          <Text
            style={{
              ...typography.label,
              color: sudahLewat ? colors.status.bahaya.teks : colors.teks,
            }}
          >
            {sisa === 0
              ? 'Pas di batas'
              : sudahLewat
                ? `Sudah ${formatDesimal(Math.abs(sisa!))} cm di atas batas ini`
                : `Sisa ${formatDesimal(sisa!)} cm sampai batas`}
          </Text>
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            Pinggang terakhir Anda {formatDesimal(pinggangSekarangCm)} cm.
            {sudahLewat
              ? ' Menetapkan batas di bawah angka sekarang boleh saja — artinya sinyalnya aktif sejak hari ini.'
              : ''}
          </Text>
        </Panel>
      )}

      {/* Jangkar siap pakai */}
      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
          Pilih cepat
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {saran.map((s) => (
            <Chip
              key={s.label}
              label={`${formatDesimal(s.nilai)} · ${s.label}`}
              aksesLabel={`Setel batas ke ${formatDesimal(s.nilai)} sentimeter, ${s.label}`}
              onPress={() => setDraf(formatDesimal(s.nilai))}
            />
          ))}
        </View>
      </View>

      {/* Apa arti batas ini, supaya tidak terbaca sebagai target. */}
      <Text style={{ ...typography.caption, color: colors.teksSamar }}>
        Batas ini bukan target dan bukan penilaian atas tubuh Anda — ia garis keputusan. Saat
        Lean Gain, sebagian kenaikan berat memang lemak; yang perlu diputuskan adalah berapa
        banyak yang masih bersedia Anda terima sebelum beralih ke Cut. Menetapkannya SEKARANG,
        saat angkanya belum naik, jauh lebih mudah daripada memutuskannya nanti — dan itulah
        sebabnya keputusan ini hampir selalu tertunda.
      </Text>

      {status === 'gagal' ? (
        <Panel nada="bahaya" style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.label, color: colors.status.bahaya.teks }}>
            Gagal menyimpan
          </Text>
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            Angka Anda masih ada di layar ini. Coba lagi.
          </Text>
        </Panel>
      ) : null}

      <View style={{ gap: spacing.md, paddingBottom: spacing.xl }}>
        <Tombol
          label={labelSimpan(status)}
          onPress={() => void simpan()}
          nonaktif={!valid}
          memproses={status === 'menyimpan'}
          berhasil={status === 'tersimpan'}
        />

        <Tombol
          varian="teks"
          ukuran="kecil"
          nada="netral"
          label="Batal"
          nonaktif={terkunci}
          sejajar="tengah"
          onPress={onTutup}
        />
      </View>
    </KerangkaSheet>
  );
}

function labelSimpan(status: StatusSimpan): string {
  switch (status) {
    case 'menyimpan':
      return 'Menyimpan…';
    case 'tersimpan':
      return 'Tersimpan';
    case 'gagal':
      return 'Coba lagi';
    default:
      return 'Simpan batas';
  }
}

function bulat(n: number): number {
  return Math.round(n * 10) / 10;
}
