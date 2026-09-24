import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatAngka,
  formatDesimal,
  formatJam,
  formatTanggalPanjang,
  kalimatPasanganParitas,
  kalimatSelisihParitas,
  ringkasLaporanParitas,
} from '@recomp/logika';
import {
  Card,
  DaftarBaris,
  HeaderLayar,
  KeadaanKosong,
  PilihanSegmen,
  SectionHeader,
  StatusProses,
} from '@/components';
import { formatSelisih } from '@/lib/formatTampilan';
import { mockLaporanParitas, type AreaParitas, type PasanganParitas, type SelisihParitas } from '@/mocks/paritas';
import { colors, spacing, typography, ukuran, ukuranIkon } from '@/theme';

type Contoh = keyof typeof mockLaporanParitas;

const URUTAN_AREA: AreaParitas[] = [
  'Makro & budget',
  'Target & fase',
  'Berat & tren',
  'Komposisi tubuh',
  'Evaluasi & teks',
  'Skema data',
];

/**
 * Laporan paritas logika & basis data (build pengembangan).
 *
 * Aturan yang dihitung di dua tempat (`@recomp/logika` untuk UI, SQL untuk
 * widget, RPC, dan batasan tabel) harus menghasilkan angka yang sama.
 * `npm run cek:paritas` membuktikannya; halaman ini menampilkan hasilnya per
 * pasangan supaya selisih terlihat tanpa membaca keluaran terminal. Hanya
 * dibuka dari Pengaturan pada build pengembangan. Data dari `src/mocks/paritas`.
 *
 * Aturan yang berbeda dikumpulkan paling atas ("Selisih") dengan nilai kedua
 * sisi per kasus: angka beserta selisihnya (SQL − TS), teks berdampingan.
 * Daftar per area di bawahnya tetap lengkap, termasuk yang sama.
 */
export default function ParitasScreen() {
  const insets = useSafeAreaInsets();
  const [contoh, setContoh] = useState<Contoh>('beda');
  const laporan = mockLaporanParitas[contoh];
  const beda = laporan.pasangan.filter((p) => p.keadaan === 'beda');
  // Kalimat ringkasan dari penyusun bersama (`@recomp/logika`), sama dengan laporan skrip.
  const ringkasan = ringkasLaporanParitas(laporan);

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
        <KeadaanKosong ikon="git-compare-outline" judul={ringkasan.judul} keterangan={ringkasan.kalimat} />
      ) : (
        <>
          <Card>
            <StatusProses
              ringkas
              keadaan={beda.length ? 'gagal' : 'berhasil'}
              judul={ringkasan.judul}
              keterangan={`${ringkasan.kalimat} ${formatTanggalPanjang(laporan.dijalankanPada.slice(0, 10))}, ${formatJam(laporan.dijalankanPada)} · commit ${laporan.commit}.`}
            />
          </Card>

          {beda.length ? (
            <View>
              <SectionHeader judul={`Selisih · ${beda.reduce((n, p) => n + (p.selisih?.length ?? 0), 0)} nilai`} />
              <View style={{ gap: spacing.md }}>
                {beda.map((p) => (
                  <TabelSelisih key={p.id} p={p} />
                ))}
              </View>
            </View>
          ) : null}

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
      accessibilityLabel={`${kalimatPasanganParitas(p)} TypeScript ${p.ts}; database ${p.sql}.`}
      style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg }}
    >
      <Ionicons name={sama ? 'checkmark-circle' : 'alert-circle'} size={ukuranIkon.baris} color={warna} />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ ...typography.bodySedang, color: colors.teks }}>{p.aturan}</Text>
        <Text style={{ ...typography.labelBiasa, color: sama ? colors.teksRedup : warna }}>{ringkasKeadaan(p)}</Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>TS {p.ts}</Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>SQL {p.sql}</Text>
      </View>
    </View>
  );
}

function ringkasKeadaan(p: PasanganParitas): string {
  if (p.keadaan === 'sama') return `Sama · ${p.kasus} kasus`;
  const n = p.selisih?.length ?? 0;
  return `Berbeda · ${n} nilai dari ${p.kasus} kasus`;
}

