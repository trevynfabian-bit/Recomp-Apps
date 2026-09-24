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
import {
  Card,
  HeaderLayar,
  KeadaanGagal,
  KeadaanKosong,
  KeadaanMemuat,
  KerangkaSheet,
  PenandaSumber,
  SectionHeader,
  Tombol,
} from '@/components';
import { KesalahanHasilLab } from '@/data/hasilLab';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { SUMBER_HASIL_LAB } from '@/lib/sumber';
import { useHasilLab } from '@/state/hasilLab';
import { colors, ukuranIkon, spacing, TAP_MIN, typography } from '@/theme';

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
      style={{ flex: 1, backgroundColor: colors.latar }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.xl,
      }}
    >
      <HeaderLayar
        kembali
        judul="Hasil lab"
        subjudul={statusMuat === 'memuat' ? 'Memuat…' : statusMuat === 'gagal' ? 'Belum termuat' : riwayat.length > 0 ? `${riwayat.length} hasil tersimpan` : 'Belum ada yang tersimpan'}
      />

      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <Ionicons name="flask-outline" size={ukuranIkon.sedang} color={colors.teksRedup} />
        <Text style={{ flex: 1, ...typography.labelBiasa, color: colors.teksRedup }}>
          Dibaca coach sebagai konteks, bukan dasar saran dosis atau diagnosis. Semua angka di sini data mentah yang
          Anda salin; app tidak memperkirakan atau membulatkannya. Rentang rujukan adalah milik laboratorium yang
          memeriksa; artinya dibicarakan dengan dokter.
        </Text>
      </View>

      {statusMuat === 'memuat' ? <KeadaanMemuat tampilan="kartu" label="Memuat hasil lab…" /> : null}

      {statusMuat === 'gagal' ? (
        <KeadaanGagal judul="Hasil lab belum termuat" keterangan={pesanGagal} aksi={{ label: 'Coba lagi', onPress: muatUlang }} />
      ) : null}

      {statusMuat === 'siap' && kelompok.length === 0 ? (
        <KeadaanKosong
          ikon="flask-outline"
          judul="Belum ada hasil lab"
          keterangan="Hasil lab yang Anda tambahkan akan tampil di sini, dikelompokkan per tahun, dan dibaca coach sebagai konteks."
        />
      ) : null}

      {statusHapus === 'terhapus' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.status.sukses.teks }}>
          Hasil lab dihapus.
        </Text>
      ) : null}

      <Tombol label="Tambah hasil lab" nonaktif={statusMuat !== 'siap'} onPress={() => router.push('/tambah-hasil-lab')} />

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
            <Text style={{ ...typography.title, color: colors.teks }}>Hapus hasil lab ini?</Text>
            <Text style={{ ...typography.body, color: colors.teksRedup }}>
              {akanDihapus.nama}, {formatTanggalPanjang(akanDihapus.tanggal).split(', ')[1]} {akanDihapus.tanggal.slice(0, 4)} ·{' '}
              {akanDihapus.penanda.length} penanda. Coach tidak lagi membacanya sebagai konteks, dan penghapusan ini tidak
              bisa dibatalkan.
            </Text>
            {statusHapus === 'gagal' ? (
              <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.status.bahaya.teks }}>
                {pesanGagalHapus}
              </Text>
            ) : null}
            <View style={{ gap: spacing.sm }}>
              <Tombol varian="merusak" label="Hapus hasil lab" memproses={statusHapus === 'menghapus'} onPress={() => void jalankanHapus()} />
              <Tombol varian="bertepi" label="Batal" onPress={() => setAkanDihapus(null)} nonaktif={statusHapus === 'menghapus'} />
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
          <Text style={{ flex: 1, ...typography.bodyTebal, color: colors.teks }}>{hasil.nama}</Text>
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>{tanggal}</Text>
        </View>
        {hasil.laboratorium ? (
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>{hasil.laboratorium}</Text>
        ) : null}
        <PenandaSumber jenis={SUMBER_HASIL_LAB.jenis} detail={SUMBER_HASIL_LAB.detail} />
        <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>{ringkasan}</Text>
        {r.diLuarRentang.length > 0 ? (
          <View style={{ gap: spacing.xxs }}>
            {r.diLuarRentang.map((p) => (
              <Text key={p.nama} style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
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
          <Text style={{ ...typography.label, color: colors.teks }}>
            {nilaiTerbuka ? 'Sembunyikan nilai' : `Lihat ${hasil.penanda.length} nilai`}
          </Text>
        </Pressable>
        <Tombol
          varian="teks"
          ukuran="kecil"
          label="Ubah"
          aksesLabel={`Ubah ${hasil.nama}, ${tanggal} ${hasil.tanggal.slice(0, 4)}`}
          onPress={() => onUbah()}
        />
        <Tombol
          varian="teks"
          ukuran="kecil"
          nada="bahaya"
          label="Hapus"
          aksesLabel={`Hapus ${hasil.nama}, ${tanggal} ${hasil.tanggal.slice(0, 4)}`}
          onPress={() => onHapus()}
        />
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
    <View style={{ gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.garis }}>
      <Text style={{ ...typography.caption, color: colors.teksSamar }}>DATA MENTAH · SEPERTI TERTULIS DI HASIL LAB</Text>
      <View accessibilityRole="list" style={{ gap: spacing.sm }}>
        {barisDataMentahLab(hasil).map((b) => (
          <View key={b.nama} accessible accessibilityLabel={b.aksesLabel} style={{ gap: spacing.xxs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md }}>
              <Text style={{ flex: 1, ...typography.labelBiasa, color: colors.teksRedup }}>{b.nama}</Text>
              <Text style={{ ...typography.label, color: colors.teks }}>{b.nilai}</Text>
            </View>
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              {b.rujukan}
              {b.posisi === 'di atas rentang' || b.posisi === 'di bawah rentang' ? ` · ${b.posisi}` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
