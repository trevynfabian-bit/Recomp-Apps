import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import {
  formatAngka,
  formatDesimal,
  formatMakro,
  formatTanggalPanjang,
  LAJU_PER_MINGGU,
  labelBerat,
  tampilkanBerat,
} from '@recomp/logika';
import type { Fase } from '@recomp/logika';
import { KerangkaSheet } from './KerangkaSheet';
import { PemilihFase } from './PemilihFase';
import { TombolBertepi, TombolUtama } from './Tombol';
import { ketukBerhasil } from '@/lib/haptics';
import { useProfil } from '@/state/profil';
import { useTarget } from '@/state/target';
import { colors, spacing, typography } from '@/theme';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  /**
   * Fase yang sudah dipilih di luar sheet (mis. pemilih di layar Budget):
   * sheet langsung ke konfirmasi. Tanpa ini, sheet mulai dari memilih.
   */
  calon?: Fase | null;
};

const tanggalRingkas = (t: string) => formatTanggalPanjang(t).split(', ')[1];
/** Untuk pembaca layar; target yang belum diisi disebut begitu, bukan nol. */
const kalori = (t: { target_kalori: number } | null) => (t ? `${formatAngka(t.target_kalori)} kilokalori` : 'belum diisi');
const protein = (t: { target_protein_g: number } | null) => (t ? `${formatMakro(t.target_protein_g)} gram` : 'belum diisi');
const persen = (n: number) => `${n > 0 ? '+' : ''}${formatDesimal(n * 100, 2)}%`;

/**
 * Ganti fase program, dengan konfirmasi yang menyebut ANGKANYA.
 *
 * Mengganti fase menukar target setiap tipe hari, memulai koridor Tren baru,
 * dan menutup satu periode di riwayat. Kalimat umum ("target akan berubah")
 * tidak membantu orang memutuskan; "Rest 2.450 → 2.000 kcal" membantu.
 *
 * Isi konfirmasi berasal dari `pratinjauGantiFase` — aturan yang sama dengan
 * yang menyimpan (kembaran `ganti_fase`), jadi yang dijanjikan di sini adalah
 * yang terjadi: ditutup kemarin, atau diganti bila fase lama baru dimulai
 * hari ini.
 */
