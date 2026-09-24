import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatJam, formatTanggalPanjang } from '@recomp/logika';
import { Card, DaftarBaris, HeaderLayar, KeadaanKosong, PilihanSegmen, SectionHeader, StatusProses } from '@/components';
import { mockLaporanParitas, type AreaParitas, type PasanganParitas } from '@/mocks/paritas';
import { colors, spacing, typography, ukuranIkon } from '@/theme';

type Contoh = keyof typeof mockLaporanParitas;

const URUTAN_AREA: AreaParitas[] = ['Makro & budget', 'Target & fase', 'Berat & tren', 'Komposisi tubuh', 'Evaluasi & teks', 'Skema data'];

/**
 * Laporan paritas logika & basis data (build pengembangan).
 *
 * Aturan yang dihitung di dua tempat (`@recomp/logika` untuk UI, SQL untuk
 * widget, RPC, dan batasan tabel) harus menghasilkan angka yang sama.
 * `npm run cek:paritas` membuktikannya; halaman ini menampilkan hasilnya per
 * pasangan supaya selisih terlihat tanpa membaca keluaran terminal. Hanya
 * dibuka dari Pengaturan pada build pengembangan. Data dari `src/mocks/paritas`.
 */
export default function ParitasScreen() {
  const insets = useSafeAreaInsets();
  const [contoh, setContoh] = useState<Contoh>('beda');
  const laporan = mockLaporanParitas[contoh];
  const beda = laporan.pasangan.filter((p) => p.keadaan === 'beda');
  const totalKasus = laporan.pasangan.reduce((n, p) => n + p.kasus, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.latar }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.xl,
      }}
    >
      <HeaderLayar kembali judul="Laporan paritas" subjudul="Logika TS × database · data tiruan" />

      <PilihanSegmen
        opsi={[
          { nilai: 'beda', label: 'Ada selisih' },
          { nilai: 'sama', label: 'Semua sama' },
          { nilai: 'belum', label: 'Belum jalan' },
        ]}
        terpilih={contoh}
        onPilih={setContoh}
        aksesAwalan="Contoh keadaan"
        peran="radio"
      />

      {laporan.dijalankanPada === null ? (
        <KeadaanKosong
          ikon="git-compare-outline"
          judul="Belum ada laporan"
          keterangan="Jalankan npm run cek:paritas di mesin pengembangan. Laporannya muncul di sini setelah skrip selesai."
        />
      ) : (
        <>
          <Card>
            <StatusProses
              ringkas
              keadaan={beda.length ? 'gagal' : 'berhasil'}
              judul={
                beda.length
                  ? `${beda.length} dari ${laporan.pasangan.length} aturan berbeda`
                  : `${laporan.pasangan.length} aturan sama di kedua tempat`
              }
              keterangan={`${totalKasus} kasus uji · ${formatTanggalPanjang(laporan.dijalankanPada.slice(0, 10))}, ${formatJam(laporan.dijalankanPada)} · commit ${laporan.commit}`}
            />
          </Card>

          {URUTAN_AREA.map((area) => {
            const isi = laporan.pasangan.filter((p) => p.area === area);
            if (!isi.length) return null;
            return (
              <View key={area}>
                <SectionHeader judul={area} />
                <DaftarBaris daftar>
                  {isi.map((p) => (
                    <BarisPasangan key={p.id} p={p} />
                  ))}
                </DaftarBaris>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function BarisPasangan({ p }: { p: PasanganParitas }) {
  const sama = p.keadaan === 'sama';
  const warna = sama ? colors.status.sukses.teks : colors.status.bahaya.teks;
  return (
    <View
      accessible
      accessibilityLabel={`${p.aturan}: ${sama ? 'sama' : 'berbeda'}, ${p.kasus} kasus. TypeScript ${p.ts}; database ${p.sql}.${
        p.selisih ? ` Selisih pada ${p.selisih.kasus}: TypeScript ${p.selisih.ts}, database ${p.selisih.sql}.` : ''
      }`}
      style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg }}
    >
      <Ionicons name={sama ? 'checkmark-circle' : 'alert-circle'} size={ukuranIkon.baris} color={warna} />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ ...typography.bodySedang, color: colors.teks }}>{p.aturan}</Text>
        <Text style={{ ...typography.labelBiasa, color: sama ? colors.teksRedup : warna }}>
          {sama ? `Sama · ${p.kasus} kasus` : `Berbeda · ${p.kasus} kasus`}
        </Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>TS {p.ts}</Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>SQL {p.sql}</Text>
        {p.selisih ? (
          <Text style={{ ...typography.labelBiasa, color: colors.teks, marginTop: spacing.xs }}>
            {`Saat ${p.selisih.kasus}: TS “${p.selisih.ts}”, SQL “${p.selisih.sql}”.`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
