import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { formatDesimal, formatTanggalPanjang, majuHari } from '@recomp/logika';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, typography, ukuran, ukuranIkon } from '@/theme';
import { TombolIkon } from './Tombol';

/** Urai angka ketikan pengguna; koma maupun titik diterima sebagai desimal. */
export function uraiAngka(teks: string): number | null {
  const bersih = teks.replace(',', '.').trim();
  if (bersih === '') return null;
  const n = Number(bersih);
  return Number.isFinite(n) ? n : null;
}

type PropsAngka = {
  /** Draf teks yang sedang tampil (dikelola pemanggil, supaya bisa divalidasi). */
  nilai: string;
  onUbah: (teks: string) => void;
  /** Besar satu ketukan −/+, mis. 0,1 kg atau 0,5 cm. */
  langkah: number;
  min: number;
  maks: number;
  /** Nilai awal −/+ bila draf kosong/tidak terbaca. */
  cadangan: number;
  unit: string;
  /** Nama satuan untuk pembaca layar, mis. "kilogram". */
  unitAkses: string;
  /** Label pembaca layar untuk kolomnya, mis. "Berat dalam kilogram". */
  aksesLabel: string;
  /** Kalimat galat di bawah angka; angka ikut berwarna bahaya. */
  galat?: string | null;
  /** Jumlah desimal hasil −/+ (bawaan 1). */
  desimal?: number;
};

/**
 * Pemilih angka (bab Desain 8.6): − [angka besar yang bisa diketik] +.
 *
 * Satu-satunya tempat angka input sebesar ini dibuat, jadi pengecualian ukuran
 * hurufnya (52 pt, di antara `display` dan `hero`) juga hanya di sini — angka
 * ini bukan angka hero layar, tetapi harus terbaca sekali lirik saat dicatat
 * dengan satu tangan. Tombol −/+ 56 pt karena ditekan berulang.
 */
export function PemilihAngka({
  nilai,
  onUbah,
  langkah,
  min,
  maks,
  cadangan,
  unit,
  unitAkses,
  aksesLabel,
  galat,
  desimal = 1,
}: PropsAngka) {
  const faktor = 10 ** desimal;
  const langkahTeks = formatDesimal(langkah, desimal);

  function geser(arah: 1 | -1) {
    const dasar = uraiAngka(nilai) ?? cadangan;
    const berikut = Math.min(Math.max(dasar + arah * langkah, min), maks);
    // Bulatkan supaya tidak muncul galat pembulatan biner (74,60000001).
    onUbah(formatDesimal(Math.round(berikut * faktor) / faktor, desimal));
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <TombolLangkah ikon="remove" aksesLabel={`Kurangi ${langkahTeks} ${unitAkses}`} onPress={() => geser(-1)} />
        {/* `flex: 1` menahan grup tengah agar tombol + tidak terdorong keluar layar. */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: spacing.xs }}>
          <TextInput
            value={nilai}
            onChangeText={onUbah}
            keyboardType="decimal-pad"
            inputMode="decimal"
            selectTextOnFocus
            accessibilityLabel={aksesLabel}
            accessibilityHint={galat ?? undefined}
            style={{
              ...typography.hero,
              fontSize: 52,
              lineHeight: 60,
              // Lebar eksplisit: tanpa ini input memakai lebar bawaannya
              // (~20 karakter) dan mendorong tombol + keluar layar.
              width: ukuran.kolomAngka,
              color: galat ? colors.status.bahaya.teks : colors.teks,
              textAlign: 'center',
              padding: 0,
              outlineWidth: 0,
            }}
          />
          <Text style={{ ...typography.title, color: colors.teksSamar }}>{unit}</Text>
        </View>
        <TombolLangkah ikon="add" aksesLabel={`Tambah ${langkahTeks} ${unitAkses}`} onPress={() => geser(1)} />
      </View>
      {galat ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ ...typography.caption, color: colors.status.bahaya.teks, textAlign: 'center' }}
        >
          {galat}
        </Text>
      ) : null}
    </View>
  );
}

/** Tombol bulat −/+ 56 pt. */
function TombolLangkah({
  ikon,
  aksesLabel,
  onPress,
}: {
  ikon: 'add' | 'remove';
  aksesLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aksesLabel}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        width: ukuran.tombolLangkah,
        height: ukuran.tombolLangkah,
        borderRadius: radius.pill,
        backgroundColor: colors.permukaanCekung,
        borderWidth: 1,
        borderColor: colors.garisKontrol,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={ikon} size={ukuranIkon.besar} color={colors.teks} />
    </Pressable>
  );
}

type PropsTanggal = {
  /** Tanggal `YYYY-MM-DD` (Asia/Jakarta). */
  tanggal: string;
  onUbah: (tanggal: string) => void;
  /** Hari ini, `YYYY-MM-DD`; tanggal tidak bisa melewatinya. */
  hariIni: string;
  /** Paling jauh berapa hari ke belakang. */
  mundurMaks: number;
  /** Keterangan di bawah tanggal selain hari ini (bawaan "tanggal pencatatan"). */
  keterangan?: string;
};

/**
 * Pemilih tanggal (bab Desain 8.6): ‹ tanggal › untuk menggeser sehari, karena
 * pencatatan hampir selalu hari ini atau beberapa hari sebelumnya — kalender
 * penuh terlalu jauh untuk tugas itu. Tombol di batas rentang dinonaktifkan,
 * bukan diam-diam tidak bereaksi.
 */
export function PemilihTanggal({ tanggal, onUbah, hariIni, mundurMaks, keterangan = 'tanggal pencatatan' }: PropsTanggal) {
  const batasBawah = majuHari(hariIni, -mundurMaks);
  const bisaMundur = tanggal > batasBawah;
  const bisaMaju = tanggal < hariIni;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <TombolIkon
        ikon="chevron-back"
        aksesLabel="Tanggal sehari lebih awal"
        nonaktif={!bisaMundur}
        onPress={() => onUbah(majuHari(tanggal, -1))}
      />
      <View accessibilityLiveRegion="polite" style={{ flex: 1, alignItems: 'center', gap: spacing.xxs }}>
        <Text style={{ ...typography.body, color: colors.teks }}>{formatTanggalPanjang(tanggal)}</Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          {tanggal === hariIni ? 'hari ini' : keterangan}
        </Text>
      </View>
      <TombolIkon
        ikon="chevron-forward"
        aksesLabel="Tanggal sehari lebih akhir"
        nonaktif={!bisaMaju}
        onPress={() => onUbah(majuHari(tanggal, 1))}
      />
    </View>
  );
}
