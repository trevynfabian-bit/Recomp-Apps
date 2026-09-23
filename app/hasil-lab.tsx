import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatTanggalPanjang,
  kalimatRingkasanLab,
  kelompokkanPerTahun,
  posisiPenanda,
  ringkasHasilLab,
} from '@recomp/logika';
import type { HasilLab } from '@recomp/logika';
import { Card, KerangkaSheet, SectionHeader, TombolBertepi, TombolUtama } from '@/components';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { useHasilLab } from '@/state/hasilLab';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Riwayat hasil lab.
 *
 * Hasil lab dibaca coach sebagai KONTEKS, bukan dasar diagnosis atau saran
 * dosis. Layar ini karena itu hanya menyatakan fakta dari kertas hasilnya:
 * panel, tanggal, laboratorium, jumlah penanda, dan penanda mana yang berada
 * di luar rentang rujukan LABORATORIUM itu sendiri — tanpa kata "tinggi",
 * "buruk", atau warna alarm. Artinya dibicarakan dengan dokter.
 *
 * Dikelompokkan per tahun, terbaru lebih dulu: hasil lab datang beberapa kali
 * setahun, dan membandingkan "September lalu" dengan "Desember sebelumnya"
 * adalah cara orang biasanya membacanya.
 *
 * Fase 4 sisi frontend: riwayat dari `useHasilLab` (tiruan di memori).
 */
export default function HasilLabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { riwayat, hapus } = useHasilLab();
  const kelompok = kelompokkanPerTahun(riwayat);
  /** Entri yang sedang dikonfirmasi untuk dihapus. */
  const [akanDihapus, setAkanDihapus] = useState<HasilLab | null>(null);
  const [statusHapus, setStatusHapus] = useState<'diam' | 'menghapus' | 'gagal' | 'terhapus'>('diam');

  async function jalankanHapus() {
    if (!akanDihapus) return;
    setStatusHapus('menghapus');
    try {
      await hapus(akanDihapus.id);
      ketukBerhasil();
      setAkanDihapus(null);
      setStatusHapus('terhapus');
    } catch {
      setStatusHapus('gagal');
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.xl,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali"
          onPress={() => {
            ketukRingan();
            router.back();
          }}
          style={({ pressed }) => ({
            width: TAP_MIN,
            height: TAP_MIN,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.borderKuat,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ ...typography.title, color: colors.text }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ ...typography.title, color: colors.text }}>
            Hasil lab
          </Text>
          <Text style={{ ...typography.label, color: colors.textFaint, marginTop: 2 }}>
            {riwayat.length > 0 ? `${riwayat.length} hasil tersimpan` : 'Belum ada yang tersimpan'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <Ionicons name="flask-outline" size={20} color={colors.textMuted} />
        <Text style={{ flex: 1, ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
          Dibaca coach sebagai konteks, bukan dasar saran dosis atau diagnosis. Rentang rujukan adalah milik
          laboratorium yang memeriksa; artinya dibicarakan dengan dokter.
        </Text>
      </View>

      {kelompok.length === 0 ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.body, fontWeight: '700', color: colors.text }}>Belum ada hasil lab</Text>
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
            Hasil lab yang Anda tambahkan akan tampil di sini, dikelompokkan per tahun, dan dibaca coach sebagai konteks.
          </Text>
        </Card>
      ) : null}

      {statusHapus === 'terhapus' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.label, fontWeight: '500', color: colors.aksenTeks.jade }}>
          Hasil lab dihapus.
        </Text>
      ) : null}

      <TombolUtama label="Tambah hasil lab" onPress={() => router.push('/tambah-hasil-lab')} />

      {kelompok.map((k) => (
        <View key={k.tahun}>
          <SectionHeader judul={k.tahun} aksi={`${k.hasil.length} hasil`} />
          <View accessibilityRole="list" style={{ gap: spacing.md }}>
            {k.hasil.map((h) => (
              <KartuHasilLab
                key={h.id}
                hasil={h}
                onUbah={() => router.push({ pathname: '/tambah-hasil-lab', params: { id: h.id } })}
                onHapus={() => {
                  setStatusHapus('diam');
                  setAkanDihapus(h);
                }}
              />
            ))}
          </View>
        </View>
      ))}

      <KerangkaSheet
        terbuka={akanDihapus !== null}
        onTutup={statusHapus === 'menghapus' ? null : () => setAkanDihapus(null)}
        label="Hapus hasil lab"
      >
        {akanDihapus ? (
          <>
            <Text style={{ ...typography.title, color: colors.text }}>Hapus hasil lab ini?</Text>
            <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 23 }}>
              {akanDihapus.nama}, {formatTanggalPanjang(akanDihapus.tanggal).split(', ')[1]} {akanDihapus.tanggal.slice(0, 4)} ·{' '}
              {akanDihapus.penanda.length} penanda. Coach tidak lagi membacanya sebagai konteks, dan penghapusan ini tidak
              bisa dibatalkan.
            </Text>
            {statusHapus === 'gagal' ? (
              <Text accessibilityLiveRegion="polite" style={{ ...typography.label, fontWeight: '500', color: colors.aksenTeks.coral }}>
                Belum terhapus. Periksa koneksi, lalu coba lagi.
              </Text>
            ) : null}
            <View style={{ gap: spacing.sm }}>
              <TombolUtama merusak label="Hapus hasil lab" memproses={statusHapus === 'menghapus'} onPress={() => void jalankanHapus()} />
              <TombolBertepi label="Batal" onPress={() => setAkanDihapus(null)} nonaktif={statusHapus === 'menghapus'} />
            </View>
          </>
        ) : null}
      </KerangkaSheet>
    </ScrollView>
  );
}