export function SheetGantiFase({ terbuka, onTutup, calon: calonAwal = null }: Props) {
  const { profil, riwayatFase, pratinjauGantiFase, gantiFase } = useProfil();
  const { tipeHari, cariTarget } = useTarget();
  const [calon, setCalon] = useState<Fase | null>(calonAwal);

  useEffect(() => {
    if (terbuka) setCalon(calonAwal);
  }, [terbuka, calonAwal]);

  if (!terbuka) return null;

  // --- Langkah 1: memilih ----------------------------------------------------
  if (calon === null || calon === profil.fase_aktif) {
    const terbaru = [...riwayatFase].reverse().slice(0, 3);
    return (
      <KerangkaSheet terbuka onTutup={onTutup} label="Fase">
        <Text style={{ ...typography.title, color: colors.text }}>Fase program</Text>
        <PemilihFase terpilih={profil.fase_aktif} onPilih={setCalon} />
        <View style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.caption, color: colors.textMuted }}>RIWAYAT</Text>
          <View accessibilityRole="list" style={{ gap: spacing.xs }}>
            {terbaru.map((p) => (
              <View key={`${p.fase}-${p.mulai}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                <Text style={{ ...typography.label, color: p.selesai === null ? colors.text : colors.textMuted }}>{p.fase}</Text>
                <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>
                  {p.selesai === null
                    ? `sejak ${tanggalRingkas(p.mulai)}`
                    : `${tanggalRingkas(p.mulai)} – ${tanggalRingkas(p.selesai)}`}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <TombolBertepi label="Tutup" onPress={onTutup} />
      </KerangkaSheet>
    );
  }

  // --- Langkah 2: konfirmasi --------------------------------------------------
  const { hasil, jangkar, tanggal } = pratinjauGantiFase(calon);
  const laju = LAJU_PER_MINGGU[calon];
  const kembaliKePilih = () => (calonAwal ? onTutup() : setCalon(null));
  const berat = (kg: number) => `${formatDesimal(tampilkanBerat(kg, profil.satuan), 1)} ${labelBerat(profil.satuan)}`;

  let kalimatRiwayat: string;
  if (hasil.jenis === 'ditutup') {
    kalimatRiwayat = hasil.ditutup
      ? `Periode ${hasil.ditutup.fase} sejak ${tanggalRingkas(hasil.ditutup.mulai)} ditutup kemarin; hari-hari itu tetap tercatat sebagai ${hasil.ditutup.fase}.`
      : `Periode ${calon} dimulai hari ini.`;
  } else if (hasil.jenis === 'diganti') {
    kalimatRiwayat = `${hasil.diganti.fase} baru dimulai hari ini, jadi langsung diganti; tidak ada hari yang tercatat sebagai ${hasil.diganti.fase}.`;
  } else if (hasil.jenis === 'ditolak') {
    kalimatRiwayat = hasil.alasan;
  } else {
    kalimatRiwayat = `${calon} sudah berjalan; tidak ada yang berubah.`;
  }
  const bisaGanti = hasil.jenis === 'ditutup' || hasil.jenis === 'diganti';

  return (
    <KerangkaSheet terbuka onTutup={onTutup} label="Ganti fase">
      <Text style={{ ...typography.title, color: colors.text }}>Ganti ke {calon}?</Text>
      <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 23 }}>
        Mulai hari ini, {tanggalRingkas(tanggal)}. Hari yang sudah lewat tetap memakai target {profil.fase_aktif}.
      </Text>

      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.caption, color: colors.textMuted }}>TARGET HARIAN</Text>
        <View accessibilityRole="list" style={{ gap: spacing.sm }}>
          {tipeHari.map((d) => {
            const lama = cariTarget(d.id, profil.fase_aktif);
            const baru = cariTarget(d.id, calon);
            return (
              <View
                key={d.id}
                accessible
                accessibilityLabel={`${d.nama}: ${kalori(lama)} menjadi ${kalori(baru)}, protein ${protein(lama)} menjadi ${protein(baru)}`}
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}
              >
                <Text style={{ ...typography.label, color: colors.text }}>{d.nama}</Text>
                <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, textAlign: 'right' }}>
                  {lama || baru
                    ? `${lama ? formatAngka(lama.target_kalori) : '–'} → ${baru ? formatAngka(baru.target_kalori) : '–'} kcal · P ${lama ? formatMakro(lama.target_protein_g) : '–'} → ${baru ? formatMakro(baru.target_protein_g) : '–'} g`
                    : 'belum diisi'}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ gap: spacing.md }}>
        <Butir ikon="trending-up-outline">
          Sasaran laju {persen(laju.min)} s/d {persen(laju.maks)} berat per pekan.
        </Butir>
        <Butir ikon="analytics-outline">
          {jangkar.rataRataKg !== null
            ? `Koridor Tren berangkat dari rata-rata 7 hari: ${berat(jangkar.rataRataKg)} (${jangkar.jumlahTimbangan} timbangan).`
            : 'Belum ada timbangan dalam 7 hari terakhir; koridor Tren menunggu timbangan pertama.'}
        </Butir>
        <Butir ikon="time-outline">{kalimatRiwayat}</Butir>
      </View>

      <View style={{ gap: spacing.sm }}>
        {bisaGanti ? (
          <TombolUtama
            label={`Ganti ke ${calon}`}
            onPress={() => {
              gantiFase(calon);
              ketukBerhasil();
              onTutup();
            }}
          />
        ) : null}
        <TombolBertepi label="Batal" onPress={kembaliKePilih} />
      </View>
    </KerangkaSheet>
  );
}

function Butir({ ikon, children }: { ikon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <Ionicons name={ikon} size={20} color={colors.textMuted} />
      <Text style={{ flex: 1, ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
        {children}
      </Text>
    </View>
  );
}
