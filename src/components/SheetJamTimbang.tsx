import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import {
  formatJamMenit,
  geserJamTimbang,
  LANGKAH_JAM_MENIT,
  RENTANG_JAM_TIMBANG,
  ringkasJadwal,
  saranJamTimbang,
} from '@recomp/logika';
import type { JamPengingat } from '@recomp/logika';
import { JudulSheet, KerangkaSheet } from './KerangkaSheet';
import { Tombol, TombolIkon } from './Tombol';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { colors, spacing, typography } from '@/theme';
import { Panel } from './Card';

/** Jam akhir pekan yang ditawarkan saat sakelarnya pertama dinyalakan. */
const GESER_AKHIR_PEKAN_MENIT = 60;

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  jam: JamPengingat;
  /** Waktu timbang yang sudah tercatat, untuk saran dari kebiasaan. */
  waktuTimbang: string[];
  onSimpan: (jam: JamPengingat) => void;
};

/**
 * Jam pengingat timbang pagi.
 *
 * Dua hal yang membedakannya dari sekadar pemilih jam:
 *   • akhir pekan boleh punya jam sendiri — pengingat 06.30 di hari Minggu
 *     membangunkan orang yang tidak sedang terlambat untuk apa pun;
 *   • saran dari KEBIASAAN: bila sudah ada cukup timbangan, jam yang
 *     disarankan adalah sesudah jam biasanya timbang, karena pengingat hanya
 *     muncul di pagi yang terlewat. Saran bukan pengganti — ia satu ketukan
 *     untuk diterima, dan alasannya disebut.
 */
export function SheetJamTimbang({ terbuka, onTutup, jam, waktuTimbang, onSimpan }: Props) {
  const [draf, setDraf] = useState<JamPengingat>(jam);

  // Draf diisi ulang hanya saat sheet DIBUKA. Bergantung pada `jam` juga akan
  // menghapus suntingan yang sedang berjalan setiap kali induknya kebetulan
  // merender ulang.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (terbuka) setDraf(jam);
  }, [terbuka]);

  const saran = saranJamTimbang(waktuTimbang);
  const bedaAkhirPekan = draf.akhirPekanMenit !== null;

  return (
    <KerangkaSheet terbuka={terbuka} onTutup={onTutup} label="Pengingat timbang">
      <JudulSheet>Jam pengingat</JudulSheet>
      <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
        Pengingat hanya muncul di pagi yang belum ada timbangannya. Pilih jam sedikit sesudah Anda
        biasanya timbang.
      </Text>

      {saran && saran.saranMenit !== draf.hariKerjaMenit ? (
        <Panel>
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            Biasanya Anda timbang sekitar {formatJamMenit(saran.kebiasaanMenit)} ({saran.dasar} pagi terakhir).
          </Text>
          <Tombol
            varian="teks"
            ukuran="kecil"
            label={`Pakai ${formatJamMenit(saran.saranMenit)}`}
            aksesLabel={`Pakai jam ${formatJamMenit(saran.saranMenit)} untuk hari kerja`}
            onPress={() => setDraf((d) => ({ ...d, hariKerjaMenit: saran.saranMenit }))}
          />
        </Panel>
      ) : null}

      <PengaturJam
        label={bedaAkhirPekan ? 'Senin–Jumat' : 'Setiap hari'}
        menit={draf.hariKerjaMenit}
        onUbah={(m) => setDraf((d) => ({ ...d, hariKerjaMenit: m }))}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Text style={{ ...typography.body, color: colors.teks, flex: 1 }}>Jam lain di akhir pekan</Text>
        <Switch
          accessibilityLabel="Jam lain di akhir pekan"
          value={bedaAkhirPekan}
          onValueChange={(v) => {
            ketukRingan();
            setDraf((d) => ({
              ...d,
              akhirPekanMenit: v ? geserJamTimbang(d.hariKerjaMenit, GESER_AKHIR_PEKAN_MENIT) : null,
            }));
          }}
          trackColor={{ true: colors.status.sukses.isian, false: colors.permukaanCekung }}
          thumbColor={colors.teks}
        />
      </View>

      {draf.akhirPekanMenit !== null ? (
        <PengaturJam
          label="Sabtu–Minggu"
          menit={draf.akhirPekanMenit}
          onUbah={(m) => setDraf((d) => ({ ...d, akhirPekanMenit: m }))}
        />
      ) : null}

      <Text style={{ ...typography.label, color: colors.teksSamar }}>{ringkasJadwal(draf)}</Text>

      <View style={{ gap: spacing.sm }}>
        <Tombol
          label="Simpan"
          onPress={() => {
            ketukBerhasil();
            onSimpan(draf);
            onTutup();
          }}
        />
        <Tombol varian="bertepi" label="Batal" onPress={onTutup} />
      </View>
    </KerangkaSheet>
  );
}

function PengaturJam({ label, menit, onUbah }: { label: string; menit: number; onUbah: (m: number) => void }) {
  const jam = formatJamMenit(menit);
  const geser = (arah: 1 | -1) => onUbah(geserJamTimbang(menit, arah * LANGKAH_JAM_MENIT));
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}, ${jam}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => geser(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Text style={{ ...typography.label, color: colors.teksRedup }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <TombolGeser label="−" nonaktif={menit <= RENTANG_JAM_TIMBANG.min} onPress={() => geser(-1)} />
        <Text style={{ ...typography.title, color: colors.teks, minWidth: 72, textAlign: 'center' }}>{jam}</Text>
        <TombolGeser label="+" nonaktif={menit >= RENTANG_JAM_TIMBANG.maks} onPress={() => geser(1)} />
      </View>
    </View>
  );
}

function TombolGeser({ label, onPress, nonaktif }: { label: '−' | '+'; onPress: () => void; nonaktif: boolean }) {
  return (
    // Pembaca layar memakai aksi naik/turun pada pembungkus `adjustable`.
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <TombolIkon
        ikon={label === '+' ? 'add' : 'remove'}
        aksesLabel={label === '+' ? 'Lebih siang' : 'Lebih pagi'}
        nonaktif={nonaktif}
        onPress={onPress}
      />
    </View>
  );
}