function KartuHasilLab({ hasil, onUbah, onHapus }: { hasil: HasilLab; onUbah: () => void; onHapus: () => void }) {
  const r = ringkasHasilLab(hasil);
  const tanggal = formatTanggalPanjang(hasil.tanggal).split(', ')[1];
  const ringkasan = kalimatRingkasanLab(r);
  const luar = r.diLuarRentang.map((p) => `${p.nama} ${posisiPenanda(p)}`);
  return (
    <Card style={{ gap: spacing.sm }}>
      <View
        accessible
        accessibilityLabel={`${hasil.nama}, ${tanggal} ${hasil.tanggal.slice(0, 4)}${hasil.laboratorium ? `, ${hasil.laboratorium}` : ''}. ${ringkasan}.${luar.length ? ` ${luar.join('; ')}.` : ''}`}
        style={{ gap: spacing.sm }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md }}>
          <Text style={{ flex: 1, ...typography.body, fontWeight: '700', color: colors.text }}>{hasil.nama}</Text>
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>{tanggal}</Text>
        </View>
        {hasil.laboratorium ? (
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>{hasil.laboratorium}</Text>
        ) : null}
        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>{ringkasan}</Text>
        {r.diLuarRentang.length > 0 ? (
          <View style={{ gap: 2 }}>
            {r.diLuarRentang.map((p) => (
              <Text key={p.nama} style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>
                · {p.nama}: {posisiPenanda(p)} rujukan
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      {/* Tindakan terpisah dari isi kartu: tetap terjangkau pembaca layar. */}
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ubah ${hasil.nama}, ${tanggal} ${hasil.tanggal.slice(0, 4)}`}
          onPress={() => {
            ketukRingan();
            onUbah();
          }}
          style={({ pressed }) => ({ minHeight: TAP_MIN, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ ...typography.label, color: colors.amber }}>Ubah</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Hapus ${hasil.nama}, ${tanggal} ${hasil.tanggal.slice(0, 4)}`}
          onPress={() => {
            ketukRingan();
            onHapus();
          }}
          style={({ pressed }) => ({ minHeight: TAP_MIN, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ ...typography.label, color: colors.aksenTeks.coral }}>Hapus</Text>
        </Pressable>
      </View>
    </Card>
  );
}
