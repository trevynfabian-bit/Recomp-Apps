import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  aturanDeteksiTipeHari,
  formatAngka,
  formatMakro,
  formatTanggalPanjang,
  isianBerubah,
  isianDariTarget,
  karboTersisaG,
  periksaTarget,
  periodeBerjalan,
  susunMatriksTarget,
} from '@recomp/logika';
import type { Fase, IsianTarget, KolomTarget, NilaiTarget } from '@recomp/logika';
import {
  Card,
  KerangkaSheet,
  MatriksTarget,
  PemilihTipeHari,
  Pill,
  SectionHeader,
  SheetGantiFase,
  TombolBertepi,
  TombolUtama,
} from '@/components';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { useHariIni } from '@/state/hariIni';
import { useProfil } from '@/state/profil';
import { useTarget, type PerubahanTarget } from '@/state/target';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';
import type { DayType } from '@/types/domain';

const FASE: Fase[] = ['Maintenance', 'Lean Gain', 'Cut'];

const KOLOM: { kunci: KolomTarget; label: string; unit: string }[] = [
  { kunci: 'kalori', label: 'Kalori', unit: 'kcal' },
  { kunci: 'protein', label: 'Protein', unit: 'g' },
  { kunci: 'lemak', label: 'Lemak', unit: 'g' },
  { kunci: 'satFat', label: 'Batas sat fat', unit: 'g' },
];

const kunciBaris = (dayTypeId: string, fase: Fase) => `${dayTypeId}|${fase}`;

type Status = { jenis: 'diam' } | { jenis: 'menyimpan' } | { jenis: 'tersimpan'; jumlah: number } | { jenis: 'gagal' };

/**
 * Target harian per tipe hari.
 *
 * Angka ABSOLUT per (tipe hari x fase), bukan pengali (PRD): yang ditulis di
 * sini adalah yang muncul di Hari Ini. Ketiga fase bisa disunting dari satu
 * layar, karena target Cut paling masuk akal disiapkan SEBELUM berpindah ke
 * Cut, bukan setelahnya.
 *
 * Di atas, "Berlaku hari ini": tipe hari ini (pemilih yang SAMA dengan Hari
 * Ini, lewat `useHariIni`, jadi memilih di satu tempat mengubah keduanya) dan
 * fase aktif dengan tombol ganti fase yang meminta konfirmasi berangka.
 *
 * Halaman ini dibuka untuk MEMBACA lebih dulu: tiap tipe hari dengan
 * targetnya, sisa karbo, kapan ia terpilih otomatis (`aturanDeteksiTipeHari`),
 * dan tanda tipe hari ini beserta alasannya. Menyunting adalah mode yang
 * dipilih dengan sengaja — form yang selalu terbuka membuat satu ketukan
 * salah di kolom kalori terasa seperti hal biasa.
 *
 * Aturannya dari `periksaTarget` (@recomp/logika) — batas yang sama dengan
 * database, plus dua aturan lintas kolom (sat fat di dalam lemak; protein +
 * lemak muat di kalori). Galat baru tampil setelah kolomnya ditinggalkan
 * atau saat menyimpan, supaya mengetik "2" menuju "2450" tidak disambut
 * pesan galat.
 *
 * Perubahan berlaku mulai hari ini; hari yang sudah lewat menyimpan target
 * saat itu (snapshot di `daily_logs`), jadi catatan lama tidak berubah angka.
 *
 * Fase 4 sisi frontend: simpan lewat `useTarget` (tiruan di memori).
 */
