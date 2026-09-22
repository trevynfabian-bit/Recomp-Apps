import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTanggalPanjang, tanggalHariIni } from '@recomp/logika';
import { GelembungMengetik, GelembungPesan, InputChat, Pill } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { useProfil } from '@/state/profil';
import { balasCoachStub, mockPercakapan, SARAN_PERTANYAAN } from '@/mocks/coach';
import type { PesanCoach } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Layar chat AI Coach.
 *
 * Fase 1 frontend: balasan datang dari stub di `@/mocks/coach`, dan seluruh
 * percakapan hidup di state layar ini. Kontrak yang diasumsikan ke backend
 * sederhana — kirim teks pertanyaan, terima teks jawaban — sehingga task layer
 * backend cukup menukar `balasCoachStub` dengan panggilan Edge Function tanpa
 * mengubah layout maupun keadaan di sini.
 *
 * Keadaan yang sengaja dibangun sejak awal, bukan ditempel belakangan:
 * "mengirim", "gagal + coba lagi", dan "coach sedang menyusun". Chat yang cuma
 * punya jalur bahagia akan terlihat rusak begitu jaringan sekali saja meleset,
 * dan itu pasti terjadi di ponsel.
 */
export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const { profil } = useProfil();
  const [pesan, setPesan] = useState<PesanCoach[]>(mockPercakapan);
  const [menjawab, setMenjawab] = useState(false);
  const gulungRef = useRef<ScrollView>(null);

  /** Selalu turun ke pesan terbaru; itu yang dicari setelah mengirim. */
  const keBawah = useCallback(() => {
    requestAnimationFrame(() => gulungRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const tanya = useCallback(
    async (teks: string) => {
      const id = `m-${Date.now()}`;
      const milikPengguna: PesanCoach = {
        id,
        peran: 'pengguna',
        teks,
        waktu: new Date().toISOString(),
        status: 'mengirim',
      };
      setPesan((p) => [...p, milikPengguna]);
      setMenjawab(true);
      keBawah();

      try {
        const jawaban = await balasCoachStub(teks);
        setPesan((p) => [
          ...p.map((m) => (m.id === id ? { ...m, status: 'terkirim' as const } : m)),
          {
            id: `${id}-balas`,
            peran: 'coach',
            teks: jawaban,
            waktu: new Date().toISOString(),
          },
        ]);
      } catch {
        // Pesan pengguna TETAP di daftar dengan tanda gagal — menghapusnya
        // berarti menghilangkan apa yang sudah ia ketik.
        setPesan((p) => p.map((m) => (m.id === id ? { ...m, status: 'gagal' as const } : m)));
      } finally {
        setMenjawab(false);
        keBawah();
      }
    },
    [keBawah],
  );

  /** Kirim ulang pesan yang gagal: buang yang lama, kirim isinya lagi. */
  const cobaLagi = useCallback(
    (gagal: PesanCoach) => {
      setPesan((p) => p.filter((m) => m.id !== gagal.id));
      void tanya(gagal.teks);
    },
    [tanya],
  );

  const kosong = pesan.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.bottom + 48}
    >
      {/* Kepala layar tidak ikut menggulung: nama coach dan cakupan datanya
          adalah konteks yang perlu tetap terlihat saat membaca jawaban. */}
      <View
        style={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
          gap: spacing.xs,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...typography.title, color: colors.text }}>Coach</Text>
          <Pill label={profil.fase_aktif.toUpperCase()} warna={colors.amber} />
        </View>
        <Text style={{ ...typography.caption, color: colors.textFaint }}>
          Membaca data Anda sampai {formatTanggalPanjang(tanggalHariIni())}
        </Text>
      </View>

      <ScrollView
        ref={gulungRef}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={keBawah}
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.lg,
          flexGrow: 1,
          justifyContent: kosong ? 'center' : 'flex-start',
        }}
      >
        {kosong ? (
          <View style={{ alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg }}>
            <Text style={{ ...typography.body, color: colors.textMuted, textAlign: 'center' }}>
              Belum ada percakapan
            </Text>
            <Text
              style={{
                ...typography.caption,
                color: colors.textFaint,
                textAlign: 'center',
                lineHeight: 16,
              }}
            >
              Coach membaca log harian, tren berat, ukuran tubuh, dan budget mingguan Anda —
              jadi pertanyaannya boleh langsung soal angka Anda sendiri.
            </Text>
          </View>
        ) : (
          pesan.map((m) => <GelembungPesan key={m.id} pesan={m} onCobaLagi={cobaLagi} />)
        )}

        {menjawab ? <GelembungMengetik /> : null}
      </ScrollView>

      {/* Saran pertanyaan: menghemat mengetik sekaligus memberi tahu coach ini
          bisa ditanya apa. Disembunyikan saat coach sedang menjawab. */}
      {!menjawab ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
          }}
        >
          {SARAN_PERTANYAAN.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`Tanyakan: ${s}`}
              onPress={() => {
                ketukRingan();
                void tanya(s);
              }}
              style={({ pressed }) => ({
                minHeight: TAP_MIN,
                justifyContent: 'center',
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.borderKuat,
                backgroundColor: colors.surfaceSunken,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ ...typography.label, color: colors.textMuted }}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={{ paddingBottom: insets.bottom + spacing.sm }}>
        <InputChat sibuk={menjawab} onKirim={(t) => void tanya(t)} />
      </View>
    </KeyboardAvoidingView>
  );
}
