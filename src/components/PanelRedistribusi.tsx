import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatAngka, hitungRedistribusi, KELIPATAN_KCAL } from '@recomp/logika';
import type { BudgetMingguan, HasilRedistribusi, OpsiRedistribusi } from '@recomp/logika';
import { Card } from './Card';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, typography, ukuran } from '@/theme';

const OPSI: { nilai: OpsiRedistribusi; judul: string; ringkas: string }[] = [
  { nilai: 'sebar_rata', judul: 'Sebar rata', ringkas: 'Bagi ke semua hari yang tersisa' },
  { nilai: 'tumpuk_satu_hari', judul: 'Tumpuk satu hari', ringkas: 'Bebankan ke satu hari saja' },
  { nilai: 'abaikan', judul: 'Abaikan', ringkas: 'Biarkan target apa adanya' },
];

type Props = {
  budget: BudgetMingguan;
  batasBawahKalori: number;
  /** true bila jatah redistribusi minggu ini sudah terpakai. */
  sudahDipakai: boolean;
  onTerapkan: (hasil: HasilRedistribusi) => void;
};

/**
 * Panel opsi redistribusi kalori mingguan.
 *
 * Tidak pernah menerapkan apa pun sendiri — ia MENAWARKAN, dan pengguna yang
 * memutuskan. Itu aturan eksplisit di PRD, dan alasannya masuk akal: memindah
 * kalori diam-diam membuat target besok berubah tanpa pengguna tahu kenapa.
 *
 * Pratinjau target baru ditampilkan SEBELUM diterapkan, termasuk berapa yang
 * tidak terserap karena pembulatan 50 kcal atau batas bawah harian. Protein
 * tidak pernah ikut dipotong — yang diatur hanya kalori.
 */
export function PanelRedistribusi({
  budget,
  batasBawahKalori,
  sudahDipakai,
  onTerapkan,
}: Props) {
  const [opsi, setOpsi] = useState<OpsiRedistribusi>('sebar_rata');
  const [tanggalTumpuk, setTanggalTumpuk] = useState<string | null>(null);

  const mendatang = budget.rincian.filter((h) => h.status === 'mendatang');
  const sasaran = tanggalTumpuk ?? mendatang[mendatang.length - 1]?.tanggal;
  const hasil = hitungRedistribusi(budget, opsi, batasBawahKalori, sasaran);

  const perlu = hasil.perluDipindah;
  const adaYangPerlu = perlu !== 0 && mendatang.length > 0;

  if (!adaYangPerlu) {
    return (
      <Card>
        <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 24 }}>
          {mendatang.length === 0
            ? 'Minggu ini sudah habis — tidak ada hari tersisa untuk diatur.'
            : 'Jatah minggu ini sudah pas dengan rencana. Tidak ada yang perlu dipindah.'}
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        {/* Duduk perkaranya dulu, baru pilihannya */}
        <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 24 }}>
          {perlu < 0
            ? `Bila sisa minggu dijalani sesuai rencana, minggu ini tutup ${formatAngka(Math.abs(perlu))} kcal di atas jatah.`
            : `Masih ada ${formatAngka(perlu)} kcal jatah menganggur sampai akhir minggu.`}
        </Text>

        {sudahDipakai ? (
          <View
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSunken,
            }}
          >
            <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
              Redistribusi minggu ini sudah dipakai. Jatahnya satu kali per minggu, supaya
              target tidak terus bergeser sepanjang pekan.
            </Text>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
          {OPSI.map((o) => {
            const aktif = o.nilai === opsi;
            return (
              <Pressable
                key={o.nilai}
                accessibilityRole="radio"
                accessibilityState={{ selected: aktif }}
                accessibilityLabel={`Opsi ${o.judul}`}
                disabled={sudahDipakai}
                onPress={() => {
                  if (aktif) return;
                  ketukRingan();
                  setOpsi(o.nilai);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  minHeight: TAP_MIN,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: aktif ? colors.amber : colors.borderKuat,
                  backgroundColor: aktif ? colors.amber + '14' : colors.surfaceSunken,
                  opacity: sudahDipakai ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    borderWidth: 2,
                    borderColor: aktif ? colors.amber : colors.borderKuat,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {aktif ? (
                    <View style={{ width: ukuran.titik, height: ukuran.titik, borderRadius: radius.pill, backgroundColor: colors.amber }} />
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={{ ...typography.label, color: aktif ? colors.text : colors.textMuted }}>
                    {o.judul}
                  </Text>
                  {/* textMuted, bukan textFaint: di atas latar terpilih yang
                      bertint amber, textFaint cuma 3,94:1 — di bawah AA. */}
                  <Text style={{ ...typography.caption, color: colors.textMuted }}>{o.ringkas}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Pilih hari sasaran, hanya relevan untuk "tumpuk satu hari" */}
        {opsi === 'tumpuk_satu_hari' ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
              Bebankan ke
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {mendatang.map((h) => {
                const aktif = h.tanggal === sasaran;
                return (
                  <Pressable
                    key={h.tanggal}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: aktif }}
                    accessibilityLabel={`Bebankan ke ${h.tanggal}`}
                    disabled={sudahDipakai}
                    onPress={() => {
                      ketukRingan();
                      setTanggalTumpuk(h.tanggal);
                    }}
                    style={({ pressed }) => ({
                      minHeight: TAP_MIN,
                      justifyContent: 'center',
                      paddingHorizontal: spacing.lg,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: aktif ? colors.amber : colors.borderKuat,
                      backgroundColor: aktif ? colors.amber : colors.surfaceSunken,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ ...typography.label, color: aktif ? colors.diAtasIsian : colors.textMuted }}>
                      {hariSingkat(h.tanggal)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Pratinjau: apa yang akan berubah, SEBELUM diterapkan */}
        {opsi !== 'abaikan' ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
              Pratinjau target baru
            </Text>
            {hasil.hari
              .filter((h) => h.selisih !== 0)
              .map((h) => (
                <View
                  key={h.tanggal}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Text style={{ ...typography.caption, color: colors.textMuted }}>
                    {hariSingkat(h.tanggal)} · {h.namaTipeHari}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={{ ...typography.caption, color: colors.textFaint }}>
                      {formatAngka(h.targetLama)}
                    </Text>
                    <Text style={{ ...typography.caption, color: colors.textFaint }}>→</Text>
                    <Text style={{ ...typography.label, color: colors.text }}>
                      {formatAngka(h.targetBaru)}
                    </Text>
                    {h.kenaLantai ? (
                      <Text style={{ ...typography.caption, color: colors.amber }}>lantai</Text>
                    ) : null}
                  </View>
                </View>
              ))}

            <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
              {hasil.alasan} Target dibulatkan ke {KELIPATAN_KCAL} kcal, tidak pernah turun di
              bawah {formatAngka(batasBawahKalori)} kcal, dan protein tidak ikut dipotong.
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Terapkan redistribusi"
          disabled={sudahDipakai}
          onPress={() => {
            ketukBerhasil();
            onTerapkan(hasil);
          }}
          style={({ pressed }) => ({
            minHeight: TAP_MIN,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: radius.lg,
            paddingVertical: spacing.lg,
            backgroundColor: sudahDipakai ? colors.surfaceSunken : colors.amber,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            style={{
              ...typography.bodyTebal,
              color: sudahDipakai ? colors.textFaint : colors.diAtasIsian,
            }}
          >
            {sudahDipakai ? 'Sudah dipakai minggu ini' : opsi === 'abaikan' ? 'Biarkan apa adanya' : 'Terapkan'}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const NAMA = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function hariSingkat(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  return `${NAMA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}
