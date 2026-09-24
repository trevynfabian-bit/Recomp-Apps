import { Pressable, Text, View } from 'react-native';
import { formatJam, labelTanggalRelatif, tanggalDariWaktu, tanggalHariIni } from '@recomp/logika';
import { ketukRingan } from '@/lib/haptics';
import type { Percakapan } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, tint, typography, ukuran } from '@/theme';
import { KeadaanKosong } from './Keadaan';
import { Tombol } from './Tombol';
import { KerangkaSheet } from './KerangkaSheet';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  /** Seluruh utas; urutan di layar ditentukan komponen ini, bukan pemanggil. */
  daftar: Percakapan[];
  aktifId: string;
  onPilih: (id: string) => void;
  onBaru: () => void;
};

/**
 * Daftar riwayat percakapan.
 *
 * Utas diurutkan menurut PESAN TERAKHIR, bukan menurut kapan utasnya dibuat:
 * percakapan yang dilanjutkan kemarin lebih mungkin dicari daripada yang
 * dimulai bulan lalu lalu ditinggalkan.
 *
 * Yang ditampilkan per baris adalah pertanyaan pertama pengguna (judulnya) dan
 * kapan terakhir dijawab — dua hal yang dipakai orang untuk mengenali kembali
 * percakapan lama. Cuplikan jawaban coach sengaja tidak dipakai: isinya
 * seragam berisi angka, sehingga semua baris terlihat mirip.
 */
export function SheetRiwayatPercakapan({
  terbuka,
  onTutup,
  daftar,
  aktifId,
  onPilih,
  onBaru,
}: Props) {
  const hariIni = tanggalHariIni();
  const urut = [...daftar].sort((a, b) => b.diperbaruiPada.localeCompare(a.diperbaruiPada));

  return (
    <KerangkaSheet terbuka={terbuka} onTutup={onTutup} label="Riwayat percakapan">
      <Tombol label="Percakapan baru" aksesLabel="Mulai percakapan baru" onPress={onBaru} />

      {urut.length === 0 ? (
        <View style={{ paddingVertical: spacing.lg }}>
          <KeadaanKosong
            tampilan="polos"
            judul="Belum ada percakapan tersimpan"
            keterangan="Setiap percakapan dengan Coach tersimpan otomatis dan muncul di sini."
          />
        </View>
      ) : (
        // Dikelompokkan per hari (terbaru dulu), jam di tiap baris: tanggal yang
        // sama tidak diulang di setiap percakapan.
        kelompokkan(urut, hariIni).map((grup) => (
          <View key={grup.tanggal} style={{ gap: spacing.sm }}>
            <Text
              accessibilityRole="header"
              style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase', marginTop: spacing.sm }}
            >
              {grup.label}
            </Text>
            {grup.percakapan.map((p) => {
            const aktif = p.id === aktifId;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                aria-selected={aktif}
                accessibilityLabel={`Buka percakapan: ${p.judul}, ${grup.label} pukul ${formatJam(p.diperbaruiPada)}, ${p.pesan.length} pesan${aktif ? ', sedang dibuka' : ''}`}
                onPress={() => {
                  ketukRingan();
                  onPilih(p.id);
                }}
                style={({ pressed }) => ({
                  gap: spacing.xs,
                  minHeight: TAP_MIN,
                  justifyContent: 'center',
                  padding: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: aktif ? colors.aksen.isian : colors.garisKontrol,
                  backgroundColor: aktif ? tint(colors.aksen.isian, 'pilih') : colors.permukaanCekung,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  numberOfLines={2}
                  style={{ ...typography.body, color: aktif ? colors.teks : colors.teksRedup }}
                >
                  {p.judul}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={{ ...typography.caption, color: colors.teksRedup }}>
                    {formatJam(p.diperbaruiPada)}
                  </Text>
                  <Text style={{ ...typography.caption, color: colors.teksRedup }}>
                    · {p.pesan.length} pesan
                  </Text>
                  {aktif ? (
                    <Text style={{ ...typography.caption, color: colors.aksen.teks }}>· dibuka</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          </View>
        ))
      )}

      <Tombol
        varian="teks"
        ukuran="kecil"
        nada="netral"
        label="Tutup"
        sejajar="tengah"
        onPress={onTutup}
      />
    </KerangkaSheet>
  );
}

/** Percakapan (sudah urut terbaru dulu) dikelompokkan per tanggal Jakarta. */
function kelompokkan(urut: Percakapan[], hariIni: string) {
  const grup: { tanggal: string; label: string; percakapan: Percakapan[] }[] = [];
  for (const p of urut) {
    const tanggal = tanggalDariWaktu(p.diperbaruiPada);
    const akhir = grup[grup.length - 1];
    if (akhir && akhir.tanggal === tanggal) akhir.percakapan.push(p);
    else grup.push({ tanggal, label: labelTanggalRelatif(tanggal, hariIni), percakapan: [p] });
  }
  return grup;
}
