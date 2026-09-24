import { Text, View } from 'react-native';
import { formatAngka, formatMakro } from '@recomp/logika';
import type { ProteksiProtein } from '@recomp/logika';
import { Card } from './Card';
import { colors, radius, spacing, tint, typography, ukuran } from '@/theme';

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
  const warna = proteksi.utuh ? colors.status.sukses.teks : colors.status.bahaya.teks;

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: ukuran.celahTitik,
              paddingHorizontal: spacing.md,
              paddingVertical: ukuran.chip.vertikal,
              borderRadius: radius.pill,
              backgroundColor: tint(warna, 'pill'),
              borderWidth: 1,
              borderColor: tint(warna, 'tepi'),
            }}
          >
            {/* Identitas lewat simbol + teks, bukan warna saja. */}
            <Text style={{ ...typography.label, color: warna }}>{proteksi.utuh ? '✓' : '!'}</Text>
            <Text style={{ ...typography.label, color: warna }}>
              {proteksi.utuh ? 'Protein terlindungi' : 'Protein ikut berubah'}
            </Text>
          </View>
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            {formatMakro(totalProtein)} g sepanjang sisa minggu
          </Text>
        </View>

        <Text style={{ ...typography.body, color: colors.teksRedup }}>
          {proteksi.utuh
            ? sudahRedistribusi
              ? 'Redistribusi tadi hanya menggeser kalori. Target protein tiap hari tetap sama persis.'
              : 'Redistribusi apa pun hanya menggeser kalori. Target protein tidak pernah ikut dipotong.'
            : 'Ada target protein yang berubah. Ini seharusnya tidak terjadi — laporkan sebagai bug.'}
        </Text>

        {/* Bukti per hari: kalori berubah, protein tidak. */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
              Hari
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              <Text
                style={{
                  ...typography.caption,
                  color: colors.teksSamar,
                  textTransform: 'uppercase',
                  width: ukuran.kolomTabel.lebar,
                  textAlign: 'right',
                }}
              >
                Kalori
              </Text>
              <Text
                style={{
                  ...typography.caption,
                  color: colors.teksSamar,
                  textTransform: 'uppercase',
                  width: ukuran.kolomTabel.sempit,
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
                <Text style={{ ...typography.caption, color: colors.teksRedup, flex: 1 }} numberOfLines={1}>
                  {hariSingkat(h.tanggal)} · {h.namaTipeHari}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                  <Text
                    style={{
                      ...typography.caption,
                      color: kaloriBerubah ? colors.aksen.teks : colors.teksSamar,
                      width: ukuran.kolomTabel.lebar,
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
                      color: proteinBerubah ? colors.status.bahaya.teks : colors.status.sukses.teks,
                      width: ukuran.kolomTabel.sempit,
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

        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
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