export default function TargetHarianScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profil, riwayatFase } = useProfil();
  const { tipeHari, target, cariTarget, simpanTarget } = useTarget();
  const [fase, setFase] = useState<Fase>(profil.fase_aktif);
  /** Isian yang sudah disentuh, per baris; baris lain memakai nilai tersimpan. */
  const [draf, setDraf] = useState<Record<string, IsianTarget>>({});
  /** Kolom yang sudah ditinggalkan (blur): galatnya boleh tampil. */
  const [disentuh, setDisentuh] = useState<Record<string, true>>({});
  const [cobaSimpan, setCobaSimpan] = useState(false);
  const [status, setStatus] = useState<Status>({ jenis: 'diam' });
  const [konfirmasiKeluar, setKonfirmasiKeluar] = useState(false);
  /** Membaca lebih dulu; menyunting adalah langkah yang dipilih, bukan keadaan bawaan. */
  const [mode, setMode] = useState<'baca' | 'sunting'>('baca');
  const { dayTypeId: tipeHariIni, override, deteksi: deteksiHariIni, pilihTipeHari, kembalikanAuto } = useHariIni();
  const [sheetFase, setSheetFase] = useState(false);
  const faseMulai = periodeBerjalan(riwayatFase)?.mulai ?? null;
  // Fase diganti dari halaman ini (atau di tempat lain): tab fase ikut fase yang baru aktif.
  useEffect(() => {
    if (mode === 'baca') setFase(profil.fase_aktif);
    // Hanya saat fase aktif berganti, bukan saat mode berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil.fase_aktif]);
  const menyunting = mode === 'sunting';
  /** Mode baca: satu fase dalam kartu, atau ketiga fase berdampingan. */
  const [tampilan, setTampilan] = useState<'per-fase' | 'matriks'>('per-fase');
  const matriks = !menyunting && tampilan === 'matriks';
  const barisMatriks = useMemo(() => susunMatriksTarget(tipeHari, target), [tipeHari, target]);

  const isianBaris = (dt: string, f: Fase) => draf[kunciBaris(dt, f)] ?? isianDariTarget(cariTarget(dt, f));

  // Baris yang BENAR-BENAR berubah (setelah diurai: "2.450" = 2450 bukan perubahan).
  const berubah = useMemo(
    () =>
      Object.entries(draf)
        .map(([kunci, isian]) => {
          const [dayTypeId, f] = kunci.split('|') as [string, Fase];
          return { kunci, dayTypeId, fase: f, isian, hasil: periksaTarget(isian) };
        })
        .filter((b) => isianBerubah(b.isian, cariTarget(b.dayTypeId, b.fase))),
    [draf, cariTarget],
  );
  const adaTidakSah = berubah.some((b) => !b.hasil.sah);
  const faseDiubah = new Set(berubah.map((b) => b.fase));
  const menyimpan = status.jenis === 'menyimpan';

  function ubah(dt: string, kolom: KolomTarget, teks: string) {
    const k = kunciBaris(dt, fase);
    setDraf((d) => ({ ...d, [k]: { ...(d[k] ?? isianDariTarget(cariTarget(dt, fase))), [kolom]: teks } }));
    if (status.jenis !== 'menyimpan') setStatus({ jenis: 'diam' });
  }

  function kembalikan(dt: string) {
    const k = kunciBaris(dt, fase);
    setDraf(({ [k]: _buang, ...sisa }) => sisa);
    setDisentuh((d) => Object.fromEntries(Object.entries(d).filter(([x]) => !x.startsWith(`${k}|`))));
  }

  function buangSemua() {
    setDraf({});
    setDisentuh({});
    setCobaSimpan(false);
    setStatus({ jenis: 'diam' });
  }

  async function simpan() {
    if (berubah.length === 0 || menyimpan) return;
    if (adaTidakSah) {
      // Tunjukkan semua galat, dan bawa ke fase pertama yang perlu diperbaiki.
      setCobaSimpan(true);
      const pertama = berubah.find((b) => !b.hasil.sah);
      if (pertama && pertama.fase !== fase) setFase(pertama.fase);
      return;
    }
    setStatus({ jenis: 'menyimpan' });
    const perubahan: PerubahanTarget[] = berubah.map((b) => ({
      day_type_id: b.dayTypeId,
      fase: b.fase,
      nilai: (b.hasil as Extract<typeof b.hasil, { sah: true }>).nilai,
    }));
    try {
      await simpanTarget(perubahan);
      ketukBerhasil();
      setDraf({});
      setDisentuh({});
      setCobaSimpan(false);
      setStatus({ jenis: 'tersimpan', jumlah: perubahan.length });
      setMode('baca');
    } catch {
      setStatus({ jenis: 'gagal' });
    }
  }

  function kembali() {
    if (menyunting && berubah.length > 0) setKonfirmasiKeluar(true);
    else router.back();
  }

  function selesaiMenyunting() {
    buangSemua();
    setMode('baca');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
              kembali();
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
              Target per tipe hari
            </Text>
            <Text style={{ ...typography.label, color: colors.textFaint, marginTop: 2 }}>
              Angka absolut, berlaku mulai hari ini
            </Text>
          </View>
        </View>

        {!menyunting ? (
          <View>
            <SectionHeader judul="Berlaku hari ini" aksi={override ? 'tipe hari diubah manual' : 'tipe hari otomatis'} />
            <View style={{ gap: spacing.md }}>
              <PemilihTipeHari
                daftar={tipeHari}
                terpilihId={tipeHariIni}
                target={cariTarget(tipeHariIni, profil.fase_aktif)}
                fase={profil.fase_aktif}
                override={override}
                deteksi={deteksiHariIni}
                onPilih={pilihTipeHari}
                onKembalikanAuto={kembalikanAuto}
              />
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ ...typography.caption, color: colors.textMuted }}>FASE AKTIF</Text>
                  <Text style={{ ...typography.body, fontWeight: '700', color: colors.text }}>{profil.fase_aktif}</Text>
                  {faseMulai ? (
                    <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>
                      sejak {formatTanggalPanjang(faseMulai).split(', ')[1]}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ganti fase, sekarang ${profil.fase_aktif}`}
                  onPress={() => {
                    ketukRingan();
                    setSheetFase(true);
                  }}
                  style={({ pressed }) => ({
                    minHeight: TAP_MIN,
                    paddingHorizontal: spacing.lg,
                    justifyContent: 'center',
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.borderKuat,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ ...typography.label, color: colors.text }}>Ganti fase</Text>
                </Pressable>
              </Card>
            </View>
          </View>
        ) : null}

        {!menyunting ? (
          <PilihTampilan
            terpilih={tampilan}
            onPilih={(t) => {
              ketukRingan();
              setTampilan(t);
            }}
          />
        ) : null}

        {matriks ? (
          <MatriksTarget
            baris={barisMatriks}
            faseAktif={profil.fase_aktif}
            tipeHariIniId={tipeHariIni}
            onPilihFase={(f) => {
              setFase(f);
              setTampilan('per-fase');
            }}
          />
        ) : null}

        <View style={{ gap: spacing.sm, display: matriks ? 'none' : 'flex' }}>
          <PilihFase terpilih={fase} aktif={profil.fase_aktif} diubah={faseDiubah} onPilih={setFase} />
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
            {fase === profil.fase_aktif
              ? `${fase} adalah fase aktif; angka ini yang dipakai Hari Ini.`
              : `${fase} belum aktif. Angka ini dipakai saat Anda berpindah ke ${fase}.`}
          </Text>

        </View>

        {(matriks ? [] : tipeHari).map((d) =>
          !menyunting ? (
            <KartuTargetBaca
              key={kunciBaris(d.id, fase)}
              dayType={d}
              target={cariTarget(d.id, fase)}
              hariIni={fase === profil.fase_aktif && d.id === tipeHariIni}
            />
          ) : (
            <BarisTarget
              key={kunciBaris(d.id, fase)}
              dayType={d}
              fase={fase}
              isian={isianBaris(d.id, fase)}
              tersimpan={cariTarget(d.id, fase)}
              diubah={berubah.some((b) => b.kunci === kunciBaris(d.id, fase))}
              tampilkanGalat={(kolom) => cobaSimpan || Boolean(disentuh[`${kunciBaris(d.id, fase)}|${kolom}`])}
              onUbah={(kolom, teks) => ubah(d.id, kolom, teks)}
              onTinggalkan={(kolom) => setDisentuh((x) => ({ ...x, [`${kunciBaris(d.id, fase)}|${kolom}`]: true }))}
              onKembalikan={() => kembalikan(d.id)}
              nonaktif={menyimpan}
            />
          ),
        )}

        <View style={{ gap: spacing.sm }}>
          {status.jenis === 'tersimpan' ? (
            <Text accessibilityLiveRegion="polite" style={{ ...typography.label, fontWeight: '500', color: colors.aksenTeks.jade, lineHeight: 19 }}>
              {status.jumlah === 1 ? 'Satu target tersimpan' : `${status.jumlah} target tersimpan`}. Berlaku mulai hari ini; hari
              yang sudah lewat tetap memakai target saat itu.
            </Text>
          ) : null}
          {status.jenis === 'gagal' ? (
            <Text accessibilityLiveRegion="polite" style={{ ...typography.label, fontWeight: '500', color: colors.aksenTeks.coral, lineHeight: 19 }}>
              Belum tersimpan. Periksa koneksi, lalu coba lagi; isian Anda masih di sini.
            </Text>
          ) : null}
          {cobaSimpan && adaTidakSah ? (
            <Text accessibilityLiveRegion="polite" style={{ ...typography.label, fontWeight: '500', color: colors.aksenTeks.coral, lineHeight: 19 }}>
              Ada isian yang perlu diperbaiki sebelum disimpan.
            </Text>
          ) : null}
          {menyunting ? (
            <>
              <TombolUtama
                label={berubah.length > 1 ? `Simpan ${berubah.length} perubahan` : 'Simpan perubahan'}
                nonaktif={berubah.length === 0}
                memproses={menyimpan}
                onPress={() => void simpan()}
              />
              <TombolBertepi
                label={berubah.length > 0 ? 'Batalkan perubahan' : 'Selesai menyunting'}
                onPress={selesaiMenyunting}
                nonaktif={menyimpan}
              />
            </>
          ) : (
            <TombolUtama
              label="Sunting target"
              onPress={() => {
                setStatus({ jenis: 'diam' });
                setTampilan('per-fase');
                setMode('sunting');
              }}
            />
          )}
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint, lineHeight: 19 }}>
            Karbo tidak ditargetkan: yang tersisa dari kalori setelah protein dan lemak ditampilkan sebagai gambaran.
          </Text>
        </View>
      </ScrollView>

      <SheetGantiFase terbuka={sheetFase} onTutup={() => setSheetFase(false)} />

      <KerangkaSheet terbuka={konfirmasiKeluar} onTutup={() => setKonfirmasiKeluar(false)} label="Perubahan belum disimpan">
        <Text style={{ ...typography.title, color: colors.text }}>Buang perubahan?</Text>
        <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 23 }}>
          {berubah.length === 1 ? 'Satu target' : `${berubah.length} target`} belum disimpan. Target yang berlaku tetap
          seperti sebelumnya.
        </Text>
        <View style={{ gap: spacing.sm }}>
          <TombolUtama label="Lanjut menyunting" onPress={() => setKonfirmasiKeluar(false)} />
          <TombolBertepi
            label="Buang & kembali"
            onPress={() => {
              setKonfirmasiKeluar(false);
              buangSemua();
              router.back();
            }}
          />
        </View>
      </KerangkaSheet>
    </KeyboardAvoidingView>
  );
}

/** Satu tipe hari dalam mode baca: target, sisa karbo, dan kapan ia terpilih. */
function KartuTargetBaca({ dayType, target, hariIni }: { dayType: DayType; target: NilaiTarget; hariIni: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={`${dayType.nama}${hariIni ? ', hari ini' : ''}: ${formatAngka(target.target_kalori)} kilokalori, protein ${formatMakro(target.target_protein_g)} gram, lemak ${formatMakro(target.target_lemak_g)} gram, sat fat paling banyak ${formatMakro(target.batas_sat_fat_g)} gram. ${aturanDeteksiTipeHari(dayType)}`}
    >
      <Card style={{ gap: spacing.md, borderWidth: hariIni ? 1 : 0, borderColor: colors.amber }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <Text style={{ ...typography.body, fontWeight: '700', color: colors.text }}>
            {dayType.nama}
            {dayType.is_default ? <Text style={{ color: colors.textFaint, fontWeight: '500' }}> · bawaan</Text> : null}
          </Text>
          {hariIni ? <Pill label="Hari ini" warna={colors.amber} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
          <Text style={{ ...typography.title, color: colors.text }}>{formatAngka(target.target_kalori)}</Text>
          <Text style={{ ...typography.label, color: colors.textFaint }}>kcal</Text>
        </View>
        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>
          Protein {formatMakro(target.target_protein_g)} g · Lemak {formatMakro(target.target_lemak_g)} g · Sat fat ≤
          {formatMakro(target.batas_sat_fat_g)} g · sisa karbo {formatAngka(karboTersisaG(target))} g
        </Text>
        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint, lineHeight: 19 }}>
          {aturanDeteksiTipeHari(dayType)}
        </Text>
      </Card>
    </View>
  );
}

const TAMPILAN: { nilai: 'per-fase' | 'matriks'; label: string }[] = [
  { nilai: 'per-fase', label: 'Per fase' },
  { nilai: 'matriks', label: 'Matriks' },
];

function PilihTampilan({ terpilih, onPilih }: { terpilih: 'per-fase' | 'matriks'; onPilih: (t: 'per-fase' | 'matriks') => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: spacing.sm }}>
      {TAMPILAN.map((t) => {
        const aktif = t.nilai === terpilih;
        return (
          <Pressable
            key={t.nilai}
            accessibilityRole="radio"
            accessibilityState={{ selected: aktif }}
            accessibilityLabel={`Tampilan ${t.label}`}
            onPress={() => {
              if (!aktif) onPilih(t.nilai);
            }}
            style={({ pressed }) => ({
              minHeight: TAP_MIN - 8,
              paddingHorizontal: spacing.lg,
              justifyContent: 'center',
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: aktif ? colors.amber : colors.borderKuat,
              backgroundColor: aktif ? colors.amber + '1A' : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ ...typography.label, color: aktif ? colors.text : colors.textMuted }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PilihFase({
  terpilih,
  aktif,
  diubah,
  onPilih,
}: {
  terpilih: Fase;
  aktif: Fase;
  diubah: Set<Fase>;
  onPilih: (f: Fase) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken }}
    >
      {FASE.map((f) => {
        const dipilih = f === terpilih;
        return (
          <Pressable
            key={f}
            accessibilityRole="tab"
            accessibilityState={{ selected: dipilih }}
            accessibilityLabel={`${f}${f === aktif ? ', fase aktif' : ''}${diubah.has(f) ? ', ada perubahan belum disimpan' : ''}`}
            onPress={() => {
              if (dipilih) return;
              ketukRingan();
              onPilih(f);
            }}
            style={{
              flex: 1,
              minHeight: TAP_MIN - 4,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              borderRadius: radius.pill,
              backgroundColor: dipilih ? colors.surface : 'transparent',
              borderWidth: dipilih ? 1 : 0,
              borderColor: colors.borderKuat,
            }}
          >
            <Text style={{ ...typography.label, color: dipilih ? colors.text : colors.textMuted }}>
              {f}
              {f === aktif ? <Text style={{ color: colors.textFaint, fontWeight: '500' }}> · aktif</Text> : null}
            </Text>
            {/* Titik = belum disimpan; label aksesibilitas menyebutnya dengan kata. */}
            {diubah.has(f) ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function BarisTarget({
  dayType,
  fase,
  isian,
  tersimpan,
  diubah,
  tampilkanGalat,
  onUbah,
  onTinggalkan,
  onKembalikan,
  nonaktif,
}: {
  dayType: DayType;
  fase: Fase;
  isian: IsianTarget;
  tersimpan: NilaiTarget;
  diubah: boolean;
  tampilkanGalat: (kolom: KolomTarget) => boolean;
  onUbah: (kolom: KolomTarget, teks: string) => void;
  onTinggalkan: (kolom: KolomTarget) => void;
  onKembalikan: () => void;
  nonaktif: boolean;
}) {
  const hasil = periksaTarget(isian);
  const galat = hasil.sah ? {} : hasil.galat;
  const galatTampil = KOLOM.filter((k) => galat[k.kunci] && tampilkanGalat(k.kunci));

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text style={{ ...typography.body, fontWeight: '700', color: colors.text }}>
          {dayType.nama}
          {dayType.is_default ? <Text style={{ color: colors.textFaint, fontWeight: '500' }}> · bawaan</Text> : null}
        </Text>
        {diubah ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Kembalikan ${dayType.nama} ke ${formatAngka(tersimpan.target_kalori)} kilokalori`}
            disabled={nonaktif}
            onPress={() => {
              ketukRingan();
              onKembalikan();
            }}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ ...typography.label, color: colors.amber }}>Kembalikan</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {KOLOM.map((k) => (
          <Isian
            key={k.kunci}
            label={k.label}
            unit={k.unit}
            nilai={isian[k.kunci]}
            aksesLabel={`${dayType.nama}, ${fase}: ${k.label.toLowerCase()} dalam ${k.unit === 'g' ? 'gram' : 'kilokalori'}`}
            ditandai={Boolean(galat[k.kunci]) && tampilkanGalat(k.kunci)}
            onUbah={(t) => onUbah(k.kunci, t)}
            onTinggalkan={() => onTinggalkan(k.kunci)}
            nonaktif={nonaktif}
          />
        ))}
      </View>

      {galatTampil.length > 0 ? (
        <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
          {galatTampil.map((k) => (
            <Text key={k.kunci} style={{ ...typography.label, fontWeight: '500', color: colors.aksenTeks.coral, lineHeight: 19 }}>
              {galat[k.kunci]}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>
        {hasil.sah
          ? `Sisa untuk karbo ${formatAngka(hasil.karboG)} g${diubah ? ` · tersimpan ${formatAngka(tersimpan.target_kalori)} kcal, protein ${formatMakro(tersimpan.target_protein_g)} g` : ''}`
          : 'Sisa untuk karbo muncul setelah isian lengkap.'}
      </Text>
    </Card>
  );
}

function Isian({
  label,
  unit,
  nilai,
  aksesLabel,
  ditandai,
  onUbah,
  onTinggalkan,
  nonaktif,
}: {
  label: string;
  unit: string;
  nilai: string;
  aksesLabel: string;
  /** Ada galat yang sedang ditampilkan untuk kolom ini. */
  ditandai: boolean;
  onUbah: (teks: string) => void;
  onTinggalkan: () => void;
  nonaktif: boolean;
}) {
  return (
    // Dua kolom per baris; lebar minimum menjaga label panjang tidak terpotong.
    <View style={{ flexBasis: '46%', flexGrow: 1, minWidth: 130, gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: colors.textMuted }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          backgroundColor: colors.surfaceSunken,
          borderRadius: radius.md,
          borderWidth: ditandai ? 2 : 1,
          borderColor: ditandai ? colors.coral : colors.borderKuat,
          paddingHorizontal: spacing.md,
        }}
      >
        <TextInput
          value={nilai}
          onChangeText={onUbah}
          onBlur={onTinggalkan}
          editable={!nonaktif}
          keyboardType={unit === 'kcal' ? 'number-pad' : 'decimal-pad'}
          inputMode={unit === 'kcal' ? 'numeric' : 'decimal'}
          selectTextOnFocus
          accessibilityLabel={aksesLabel}
          accessibilityHint={ditandai ? 'Isian ini perlu diperbaiki; keterangannya di bawah kartu' : undefined}
          style={{ ...typography.body, flex: 1, minWidth: 0, minHeight: TAP_MIN, color: colors.text, paddingVertical: spacing.sm }}
        />
        <Text style={{ ...typography.caption, color: colors.textFaint }}>{unit}</Text>
      </View>
    </View>
  );
}
