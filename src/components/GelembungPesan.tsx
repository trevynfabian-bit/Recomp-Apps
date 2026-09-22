import { Pressable, Text, View } from 'react-native';
import { formatJam } from '@recomp/logika';
import { DaftarRujukan } from './DaftarRujukan';
import { KartuRingkasanMingguan } from './KartuRingkasanMingguan';
import { KartuWidgetCoach } from './KartuWidgetCoach';
import { ketukRingan } from '@/lib/haptics';
import type { PesanCoach } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

type Props = {
  pesan: PesanCoach;
  /** Mengirim pertanyaan lanjutan dari kartu ringkasan mingguan. */
  onTanya?: (pertanyaan: string) => void;
  /**
   * Tampilkan jam di bawah gelembung. Hanya pesan TERAKHIR dalam satu rentetan
   * yang diberi jam — memberi jam ke setiap gelembung mengubah percakapan jadi
   * log server, dan yang dicari orang hanyalah "kapan bagian ini terjadi".
   */
  tampilkanJam?: boolean;
  /** Mengirim ulang pesan yang gagal, tanpa mengetik ulang. */
  onCobaLagi?: (pesan: PesanCoach) => void;
};

/**
 * Satu gelembung pesan.
 *
 * Pesan COACH tidak diberi latar beraksen. Jawabannya panjang dan penuh angka;
 * latar berwarna akan menurunkan kontras teks panjang justru di tempat yang
 * paling banyak dibaca. Pesan PENGGUNA boleh, karena selalu pendek — dan
 * perbedaan latar itu yang membuat kedua peran terbaca sekilas tanpa harus
 * melacak sisi mana gelembungnya menempel.
 */
export function GelembungPesan({
  pesan,
  tampilkanJam = false,
  onCobaLagi,
  onTanya,
}: Props) {
  const dariPengguna = pesan.peran === 'pengguna';
  const gagal = pesan.status === 'gagal';

  // Ringkasan mingguan bukan balasan, jadi ia tidak pernah jadi gelembung.
  if (pesan.ringkasan) {
    return (
      <View style={{ gap: spacing.xs }}>
        <KartuRingkasanMingguan ringkasan={pesan.ringkasan} onTanya={onTanya ?? (() => {})} />
        {tampilkanJam ? (
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            {formatJam(pesan.waktu)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={{
        alignItems: dariPengguna ? 'flex-end' : 'flex-start',
        gap: spacing.xs,
      }}
    >
      <View
        accessibilityRole="text"
        accessibilityLabel={`${dariPengguna ? 'Anda' : 'Coach'}: ${pesan.teks}`}
        style={{
          maxWidth: '88%',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.lg,
          // Sudut yang menempel ke sisinya dibuat kecil: penanda arah bicara
          // yang tetap terbaca tanpa warna.
          borderBottomRightRadius: dariPengguna ? radius.sm : radius.lg,
          borderBottomLeftRadius: dariPengguna ? radius.lg : radius.sm,
          backgroundColor: dariPengguna ? colors.amber + '14' : colors.surface,
          borderWidth: 1,
          borderColor: gagal
            ? colors.coral + '55'
            : dariPengguna
              ? colors.amber + '33'
              : colors.border,
          opacity: pesan.status === 'mengirim' ? 0.6 : 1,
        }}
      >
        <Text
          style={{
            ...typography.body,
            color: colors.text,
            // 24px pada teks 16px: jawaban coach sering lima kalimat, dan
            // lineHeight rapat membuatnya terbaca seperti dinding.
            lineHeight: 24,
          }}
        >
          {pesan.teks}
        </Text>
      </View>

      {/* Kartu angka hasil function calling: dirender app dari data asli,
          jadi angkanya tidak pernah berbeda dari layar lain. */}
      {pesan.widget?.map((w) => (
        <KartuWidgetCoach key={`${w.fungsi}-${w.label}`} widget={w} />
      ))}

      {/* Asal angka menempel pada jawaban yang memakainya, bukan di satu
          tempat terpisah — kalau harus dicari, ia tidak akan dibaca. */}
      {pesan.rujukan && pesan.rujukan.length > 0 ? (
        <DaftarRujukan rujukan={pesan.rujukan} />
      ) : null}

      {tampilkanJam && !gagal ? (
        <Text style={{ ...typography.caption, color: colors.textFaint }}>
          {formatJam(pesan.waktu)}
        </Text>
      ) : null}

      {gagal ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ ...typography.caption, color: colors.aksenTeks.coral }}>
            Gagal terkirim
          </Text>
          {onCobaLagi ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kirim ulang pesan"
              onPress={() => {
                ketukRingan();
                onCobaLagi(pesan);
              }}
              style={({ pressed }) => ({
                minHeight: TAP_MIN,
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ ...typography.label, color: colors.amber }}>Coba lagi</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Penanda coach sedang menyusun jawaban.
 *
 * Bentuknya sengaja menyerupai gelembung coach yang kosong, bukan spinner di
 * tengah layar: yang ditunggu adalah SATU pesan berikutnya, dan menaruh
 * penandanya di tempat pesan itu akan muncul membuat perpindahannya tidak
 * mengagetkan.
 */
export function GelembungMengetik() {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <View
        accessibilityRole="text"
        accessibilityLabel="Coach sedang menyusun jawaban"
        style={{
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.lg,
          borderBottomLeftRadius: radius.sm,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ ...typography.caption, color: colors.textFaint }}>
          Coach sedang membaca data Anda…
        </Text>
      </View>
    </View>
  );
}

/**
 * Pemisah tanggal di antara kelompok pesan.
 *
 * Garis tipis di kiri-kanan label, bukan pill melayang: pemisah ini kerangka,
 * bukan data, jadi ia memakai warna garis dekoratif dan tidak pernah menarik
 * perhatian lebih dari gelembung di sekitarnya.
 */
export function PemisahTanggal({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <Text style={{ ...typography.caption, color: colors.textFaint }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}
