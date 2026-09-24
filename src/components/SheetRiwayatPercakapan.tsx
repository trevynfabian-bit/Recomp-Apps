import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { formatJam, labelTanggalRelatif, tanggalDariWaktu, tanggalHariIni } from '@recomp/logika';
import { ketukRingan } from '@/lib/haptics';
import type { Percakapan } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, tint, typography, ukuran } from '@/theme';
import { Tombol } from './Tombol';

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
    <Modal visible={terbuka} transparent animationType="slide" onRequestClose={onTutup}>
      <View style={{ flex: 1, backgroundColor: colors.selubung, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Tutup" onPress={onTutup} style={{ flex: 1 }} />

        <View
          style={{
            maxHeight: '80%',
            backgroundColor: colors.permukaan,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.garis,
          }}
        >
          <View
            style={{
              alignItems: 'center',
              paddingTop: spacing.md,
              paddingBottom: spacing.md,
              gap: spacing.sm,
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
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
              Riwayat percakapan
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
            <Tombol label="Percakapan baru" aksesLabel="Mulai percakapan baru" onPress={onBaru} />

            {urut.length === 0 ? (
              <Text
                style={{
                  ...typography.caption,
                  color: colors.teksSamar,
                  textAlign: 'center',
                  paddingVertical: spacing.xl,
                }}
              >
                Belum ada percakapan tersimpan.
              </Text>
            ) : (
              urut.map((p) => {
                const aktif = p.id === aktifId;
                const tanggal = tanggalDariWaktu(p.diperbaruiPada);
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: aktif }}
                    accessibilityLabel={`Buka percakapan: ${p.judul}`}
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
                      <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                        {labelTanggalRelatif(tanggal, hariIni)} · {formatJam(p.diperbaruiPada)}
                      </Text>
                      <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                        · {p.pesan.length} pesan
                      </Text>
                      {aktif ? (
                        <Text style={{ ...typography.caption, color: colors.aksen.teks }}>· dibuka</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={{ padding: spacing.lg, paddingTop: 0 }}>
            <Tombol
              varian="teks"
              ukuran="kecil"
              nada="netral"
              label="Tutup"
              sejajar="tengah"
              onPress={onTutup}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
