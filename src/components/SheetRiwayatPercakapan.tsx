import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { formatJam, labelTanggalRelatif, tanggalDariWaktu, tanggalHariIni } from '@recomp/logika';
import { ketukRingan } from '@/lib/haptics';
import type { Percakapan } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, typography, ukuran } from '@/theme';

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
      <View style={{ flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Tutup" onPress={onTutup} style={{ flex: 1 }} />

        <View
          style={{
            maxHeight: '80%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.border,
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
                backgroundColor: colors.border,
              }}
            />
            <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
              Riwayat percakapan
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mulai percakapan baru"
              onPress={() => {
                ketukRingan();
                onBaru();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                minHeight: TAP_MIN,
                paddingVertical: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: colors.amber,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ ...typography.bodyTebal, color: colors.diAtasIsian }}>
                Percakapan baru
              </Text>
            </Pressable>

            {urut.length === 0 ? (
              <Text
                style={{
                  ...typography.caption,
                  color: colors.textFaint,
                  textAlign: 'center',
                  paddingVertical: spacing.xl,
                  lineHeight: 16,
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
                      borderColor: aktif ? colors.amber : colors.borderKuat,
                      backgroundColor: aktif ? colors.amber + '14' : colors.surfaceSunken,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text
                      numberOfLines={2}
                      style={{ ...typography.body, color: aktif ? colors.text : colors.textMuted }}
                    >
                      {p.judul}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={{ ...typography.caption, color: colors.textFaint }}>
                        {labelTanggalRelatif(tanggal, hariIni)} · {formatJam(p.diperbaruiPada)}
                      </Text>
                      <Text style={{ ...typography.caption, color: colors.textFaint }}>
                        · {p.pesan.length} pesan
                      </Text>
                      {aktif ? (
                        <Text style={{ ...typography.caption, color: colors.amber }}>· dibuka</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={{ padding: spacing.lg, paddingTop: 0 }}>
            <Pressable
              accessibilityRole="button"
              onPress={onTutup}
              style={{ minHeight: TAP_MIN, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ ...typography.label, color: colors.textFaint }}>Tutup</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
