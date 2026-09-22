import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  budgetMingguan,
  formatAngka,
  formatTanggalPanjang,
  lajuBudget,
  rincianKumulatif,
} from '@recomp/logika';
import type { BarisKumulatif } from '@recomp/logika';
import { Card, HeroNumber, MeterBudget, PemilihFase, Pill, SectionHeader } from '@/components';
import { mockHariBudget } from '@/mocks/budget';
import { mockDailyLogHariIni } from '@/mocks/dailyLog';
import { useProfil } from '@/state/profil';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Layar Budget Kalori Mingguan.
 *
 * Angka utamanya sisa jatah minggu ini. Gunanya satu: satu hari yang kelebihan
 * tidak otomatis merusak seminggu — yang penting sisa sampai akhir pekan.
 *
 * Fase 1 memakai data tiruan. Redistribusi (sebar rata / tumpuk satu hari /
 * abaikan) dan proteksi protein dipasang di task berikutnya pada halaman ini.
 */
export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const { profil, gantiFase } = useProfil();
  const hariIni = mockDailyLogHariIni.tanggal;
  const budget = budgetMingguan(mockHariBudget(hariIni, profil.fase_aktif), hariIni);

  const laju = lajuBudget(budget);
  const rincian = rincianKumulatif(budget);
  const lewat = budget.sisa < 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.xl,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ ...typography.title, color: colors.text }}>Budget mingguan</Text>
          <Text style={{ ...typography.label, color: colors.textFaint, marginTop: 2 }}>
            Mulai {formatTanggalPanjang(budget.mingguMulai)}
          </Text>
        </View>
        <Pill label={profil.fase_aktif} warna={colors.aksenTeks.jade} />
      </View>

      {/* Angka utama: sisa jatah minggu ini */}
      <Card style={{ paddingVertical: spacing.xl }}>
        <HeroNumber
          label={lewat ? 'Melewati jatah minggu ini' : 'Sisa jatah minggu ini'}
          nilai={formatAngka(Math.abs(budget.sisa))}
          unit="kcal"
          keterangan={`${formatAngka(budget.terpakai)} dari ${formatAngka(budget.budgetTotal)} kcal`}
          warna={lewat ? colors.coral : colors.amber}
        />

        {/* Meter laju: sisa saja tidak menjawab "apakah lajunya wajar". */}
        <View style={{ marginTop: spacing.xl }}>
          <MeterBudget budget={budget} laju={laju} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            marginTop: spacing.xl,
            paddingTop: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <StatKecil label="Hari tersisa" nilai={String(budget.hariTersisa)} unit="hari" warna={colors.text} />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <StatKecil
            label="Dibagi rata"
            nilai={budget.sisaPerHari !== null ? formatAngka(budget.sisaPerHari) : '—'}
            unit="kcal/hari"
            warna={
              budget.sisaPerHari !== null && budget.sisaPerHari < 0 ? colors.aksenTeks.coral : colors.text
            }
          />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          {/* Pembanding: berapa jatah per hari kalau minggu ini berjalan sesuai rencana. */}
          <StatKecil
            label="Rencana"
            nilai={budget.rencanaPerHari !== null ? formatAngka(budget.rencanaPerHari) : '—'}
            unit="kcal/hari"
            warna={colors.textMuted}
          />
        </View>
      </Card>

      {/* Fase program — mengubahnya mengubah target, koridor, dan budget */}
      <View>
        <SectionHeader judul="Fase program" aksi="mengubah semua target" />
        <PemilihFase terpilih={profil.fase_aktif} onPilih={gantiFase} />
      </View>

      {/* Rincian tujuh hari */}
      <View>
        <SectionHeader judul="Minggu ini" aksi="sisa berjalan" />
        <Card flat>
          {rincian.map((h, i) => (
            <BarisHari key={h.tanggal} hari={h} pertama={i === 0} />
          ))}

          {/* Baris total: menutup daftar dengan angka yang sama di kartu utama. */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.surfaceSunken,
            }}
          >
            <View style={{ gap: 3 }}>
              <Text style={{ ...typography.label, color: colors.text }}>Total minggu</Text>
              <Text style={{ ...typography.caption, color: colors.textFaint }}>
                tercatat {formatAngka(budget.terpakai)} · proyeksi {formatAngka(budget.targetMendatang)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text style={{ ...typography.label, color: colors.text }}>
                {formatAngka(budget.budgetTotal)} kcal
              </Text>
              <Text style={{ ...typography.caption, color: colors.textFaint }}>jatah</Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Kenapa angkanya begitu — perhitungannya bisa ditelusuri */}
      <Card>
        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
          Budget mingguan adalah JUMLAH target harian sepanjang minggu, jadi minggu dengan
          lebih banyak hari latihan memang punya jatah lebih besar — itu bukan kebocoran.
          Target harian sendiri mengikuti tipe hari pada fase {profil.fase_aktif}.
        </Text>
      </Card>

      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSunken,
          }}
        >
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            Data tiruan · redistribusi menyusul
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * Satu baris hari. Kolom kanan menampilkan SISA BERJALAN, bukan hanya konsumsi
 * hari itu: yang ingin dijawab pengguna adalah "setelah hari ini tinggal
 * berapa", dan itu butuh akumulasi, bukan angka satuan.
 */
