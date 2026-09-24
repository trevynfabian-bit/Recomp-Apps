import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  barisDataMentahLab,
  formatTanggalPanjang,
  kalimatRingkasanLab,
  kelompokkanPerTahun,
  posisiPenanda,
  ringkasHasilLab,
} from '@recomp/logika';
import type { HasilLab } from '@recomp/logika';
import { Card, KerangkaSheet, PenandaSumber, SectionHeader, TombolBertepi, TombolUtama } from '@/components';
import { KesalahanHasilLab } from '@/data/hasilLab';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { SUMBER_HASIL_LAB } from '@/lib/sumber';
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
 * Setiap entri berlabel data mentah (`SUMBER_HASIL_LAB`): angkanya disalin
 * dari kertas hasil, tidak diperkirakan app. Nilai lengkapnya bisa dibuka per
 * kartu, persis seperti tertulis, supaya yang dibaca coach bisa diperiksa.
 *
 * Riwayat dari `useHasilLab`: dari Supabase saat masuk, atau tiruan tanpa
 * kredensial Supabase. Gagal memuat hanya berpengaruh di layar ini.
 */
export default function HasilLabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { riwayat, status: statusMuat, pesanGagal, muatUlang, hapus } = useHasilLab();
  const kelompok = kelompokkanPerTahun(riwayat);
  /** Entri yang sedang dikonfirmasi untuk dihapus. */
  const [akanDihapus, setAkanDihapus] = useState<HasilLab | null>(null);
  const [statusHapus, setStatusHapus] = useState<'diam' | 'menghapus' | 'gagal' | 'terhapus'>('diam');
  const [pesanGagalHapus, setPesanGagalHapus] = useState('');

  async function jalankanHapus() {
    if (!akanDihapus) return;
    setStatusHapus('menghapus');
    try {
      await hapus(akanDihapus.id);
      ketukBerhasil();
      setAkanDihapus(null);
      setStatusHapus('terhapus');
    } catch (e) {
      setPesanGagalHapus(e instanceof KesalahanHasilLab ? e.message : 'Belum terhapus. Periksa koneksi, lalu coba lagi.');
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
          <Text style={{ ...typography.label, color: colors.textFaint, marginTop: spacing.xxs }}>
            {statusMuat === 'memuat'
              ? 'Memuat…'
              : statusMuat === 'gagal'
                ? 'Belum termuat'
                : riwayat.length > 0
                  ? `${riwayat.length} hasil tersimpan`
                  : 'Belum ada yang tersimpan'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <Ionicons name="flask-outline" size={20} color={colors.textMuted} />
        <Text style={{ flex: 1, ...typography.labelBiasa, color: colors.textMuted }}>
          Dibaca coach sebagai konteks, bukan dasar saran dosis atau diagnosis. Semua angka di sini data mentah yang
          Anda salin; app tidak memperkirakan atau membulatkannya. Rentang rujukan adalah milik laboratorium yang
          memeriksa; artinya dibicarakan dengan dokter.
        </Text>
      </View>

      {statusMuat === 'gagal' ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.bodyTebal, color: colors.text }}>Hasil lab belum termuat</Text>
          <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.textMuted }}>
            {pesanGagal}
          </Text>
          <TombolBertepi label="Coba lagi" onPress={muatUlang} />
        </Card>
      ) : null}

      {statusMuat === 'siap' && kelompok.length === 0 ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.bodyTebal, color: colors.text }}>Belum ada hasil lab</Text>
          <Text style={{ ...typography.labelBiasa, color: colors.textMuted }}>
            Hasil lab yang Anda tambahkan akan tampil di sini, dikelompokkan per tahun, dan dibaca coach sebagai konteks.
          </Text>
        </Card>
      ) : null}

      {statusHapus === 'terhapus' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.aksenTeks.jade }}>
          Hasil lab dihapus.
        </Text>
      ) : null}

      <TombolUtama label="Tambah hasil lab" nonaktif={statusMuat !== 'siap'} onPress={() => router.push('/tambah-hasil-lab')} />

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
            <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 24 }}>
              {akanDihapus.nama}, {formatTanggalPanjang(akanDihapus.tanggal).split(', ')[1]} {akanDihapus.tanggal.slice(0, 4)} ·{' '}
              {akanDihapus.penanda.length} penanda. Coach tidak lagi membacanya sebagai konteks, dan penghapusan ini tidak
              bisa dibatalkan.
            </Text>
            {statusHapus === 'gagal' ? (
              <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.aksenTeks.coral }}>
                {pesanGagalHapus}
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
  const [nilaiTerbuka, setNilaiTerbuka] = useState(false);
  const r = ringkasHasilLab(hasil);
  const tanggal = formatTanggalPanjang(hasil.tanggal).split(', ')[1];
  const ringkasan = kalimatRingkasanLab(r);
  const luar = r.diLuarRentang.map((p) => `${p.nama} ${posisiPenanda(p)}`);
  return (
    <Card style={{ gap: spacing.sm }}>
      <View
        accessible
        accessibilityLabel={`${hasil.nama}, ${tanggal} ${hasil.tanggal.slice(0, 4)}${hasil.laboratorium ? `, ${hasil.laboratorium}` : ''}. Data mentah, ${SUMBER_HASIL_LAB.detail}. ${ringkasan}.${luar.length ? ` ${luar.join('; ')}.` : ''}`}
        style={{ gap: spacing.sm }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md }}>
          <Text style={{ flex: 1, ...typography.bodyTebal, color: colors.text }}>{hasil.nama}</Text>
          <Text style={{ ...typography.labelBiasa, color: colors.textFaint }}>{tanggal}</Text>
        </View>
        {hasil.laboratorium ? (
          <Text style={{ ...typography.labelBiasa, color: colors.textFaint }}>{hasil.laboratorium}</Text>
        ) : null}
        <PenandaSumber jenis={SUMBER_HASIL_LAB.jenis} detail={SUMBER_HASIL_LAB.detail} />
        <Text style={{ ...typography.labelBiasa, color: colors.textMuted }}>{ringkasan}</Text>
        {r.diLuarRentang.length > 0 ? (
          <View style={{ gap: spacing.xxs }}>
            {r.diLuarRentang.map((p) => (
              <Text key={p.nama} style={{ ...typography.labelBiasa, color: colors.textMuted }}>
                · {p.nama}: {posisiPenanda(p)} rujukan
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      {nilaiTerbuka ? <DataMentahLab hasil={hasil} /> : null}
      {/* Tindakan terpisah dari isi kartu: tetap terjangkau pembaca layar. */}
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${nilaiTerbuka ? 'Sembunyikan' : 'Lihat'} ${hasil.penanda.length} nilai ${hasil.nama}, ${tanggal} ${hasil.tanggal.slice(0, 4)}`}
          accessibilityState={{ expanded: nilaiTerbuka }}
          onPress={() => {
            ketukRingan();
            setNilaiTerbuka((t) => !t);
          }}
          style={({ pressed }) => ({ minHeight: TAP_MIN, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ ...typography.label, color: colors.text }}>
            {nilaiTerbuka ? 'Sembunyikan nilai' : `Lihat ${hasil.penanda.length} nilai`}
          </Text>
        </Pressable>
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

/**
 * Nilai tiap penanda persis seperti disalin: nilai, satuan, rentang rujukan
 * lab, dan posisinya. Semua data mentah, jadi warnanya netral — posisi di
 * luar rentang ditulis dengan kata, bukan diberi warna alarm.
 */
function DataMentahLab({ hasil }: { hasil: HasilLab }) {
  return (
    <View style={{ gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text style={{ ...typography.caption, color: colors.textFaint }}>DATA MENTAH · SEPERTI TERTULIS DI HASIL LAB</Text>
      <View accessibilityRole="list" style={{ gap: spacing.sm }}>
        {barisDataMentahLab(hasil).map((b) => (
          <View key={b.nama} accessible accessibilityLabel={b.aksesLabel} style={{ gap: spacing.xxs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md }}>
              <Text style={{ flex: 1, ...typography.labelBiasa, color: colors.textMuted }}>{b.nama}</Text>
              <Text style={{ ...typography.label, color: colors.text }}>{b.nilai}</Text>
            </View>
            <Text style={{ ...typography.caption, color: colors.textFaint }}>
              {b.rujukan}
              {b.posisi === 'di atas rentang' || b.posisi === 'di bawah rentang' ? ` · ${b.posisi}` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
