import { Text, View } from 'react-native';
import { formatAngka } from '@recomp/logika';
import type { BudgetMingguan, LajuBudget } from '@recomp/logika';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  budget: BudgetMingguan;
  laju: LajuBudget;
};

/**
 * Meter pemakaian budget mingguan.
 *
 * Isian menunjukkan yang sudah terpakai; penanda tegak menunjukkan di mana
 * SEHARUSNYA berada pada titik minggu ini. Dua hal itu bersama menjawab
 * pertanyaan yang tidak bisa dijawab angka sisa sendirian: apakah lajunya
 * masih wajar, atau jatah minggu ini sedang dihabiskan terlalu awal.
 *
 * Penanda memakai garis + label, bukan warna saja, supaya tetap terbaca bagi
 * mata buta warna.
 */
export function MeterBudget({ budget, laju }: Props) {
  const total = Math.max(budget.budgetTotal, 1);
  // Dibatasi 100% supaya isian tidak meluber keluar track saat budget terlampaui.
  const persenTerpakai = Math.min(budget.terpakai / total, 1);
  const persenSeharusnya = Math.min(laju.seharusnya / total, 1);

  const lewatBudget = budget.sisa < 0;
  const warnaIsian = lewatBudget
    ? colors.status.bahaya.isian
    : laju.status === 'lebih cepat'
      ? colors.macro.satFat
      : colors.aksen.isian;

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          height: 12,
          borderRadius: radius.pill,
          backgroundColor: colors.permukaanCekung,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${persenTerpakai * 100}%`,
            height: '100%',
            borderRadius: radius.pill,
            backgroundColor: warnaIsian,
          }}
        />
        {/* Penanda laju: di mana pemakaian seharusnya berada sekarang. */}
        {laju.status !== 'belum mulai' ? (
          <View
            style={{
              position: 'absolute',
              left: `${persenSeharusnya * 100}%`,
              top: -2,
              width: 2,
              height: 16,
              backgroundColor: colors.teks,
            }}
          />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          terpakai {formatAngka(budget.terpakai)}
        </Text>
        {laju.status !== 'belum mulai' ? (
          <Text style={{ ...typography.caption, color: colors.teksRedup }}>
            │ laju semestinya {formatAngka(laju.seharusnya)}
          </Text>
        ) : null}
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          {formatAngka(budget.budgetTotal)}
        </Text>
      </View>

      <Text style={{ ...typography.body, color: colors.teksRedup }}>
        {kalimatLaju(laju)}
      </Text>
    </View>
  );
}

/** Kalimat penjelas laju; deskriptif, menyebut ambangnya supaya tidak terasa ajaib. */
function kalimatLaju(laju: LajuBudget): string {
  if (laju.status === 'belum mulai') {
    return 'Minggu baru dimulai — belum ada hari yang berjalan untuk dibandingkan.';
  }
  const besar = formatAngka(Math.abs(laju.selisih));
  if (laju.status === 'sesuai laju') {
    return (
      `Pemakaian meleset ${besar} kcal dari laju semestinya — masih di bawah ambang ` +
      `${formatAngka(laju.ambangKcal)} kcal, jadi ini terbaca sesuai laju.`
    );
  }
  if (laju.status === 'lebih cepat') {
    return `Sudah ${besar} kcal di atas laju untuk titik minggu ini. Sisa jatah harus menutupi hari yang tersisa.`;
  }
  return `Masih ${besar} kcal di bawah laju untuk titik minggu ini.`;
}