function BarisHari({ hari, pertama }: { hari: BarisKumulatif; pertama: boolean }) {
  const iniHariIni = hari.status === 'hari ini';

  const warnaSelisih =
    hari.selisih === null
      ? colors.textFaint
      : hari.selisih > 0
        ? colors.aksenTeks.coral
        : colors.aksenTeks.jade;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.lg,
        borderTopWidth: pertama ? 0 : 1,
        borderTopColor: colors.border,
        // Hari yang belum berjalan diredupkan: angkanya proyeksi, bukan catatan.
        opacity: hari.proyeksi ? 0.55 : 1,
        backgroundColor: iniHariIni ? colors.amber + '0F' : 'transparent',
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ ...typography.label, color: colors.text }}>
            {namaHariSingkat(hari.tanggal)}
          </Text>
          {iniHariIni ? (
            <Text style={{ ...typography.caption, color: colors.amber }}>HARI INI</Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            {hari.namaTipeHari} · {formatAngka(hari.nilaiKalori)} kcal
          </Text>
          {hari.proyeksi ? (
            <Text style={{ ...typography.caption, color: colors.textFaint }}>proyeksi</Text>
          ) : hari.selisih !== null && hari.selisih !== 0 ? (
            <Text style={{ ...typography.caption, color: warnaSelisih }}>
              {hari.selisih > 0 ? '+' : '−'}
              {formatAngka(Math.abs(hari.selisih))}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Text
          style={{
            ...typography.label,
            color: hari.sisaBerjalan < 0 ? colors.aksenTeks.coral : colors.text,
          }}
        >
          {hari.sisaBerjalan < 0 ? '−' : ''}
          {formatAngka(Math.abs(hari.sisaBerjalan))}
        </Text>
        <Text style={{ ...typography.caption, color: colors.textFaint }}>sisa</Text>
      </View>
    </View>
  );
}

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** "Senin 22" — cukup untuk baris daftar tanpa memakan lebar. */
function namaHariSingkat(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${NAMA_HARI[t.getUTCDay()]} ${d}`;
}

function StatKecil({
  label,
  nilai,
  unit,
  warna,
}: {
  label: string;
  nilai: string;
  unit: string;
  warna: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: spacing.xs, paddingHorizontal: 2 }}>
      <Text
        style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={{ alignItems: 'center' }}>
        <Text style={{ ...typography.title, color: warna }}>{nilai}</Text>
        <Text style={{ ...typography.caption, color: colors.textFaint }}>{unit}</Text>
      </View>
    </View>
  );
}
