import { Text, View } from 'react-native';
import { formatAngka, formatTanggalPanjang } from '@recomp/logika';
import type { HasilRedistribusi } from '@recomp/logika';
import { Card } from './Card';
import { colors, radius, spacing, tint, typography, ukuran } from '@/theme';

const NAMA_OPSI: Record<string, string> = {
  sebar_rata: 'Sebar rata',
  tumpuk_satu_hari: 'Tumpuk satu hari',
  abaikan: 'Abaikan',
};

type Props = {
  hasil: HasilRedistribusi;
  /** Kapan diterapkan; `daily_logs`-nya nanti dari `redistribusi_diterapkan_pada`. */
  diterapkanPada: string;
};

/**
 * Status redistribusi yang SUDAH diterapkan minggu ini.
 *
 * Mengunci panel saja tidak cukup: kalau pengguna hanya melihat "sudah
 * dipakai", ia tidak punya cara mengingat APA yang dipilihnya dan hari mana
 * yang berubah. Kartu ini menyimpan jejak itu — pilihan, jumlahnya, kapan,
 * dan target lama → baru per hari.
 */
export function StatusRedistribusi({ hasil, diterapkanPada }: Props) {
  const berubah = hasil.hari.filter((h) => h.selisih !== 0);
  const arah = hasil.terserap < 0 ? 'dipotong' : 'ditambahkan';

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <View
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: ukuran.chip.vertikal,
              borderRadius: radius.pill,
              backgroundColor: tint(colors.status.sukses.teks, 'pill'),
              borderWidth: 1,
              borderColor: tint(colors.status.sukses.teks, 'tepi'),
            }}
          >
            <Text style={{ ...typography.label, color: colors.status.sukses.teks }}>
              {NAMA_OPSI[hasil.opsi] ?? hasil.opsi}
            </Text>
          </View>
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            diterapkan {formatTanggalPanjang(diterapkanPada)}
          </Text>
        </View>

        <Text style={{ ...typography.body, color: colors.teksRedup }}>
          {formatAngka(Math.abs(hasil.terserap))} kcal {arah} ke {berubah.length} hari.
          Target di bawah sudah memakai angka baru ini.
        </Text>

        <View style={{ gap: spacing.sm }}>
          {berubah.map((h) => (
            <View
              key={h.tanggal}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Text style={{ ...typography.caption, color: colors.teksRedup }}>
                {hariSingkat(h.tanggal)} · {h.namaTipeHari}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text
                  style={{
                    ...typography.caption,
                    color: colors.teksSamar,
                    textDecorationLine: 'line-through',
                  }}
                >
                  {formatAngka(h.targetLama)}
                </Text>
                <Text style={{ ...typography.label, color: colors.teks }}>
                  {formatAngka(h.targetBaru)}
                </Text>
                {h.kenaLantai ? (
                  <Text style={{ ...typography.caption, color: colors.aksen.teks }}>lantai</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        {hasil.tersisa !== 0 || hasil.dibatasiLantai ? (
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            {hasil.alasan}
          </Text>
        ) : null}

        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          Jatah redistribusi satu kali per minggu sudah terpakai. Ia akan kembali tersedia
          Senin depan, supaya target tidak terus bergeser sepanjang pekan.
        </Text>
      </View>
    </Card>
  );
}

const NAMA = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function hariSingkat(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  return `${NAMA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}
