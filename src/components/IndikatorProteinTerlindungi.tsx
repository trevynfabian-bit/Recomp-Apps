import { Text, View } from 'react-native';
import { formatAngka, formatMakro } from '@recomp/logika';
import type { ProteksiProtein } from '@recomp/logika';
import { Card } from './Card';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  proteksi: ProteksiProtein;
  /** true bila redistribusi sudah diterapkan minggu ini. */
  sudahRedistribusi: boolean;
};

/**
 * Indikator proteksi protein.
 *
 * PRD menyebut "protein tidak pernah dipotong" sebagai aturan keras. Klaim itu
 * mudah ditulis dan mudah pula dilanggar diam-diam saat kode berubah, jadi
 * kartu ini TIDAK sekadar mengklaimnya: ia menampilkan target protein tiap hari
 * berdampingan dengan kalorinya, sehingga terlihat kalori berubah sementara
 * protein tidak.
 *
 * Kalau sampai ada yang berbeda, kartu ini mengatakannya terang-terangan
 * alih-alih diam — itu bug yang harus kelihatan, bukan disembunyikan.
 */
export function IndikatorProteinTerlindungi({ proteksi, sudahRedistribusi }: Props) {
  if (proteksi.hari.length === 0) return null;

  const totalProtein = proteksi.hari.reduce((n, h) => n + h.proteinG, 0);
  const warna = proteksi.utuh ? colors.aksenTeks.jade : colors.aksenTeks.coral;

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs + 1,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs + 1,
              borderRadius: radius.pill,
              backgroundColor: warna + '1A',
              borderWidth: 1,
              borderColor: warna + '55',
            }}
          >
            {/* Identitas lewat simbol + teks, bukan warna saja. */}
            <Text style={{ ...typography.label, color: warna }}>{proteksi.utuh ? '✓' : '!'}</Text>
            <Text style={{ ...typography.label, color: warna }}>
              {proteksi.utuh ? 'Protein terlindungi' : 'Protein ikut berubah'}
            </Text>
          </View>
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            {formatMakro(totalProtein)} g sepanjang sisa minggu
          </Text>
        </View>

        <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 24 }}>
          {proteksi.utuh
            ? sudahRedistribusi
              ? 'Redistribusi tadi hanya menggeser kalori. Target protein tiap hari tetap sama persis.'
              : 'Redistribusi apa pun hanya menggeser kalori. Target protein tidak pernah ikut dipotong.'
            : 'Ada target protein yang berubah. Ini seharusnya tidak terjadi — laporkan sebagai bug.'}
        </Text>

        {/* Bukti per hari: kalori berubah, protein tidak. */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
              Hari
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              <Text
                style={{
                  ...typography.caption,
                  color: colors.textFaint,
                  textTransform: 'uppercase',
                  width: 86,
                  textAlign: 'right',
                }}
              >
                Kalori
              </Text>
              <Text
                style={{
                  ...typography.caption,
                  color: colors.textFaint,
                  textTransform: 'uppercase',
                  width: 54,
                  textAlign: 'right',
                }}
              >
                Protein
              </Text>
            </View>
          </View>

          {proteksi.hari.map((h) => {
            const kaloriBerubah = h.kaloriSebelum !== h.kaloriSesudah;
            const proteinBerubah = h.proteinG !== h.proteinSesudahG;
            return (
              <View
                key={h.tanggal}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Text style={{ ...typography.caption, color: colors.textMuted, flex: 1 }} numberOfLines={1}>
                  {hariSingkat(h.tanggal)} · {h.namaTipeHari}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                  <Text
                    style={{
                      ...typography.caption,
                      color: kaloriBerubah ? colors.amber : colors.textFaint,
                      width: 86,
                      textAlign: 'right',
                    }}
                  >
                    {kaloriBerubah
                      ? `${formatAngka(h.kaloriSebelum)}→${formatAngka(h.kaloriSesudah)}`
                      : formatAngka(h.kaloriSesudah)}
                  </Text>
                  <Text
                    style={{
                      ...typography.caption,
                      color: proteinBerubah ? colors.aksenTeks.coral : colors.aksenTeks.jade,
                      width: 54,
                      textAlign: 'right',
                    }}
                  >
                    {formatMakro(h.proteinSesudahG)} g
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
          Protein dijaga karena ia yang menahan otot saat kalori dikurangi. Memotongnya untuk
          menutup kelebihan kalori justru membuang hal yang sedang dibangun.
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
