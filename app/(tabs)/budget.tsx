import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  budgetMingguan,
  formatAngka,
  formatTanggalPanjang,
  lajuBudget,
  bandingkanTargetTdee,
  estimasiTdee,
  faseSaat,
  periksaProteksiProtein,
  redistribusiBasi,
  rincianKumulatif,
  terapkanRedistribusi,
  usiaPada,
} from '@recomp/logika';
import type { BarisKumulatif, Fase, HasilRedistribusi } from '@recomp/logika';
import {
  Card,
  HeaderLayar,
  IndikatorProteinTerlindungi,
  KartuHero,
  KartuTdee,
  MeterBudget,
  PanelRedistribusi,
  PemilihFase,
  Pill,
  SectionHeader,
  SheetGantiFase,
  StatusRedistribusi,
} from '@/components';
import { mockHariBudget } from '@/mocks/budget';
import { mockDailyLogHariIni, mockRiwayatBerat } from '@/mocks/dailyLog';
import { useProfil } from '@/state/profil';
import { useTarget } from '@/state/target';
import { colors, radius, spacing, tint, typography } from '@/theme';
import { formatSelisih } from '@/lib/formatTampilan';

/**
 * Batas bawah kalori harian. Redistribusi tidak pernah menurunkan target di
 * bawah angka ini. Fase 2 membacanya dari `weekly_budgets.batas_bawah_kalori_harian`.
 */
