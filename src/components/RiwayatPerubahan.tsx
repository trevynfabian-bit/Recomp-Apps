import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatDesimal, formatTanggalPanjang, ringkasPerubahan } from '@recomp/logika';
import { Card } from './Card';
import { GrafikUkuran } from './GrafikUkuran';
import { SectionHeader } from './SectionHeader';
import { ketukRingan } from '@/lib/haptics';
import type { BarisUkuran, UkuranTubuh } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, tint, typography } from '@/theme';
import { formatSelisih } from '@/lib/formatTampilan';

type KunciUkuran = BarisUkuran['kunci'];

type Props = {
  /** Seluruh pencatatan, urut lama → baru. */
  catatan: UkuranTubuh[];
  bagian: { kunci: KunciUkuran; label: string }[];
  /** Bagian yang ditampilkan pertama kali. */
  awal?: KunciUkuran;
};

/**
 * Riwayat perubahan ukuran mingguan.
 *
 * Dibangun per BAGIAN TUBUH, bukan per tanggal, karena pertanyaannya selalu
 * berbentuk "pinggang saya gimana?" — bukan "tanggal 15 September isinya apa?".
 * Tujuh bagian sekaligus juga tidak muat dibaca di layar telepon tanpa menjadi
 * tabel yang harus digeser ke samping.
 *
 * Yang ditampilkan perubahannya, bukan deret nilai mentah: "85,4 — 85,2 — 84,8"
 * memaksa orang mengurangi sendiri di kepala setiap kali membacanya.
 */
export function RiwayatPerubahan({ catatan, bagian, awal = 'pinggang_cm' }: Props) {
  const [terpilih, setTerpilih] = useState<KunciUkuran>(awal);
  const label = bagian.find((b) => b.kunci === terpilih)?.label ?? 'Ukuran';

  const { titik, ringkasan } = useMemo(() => {
    const titik = catatan.map((u) => ({ tanggal: u.tanggal, nilai: u[terpilih] }));
    return { titik, ringkasan: ringkasPerubahan(titik) };
  }, [catatan, terpilih]);

  // Selang terbaru di atas: itu yang paling sering dicari.
  const selang = [...ringkasan.perubahan].reverse();

  return (
    <View>
      <SectionHeader
        judul="Riwayat perubahan"
        aksi={`${catatan.length} pencatatan`}
      />

      {/* Pemilih bagian tubuh */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
      >
        {bagian.map((b) => {
          const aktif = b.kunci === terpilih;
          return (
            <Pressable
              key={b.kunci}
              accessibilityRole="radio"
              accessibilityState={{ selected: aktif }}
              accessibilityLabel={b.label}
              onPress={() => {
                if (aktif) return;
                ketukRingan();
                setTerpilih(b.kunci);
              }}
              style={({ pressed }) => ({
                minHeight: TAP_MIN,
                justifyContent: 'center',
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: aktif ? colors.aksen.isian : colors.garisKontrol,
                backgroundColor: aktif ? tint(colors.aksen.isian, 'pill') : colors.permukaanCekung,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  ...typography.label,
                  color: aktif ? colors.aksen.teks : colors.teksRedup,
                }}
              >
                {b.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Card style={{ gap: spacing.lg }}>
        {/* Total sejak pencatatan pertama — jawaban paling ringkas. */}
        {ringkasan.totalSelisih !== null && ringkasan.awal ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
              {label} sejak awal
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text style={{ ...typography.display, color: colors.teks }}>
                {teksSelisih(ringkasan.totalSelisih)}
              </Text>
              <Text style={{ ...typography.label, color: colors.teksSamar }}>cm</Text>
            </View>
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              {formatDesimal(ringkasan.awal.nilai)} → {formatDesimal(ringkasan.akhir!.nilai)} cm
              dalam {ringkasan.rentangHari} hari
            </Text>
          </View>
        ) : null}

        <GrafikUkuran titik={titik} label={label} />

        {/* Perubahan antar pencatatan, terbaru di atas. */}
        {selang.length > 0 ? (
          <View>
            {selang.map((p, i) => (
              <View
                key={`${p.dari}-${p.ke}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.garis,
                }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={{ ...typography.label, color: colors.teks }}>
                    {formatTanggalPanjang(p.ke)}
                  </Text>
                  <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                    {p.jarakHari} hari dari {formatTanggalPanjang(p.dari)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
                    <Text style={{ ...typography.title, color: colors.teks }}>
                      {teksSelisih(p.selisih)}
                    </Text>
                    <Text style={{ ...typography.caption, color: colors.teksSamar }}>cm</Text>
                  </View>
                  {/* Laju ditampilkan HANYA saat selangnya bukan sepekan: di
                      selang 7 hari ia cuma mengulang angka di atasnya. */}
                  {p.jarakHari !== 7 ? (
                    <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                      setara {teksSelisih(p.lajuPerPekan)} cm / pekan
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            Perubahan baru bisa dihitung setelah ada pencatatan kedua. Catat lagi pekan depan dan
            baris perbandingannya muncul di sini.
          </Text>
        )}
      </Card>
    </View>
  );
}

/** "+0,4" / "−0,3" / "0,0"; tanda minus memakai karakter minus, bukan hyphen. */
function teksSelisih(nilai: number): string {
  return formatSelisih(nilai);
}