/** Nilai satu sisi; `null` = sisi itu tidak mengembalikan apa-apa. */
function formatNilai(v: SelisihParitas['ts'], s: SelisihParitas): string {
  if (v === null) return 'kosong';
  if (typeof v === 'string') return v;
  // Minus tampilan "−" (bab Desain 8.4), selebar "+", supaya kolom tidak bergeser.
  return (s.desimal ? formatDesimal(v, s.desimal) : formatAngka(v)).replace(/^-/, '−');
}

/** SQL − TS bila keduanya angka; selain itu tidak ada selisih yang bisa dihitung. */
function formatBeda(s: SelisihParitas): string {
  if (typeof s.ts !== 'number' || typeof s.sql !== 'number') return '—';
  return formatSelisih(s.sql - s.ts, { desimal: s.desimal ?? 0 });
}

/** Fungsi, bukan konstanta modul: `colors` dibaca saat render supaya ikut skema. */
const gayaKepala = () => ({ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }) as const;

/** Nilai kedua sisi untuk satu aturan yang berbeda, satu baris per kasus × kolom. */
function TabelSelisih({ p }: { p: PasanganParitas }) {
  const baris = p.selisih ?? [];
  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={{ ...typography.bodySedang, color: colors.teks }}>{p.aturan}</Text>
      <Text style={{ ...typography.caption, color: colors.teksSamar }}>{`TS ${p.ts} · SQL ${p.sql}`}</Text>
      <View
        style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Text style={{ ...gayaKepala(), flex: 1 }}>Kasus</Text>
        <Text style={{ ...gayaKepala(), width: ukuran.kolomTabel.sempit, textAlign: 'right' }}>TS</Text>
        <Text style={{ ...gayaKepala(), width: ukuran.kolomTabel.sempit, textAlign: 'right' }}>SQL</Text>
        <Text style={{ ...gayaKepala(), width: ukuran.kolomTabel.sempit, textAlign: 'right' }}>SQL−TS</Text>
      </View>
      {baris.map((s, i) => {
        const ts = formatNilai(s.ts, s);
        const sql = formatNilai(s.sql, s);
        const beda = formatBeda(s);
        const satuan = s.satuan ? ` ${s.satuan}` : '';
        return (
          <View
            key={`${s.kasus}-${s.kolom}-${i}`}
            accessible
            accessibilityLabel={`${s.kasus}, ${s.kolom}: TypeScript ${ts}${satuan}, database ${sql}${satuan}${beda === '—' ? '' : `, selisih ${beda}${satuan}`}.`}
            style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ ...typography.caption, color: colors.teks }}>{s.kasus}</Text>
              <Text
                style={{ ...typography.caption, color: colors.teksSamar }}
              >{`${s.kolom}${s.satuan ? ` (${s.satuan})` : ''}`}</Text>
            </View>
            <Text
              style={{
                ...typography.caption,
                color: colors.teksRedup,
                width: ukuran.kolomTabel.sempit,
                textAlign: 'right',
              }}
            >
              {ts}
            </Text>
            <Text
              style={{
                ...typography.caption,
                color: colors.teksRedup,
                width: ukuran.kolomTabel.sempit,
                textAlign: 'right',
              }}
            >
              {sql}
            </Text>
            <Text
              style={{
                ...typography.caption,
                color: beda === '—' ? colors.teksSamar : colors.status.bahaya.teks,
                width: ukuran.kolomTabel.sempit,
                textAlign: 'right',
              }}
            >
              {beda}
            </Text>
          </View>
        );
      })}
      {/* Tabel untuk yang memperbaiki; kalimat untuk semua orang. */}
      <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
        {baris.map((s, i) => (
          <Text key={`kalimat-${i}`} style={{ ...typography.caption, color: colors.teksRedup }}>
            {kalimatSelisihParitas(s)}
          </Text>
        ))}
      </View>
    </Card>
  );
}