const BATAS_BAWAH_KALORI = 1800;

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
  const { profil, riwayatFase } = useProfil();
  const { cariTarget } = useTarget();
  // Fase dipilih di sini, dikonfirmasi di sheet yang menyebut angka-angkanya.
  const [calonFase, setCalonFase] = useState<Fase | null>(null);
  const hariIni = mockDailyLogHariIni.tanggal;
  /*
   * Redistribusi yang sudah diterapkan minggu ini. Disimpan di state pada
   * Fase 1; kolom aslinya (`weekly_budgets.opsi_redistribusi`,
   * `redistribusi_terpakai`, `redistribusi_diterapkan_pada`) dipasang di task
   * backend tanpa mengubah bentuk data di sini.
   */
  const [redistribusi, setRedistribusi] = useState<HasilRedistribusi | null>(null);

  // Target hari mendatang memakai hasil redistribusi bila sudah diterapkan —
  // tanpa ini panelnya terkunci tapi angka di bawahnya tidak berubah sama sekali.
  // Hari lampau memakai snapshot targetnya; hari ini & sesudahnya target terkini.
  const hariDasar = mockHariBudget(hariIni, {
    faseAktif: profil.fase_aktif,
    faseLampau: (tanggal) => faseSaat(riwayatFase, tanggal, profil.fase_aktif),
    targetTerkini: cariTarget,
  });
  // Redistribusi menyimpan target absolut per hari. Bila target dasarnya
  // berubah sesudahnya (target disunting, fase diganti), angka itu tidak lagi
  // berangkat dari rencana yang berlaku: dilepas, dan pengguna memilih lagi
  // dari target baru — bukan diam-diam menimpa target yang baru disimpan.
  const basi = redistribusiBasi(redistribusi, hariDasar);
  const [catatanRedistribusi, setCatatanRedistribusi] = useState<string | null>(null);
  useEffect(() => {
    if (!basi) return;
    setRedistribusi(null);
    setCatatanRedistribusi(
      'Target berubah setelah redistribusi diterapkan, jadi redistribusi pekan ini dilepas. Angkanya kini berangkat dari target baru; pilih lagi bila perlu.',
    );
  }, [basi]);
  const hariSetelah = terapkanRedistribusi(hariDasar, basi ? null : redistribusi);
  const budget = budgetMingguan(hariSetelah, hariIni);

  // Hanya hari yang belum berjalan yang bisa terkena redistribusi.
  const mendatangSebelum = hariDasar.filter((h) => h.tanggal > hariIni);
  const mendatangSesudah = hariSetelah.filter((h) => h.tanggal > hariIni);
  const proteksi = periksaProteksiProtein(mendatangSebelum, mendatangSesudah);

  /*
   * TDEE dari tiga metode. Metode berbasis data memakai riwayat berat yang ada
   * dan rata-rata asupan hari-hari yang sudah berjalan minggu ini — di Fase 2
   * rentangnya diganti data asli yang lebih panjang.
   */
  const berjalan = budget.rincian.filter((h) => h.status !== 'mendatang');
  const beratAwal = mockRiwayatBerat[0]?.berat_pagi_kg ?? null;
  const beratAkhir = mockRiwayatBerat[mockRiwayatBerat.length - 1]?.berat_pagi_kg ?? null;

  const tdee = estimasiTdee({
    beratKg: beratAkhir ?? 75,
    tinggiCm: profil.tinggi_cm,
    usiaTahun: usiaPada(profil.tanggal_lahir, hariIni),
    jenisKelamin: profil.jenis_kelamin,
    // Body fat Navy butuh ukuran pinggang & leher — itu Fase 2, jadi metode
    // Katch-McArdle sengaja dilewati sampai datanya ada.
    persenLemak: null,
    tipeHariMinggu: budget.rincian.map((h) => h.namaTipeHari),
    hariData: mockRiwayatBerat.length,
    rataAsupanKalori:
      berjalan.length > 0
        ? berjalan.reduce((n, h) => n + h.terpakaiKalori, 0) / berjalan.length
        : null,
    perubahanBeratKg: beratAwal !== null && beratAkhir !== null ? beratAkhir - beratAwal : null,
  });

  const hariIniRinci = budget.rincian.find((h) => h.status === 'hari ini');

  const laju = lajuBudget(budget);
  const rincian = rincianKumulatif(budget);


  const lewat = budget.sisa < 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.latar }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.xl,
      }}
    >
      <HeaderLayar
        judul="Budget mingguan"
        subjudul={`Mulai ${formatTanggalPanjang(budget.mingguMulai)}`}
        aksi={<Pill label={profil.fase_aktif} warna={colors.status.sukses.teks} />}
      />

      {/* Angka utama: sisa jatah minggu ini */}
      <KartuHero
        label={lewat ? 'Melewati jatah minggu ini' : 'Sisa jatah minggu ini'}
        nilai={formatAngka(Math.abs(budget.sisa))}
        unit="kcal"
        keterangan={`${formatAngka(budget.terpakai)} dari ${formatAngka(budget.budgetTotal)} kcal`}
        nada={lewat ? 'bahaya' : 'aksen'}
        stat={[
          { label: 'Hari tersisa', nilai: String(budget.hariTersisa), unit: 'hari', unitDiBawah: true },
          {
            label: 'Dibagi rata',
            nilai: budget.sisaPerHari !== null ? formatAngka(budget.sisaPerHari) : '—',
            unit: 'kcal/hari',
            unitDiBawah: true,
            warna: budget.sisaPerHari !== null && budget.sisaPerHari < 0 ? colors.status.bahaya.teks : colors.teks,
          },
          // Pembanding: berapa jatah per hari kalau minggu ini berjalan sesuai rencana.
          {
            label: 'Rencana',
            nilai: budget.rencanaPerHari !== null ? formatAngka(budget.rencanaPerHari) : '—',
            unit: 'kcal/hari',
            unitDiBawah: true,
            warna: colors.teksRedup,
          },
        ]}
      >
        {/* Meter laju: sisa saja tidak menjawab "apakah lajunya wajar". */}
        <View>
          <MeterBudget budget={budget} laju={laju} />
        </View>
      </KartuHero>

      {/* Fase program — mengubahnya mengubah target, koridor, dan budget */}
      <View>
        <SectionHeader judul="Fase program" aksi="mengubah semua target" />
        <PemilihFase terpilih={profil.fase_aktif} onPilih={setCalonFase} />
        <SheetGantiFase terbuka={calonFase !== null} calon={calonFase} onTutup={() => setCalonFase(null)} />
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
              borderTopColor: colors.garis,
              backgroundColor: colors.permukaanCekung,
            }}
          >
            <View style={{ gap: spacing.xxs }}>
              <Text style={{ ...typography.label, color: colors.teks }}>Total minggu</Text>
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                tercatat {formatAngka(budget.terpakai)} · proyeksi {formatAngka(budget.targetMendatang)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
              <Text style={{ ...typography.label, color: colors.teks }}>
                {formatAngka(budget.budgetTotal)} kcal
              </Text>
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>jatah</Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Redistribusi: menawarkan, tidak pernah menerapkan sendiri */}
      <View>
        <SectionHeader
          judul="Redistribusi kalori"
          aksi={redistribusi ? 'sudah dipakai' : 'maksimal 1x per minggu'}
        />
        {catatanRedistribusi && !redistribusi ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ ...typography.labelBiasa, color: colors.teksRedup, marginBottom: spacing.sm }}
          >
            {catatanRedistribusi}
          </Text>
        ) : null}
        {redistribusi && !basi ? (
          <StatusRedistribusi hasil={redistribusi} diterapkanPada={hariIni} />
        ) : (
          <PanelRedistribusi
            budget={budget}
            batasBawahKalori={BATAS_BAWAH_KALORI}
            sudahDipakai={false}
            onTerapkan={(h) => {
              setCatatanRedistribusi(null);
              setRedistribusi(h);
            }}
          />
        )}
      </View>

      {/* TDEE: rentang dari beberapa metode, bukan satu angka */}
      <View>
        <SectionHeader judul="Kebutuhan energi" aksi={`${tdee.metode.length} metode`} />
        <KartuTdee
          tdee={tdee}
          perbandingan={
            hariIniRinci
              ? bandingkanTargetTdee(hariIniRinci.targetKalori, tdee.tengah, profil.fase_aktif)
              : null
          }
        />
      </View>

      {/* Proteksi protein — dibuktikan dari data, bukan sekadar diklaim */}
      <View>
        <SectionHeader judul="Proteksi protein" aksi="tidak pernah dipotong" />
        <IndikatorProteinTerlindungi
          proteksi={proteksi}
          sudahRedistribusi={redistribusi !== null}
        />
      </View>

      {/* Kenapa angkanya begitu — perhitungannya bisa ditelusuri */}
      <Card>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
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
            backgroundColor: colors.permukaanCekung,
          }}
        >
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
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
      ? colors.teksSamar
      : hari.selisih > 0
        ? colors.status.bahaya.teks
        : colors.status.sukses.teks;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.lg,
        borderTopWidth: pertama ? 0 : 1,
        borderTopColor: colors.garis,
        // Hari yang belum berjalan diredupkan: angkanya proyeksi, bukan catatan.
        opacity: hari.proyeksi ? 0.55 : 1,
        backgroundColor: iniHariIni ? tint(colors.aksen.isian, 'sorotSamar') : 'transparent',
      }}
    >
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ ...typography.label, color: colors.teks }}>
            {namaHariSingkat(hari.tanggal)}
          </Text>
          {iniHariIni ? (
            <Text style={{ ...typography.caption, color: colors.aksen.teks }}>HARI INI</Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ ...typography.caption, color: colors.teksRedup }}>
            {hari.namaTipeHari} · {formatAngka(hari.nilaiKalori)} kcal
          </Text>
          {hari.proyeksi ? (
            <Text style={{ ...typography.caption, color: colors.teksRedup }}>proyeksi</Text>
          ) : hari.selisih !== null && hari.selisih !== 0 ? (
            <Text style={{ ...typography.caption, color: warnaSelisih }}>
              {formatSelisih(hari.selisih, { desimal: 0 })}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
        <Text
          style={{
            ...typography.label,
            color: hari.sisaBerjalan < 0 ? colors.status.bahaya.teks : colors.teks,
          }}
        >
          {hari.sisaBerjalan < 0 ? '−' : ''}
          {formatAngka(Math.abs(hari.sisaBerjalan))}
        </Text>
        <Text style={{ ...typography.caption, color: colors.teksRedup }}>sisa</Text>
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
