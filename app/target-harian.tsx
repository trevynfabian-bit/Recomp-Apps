import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  aturanDeteksiTipeHari,
  formatAngka,
  formatDesimal,
  formatMakro,
  formatTanggalPanjang,
  ISIAN_KOSONG,
  isianBerubah,
  isianDariTarget,
  karboTersisaG,
  periksaTarget,
  peringatanProtein,
  periodeBerjalan,
  rataRata7Hari,
  susunMatriksTarget,
  tanggalHariIni,
} from '@recomp/logika';
import type { Fase, IsianTarget, KolomTarget, NilaiTarget } from '@recomp/logika';
import {
  Card,
  HeaderLayar,
  HeroPengganti,
  InputTarget,
  KartuHero,
  KerangkaSheet,
  MatriksTarget,
  Panel,
  PemilihTipeHari,
  PilihanSegmen,
  Pill,
  SectionHeader,
  SheetGantiFase,
  SheetSuntingTarget,
  Sisipan,
  Tombol,
} from '@/components';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { useHariIni } from '@/state/hariIni';
import { useProfil } from '@/state/profil';
import { KesalahanTarget } from '@/data/target';
import { useTarget, type PerubahanTarget } from '@/state/target';
import { bobot, colors, KONTROL_RAPAT, KONTROL_SEGMEN, radius, sisaSentuh, spacing, TAP_MIN, tint, typography, ukuran } from '@/theme';
import { mockRiwayatBerat } from '@/mocks/dailyLog';
import type { DayType } from '@/types/domain';
import { useJagaKeluar } from '@/lib/jagaKeluar';
import { useKembali } from '@/lib/kembali';

const FASE: Fase[] = ['Maintenance', 'Lean Gain', 'Cut'];

const KOLOM: { kunci: KolomTarget; label: string; unit: string }[] = [
  { kunci: 'kalori', label: 'Kalori', unit: 'kcal' },
  { kunci: 'protein', label: 'Protein', unit: 'g' },
  { kunci: 'lemak', label: 'Lemak', unit: 'g' },
  { kunci: 'satFat', label: 'Batas sat fat', unit: 'g' },
];

const kunciBaris = (dayTypeId: string, fase: Fase) => `${dayTypeId}|${fase}`;

type Status =
  | { jenis: 'diam' }
  | { jenis: 'menyimpan' }
  | { jenis: 'tersimpan'; jumlah: number; hariDiredistribusiTetap: number }
  | { jenis: 'gagal'; pesan: string };

const PESAN_GAGAL_SIMPAN = 'Belum tersimpan. Periksa koneksi, lalu coba lagi; isian Anda masih di sini.';

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
 * Simpan lewat `useTarget`: `simpan_target` di Supabase, atau tiruan di memori
 * tanpa kredensial Supabase.
 */
export default function TargetHarianScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const kembaliSatuLangkah = useKembali();
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
  /** Satu target yang sedang disunting lewat sheet (dari kartu atau sel matriks). */
  const [suntingSatu, setSuntingSatu] = useState<{ dayTypeId: string; fase: Fase } | null>(null);
  // Dibuka dari "Isi target" di Hari Ini: langsung ke penyunting tipe hari itu di fase aktif.
  const { isi } = useLocalSearchParams<{ isi?: string }>();
  useEffect(() => {
    if (isi && tipeHari.some((d) => d.id === isi)) setSuntingSatu({ dayTypeId: isi, fase: profil.fase_aktif });
    // Hanya saat parameter datang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isi]);
  const faseMulai = periodeBerjalan(riwayatFase)?.mulai ?? null;
  const targetHariIni = cariTarget(tipeHariIni, profil.fase_aktif);
  const namaTipeHariIni = tipeHari.find((d) => d.id === tipeHariIni)?.nama ?? '';
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

  /** Isian awal baris: nilai tersimpan, atau kosong bila targetnya belum diisi. */
  const isianTersimpan = (dt: string, f: Fase) => {
    const t = cariTarget(dt, f);
    return t ? isianDariTarget(t) : ISIAN_KOSONG;
  };
  const isianBaris = (dt: string, f: Fase) => draf[kunciBaris(dt, f)] ?? isianTersimpan(dt, f);

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

  // Rata-rata berat 7 hari untuk memeriksa protein per kg (null tanpa timbangan).
  const beratKg = rataRata7Hari(mockRiwayatBerat, tanggalHariIni()).rataRataKg;
  /** Perubahan sah yang menurunkan protein atau membuatnya di bawah 1,6 g/kg. */
  const peringatanSimpan = berubah.flatMap((b) => {
    if (!b.hasil.sah) return [];
    const p = peringatanProtein(b.hasil.nilai.target_protein_g, cariTarget(b.dayTypeId, b.fase)?.target_protein_g ?? null, beratKg);
    return p ? [{ ...b, peringatan: p, nama: tipeHari.find((d) => d.id === b.dayTypeId)?.nama ?? '' }] : [];
  });
  const [proteinDisetujui, setProteinDisetujui] = useState(false);
  const faseDiubah = new Set(berubah.map((b) => b.fase));
  const menyimpan = status.jenis === 'menyimpan';

  function ubah(dt: string, kolom: KolomTarget, teks: string) {
    const k = kunciBaris(dt, fase);
    setDraf((d) => ({ ...d, [k]: { ...(d[k] ?? isianTersimpan(dt, fase)), [kolom]: teks } }));
    if (status.jenis !== 'menyimpan') setStatus({ jenis: 'diam' });
    // Angka berubah: peringatan protein harus dibaca ulang sebelum menyimpan.
    setProteinDisetujui(false);
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
    // Simpan pertama dengan peringatan protein berhenti di panelnya; yang kedua menyimpan.
    if (peringatanSimpan.length > 0 && !proteinDisetujui) {
      setProteinDisetujui(true);
      return;
    }
    setStatus({ jenis: 'menyimpan' });
    const perubahan: PerubahanTarget[] = berubah.map((b) => ({
      day_type_id: b.dayTypeId,
      fase: b.fase,
      nilai: (b.hasil as Extract<typeof b.hasil, { sah: true }>).nilai,
    }));
    try {
      const { hariDiredistribusiTetap } = await simpanTarget(perubahan);
      ketukBerhasil();
      setDraf({});
      setDisentuh({});
      setCobaSimpan(false);
      setStatus({ jenis: 'tersimpan', jumlah: perubahan.length, hariDiredistribusiTetap });
      setMode('baca');
    } catch (e) {
      setStatus({ jenis: 'gagal', pesan: e instanceof KesalahanTarget ? e.message : PESAN_GAGAL_SIMPAN });
    }
  }

  function kembali() {
    if (menyunting && berubah.length > 0) setKonfirmasiKeluar(true);
    else kembaliSatuLangkah();
  }
  // Geser-kembali dan tombol kembali Android juga melewati konfirmasi yang sama.
  useJagaKeluar(menyunting && berubah.length > 0, () => setKonfirmasiKeluar(true));

  function selesaiMenyunting() {
    buangSemua();
    setMode('baca');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: colors.latar }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
          paddingHorizontal: spacing.lg,
          gap: spacing.xl,
        }}
      >
        <HeaderLayar
          kembali={() => kembali()}
          judul="Target per tipe hari"
          subjudul="Angka absolut, berlaku mulai hari ini"
        />

        {!menyunting ? (
          <View>
            <SectionHeader judul="Berlaku hari ini" aksi={override ? 'tipe hari diubah manual' : 'tipe hari otomatis'} />
            <View style={{ gap: spacing.md }}>
              {/* Satu angka utama di layar ini: target kalori yang berlaku hari ini. */}
              <KartuHero
                label="Target kalori hari ini"
                nilai={targetHariIni ? formatAngka(targetHariIni.target_kalori) : '—'}
                unit="kcal"
                keterangan={targetHariIni ? `${namaTipeHariIni} · ${profil.fase_aktif} · protein ${formatMakro(targetHariIni.target_protein_g)} g · lemak ${formatMakro(targetHariIni.target_lemak_g)} g · sat fat ≤${formatMakro(targetHariIni.batas_sat_fat_g)} g` : undefined}
                pengganti={
                  targetHariIni ? undefined : (
                  <HeroPengganti
                    label="Target kalori hari ini"
                    judul={`${namaTipeHariIni} · ${profil.fase_aktif} belum diisi`}
                    aksi={
                      <Tombol
                        label="Isi target"
                        aksesLabel={`Isi target ${namaTipeHariIni} untuk fase ${profil.fase_aktif}`}
                        onPress={() => setSuntingSatu({ dayTypeId: tipeHariIni, fase: profil.fase_aktif })}
                      />
                    }
                  />
                  )
                }
              />
              <PemilihTipeHari
                tampilkanTarget={false}
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
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={{ ...typography.caption, color: colors.teksRedup }}>FASE AKTIF</Text>
                  <Text style={{ ...typography.bodyTebal, color: colors.teks }}>{profil.fase_aktif}</Text>
                  {faseMulai ? (
                    <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
                      sejak {formatTanggalPanjang(faseMulai).split(', ')[1]}
                    </Text>
                  ) : null}
                </View>
                <Tombol
                  varian="bertepi"
                  ukuran="kecil"
                  label="Ganti fase"
                  aksesLabel={`Ganti fase, sekarang ${profil.fase_aktif}`}
                  onPress={() => setSheetFase(true)}
                />
              </Card>
            </View>
          </View>
        ) : null}

        {!menyunting ? (
          <PilihanSegmen opsi={TAMPILAN} aksesAwalan="Tampilan" terpilih={tampilan} onPilih={setTampilan} />
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
            onPilihSel={(dayTypeId, f) => setSuntingSatu({ dayTypeId, fase: f })}
          />
        ) : null}

        <View style={{ gap: spacing.sm, display: matriks ? 'none' : 'flex' }}>
          <PilihanSegmen
            peran="tab"
            opsi={FASE.map((f) => ({
              nilai: f,
              label: f,
              sisipan: f === profil.fase_aktif ? 'aktif' : undefined,
              // Titik = belum disimpan; label aksesibilitas menyebutnya dengan kata.
              penanda: faseDiubah.has(f),
              aksesLabel: `${f}${f === profil.fase_aktif ? ', fase aktif' : ''}${faseDiubah.has(f) ? ', ada perubahan belum disimpan' : ''}`,
            }))}
            terpilih={fase}
            onPilih={setFase}
          />
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            {fase === profil.fase_aktif
              ? `${fase} adalah fase aktif; angka ini yang dipakai Hari Ini.`
              : `${fase} belum aktif. Angka ini dipakai saat Anda berpindah ke ${fase}.`}
          </Text>

        </View>

        {(matriks ? [] : tipeHari).map((d) =>
          !menyunting ? (
            (() => {
              const t = cariTarget(d.id, fase);
              const hariIni = fase === profil.fase_aktif && d.id === tipeHariIni;
              const buka = () => setSuntingSatu({ dayTypeId: d.id, fase });
              return t ? (
                <KartuTargetBaca key={kunciBaris(d.id, fase)} dayType={d} target={t} hariIni={hariIni} onSunting={buka} />
              ) : (
                <KartuTargetKosong key={kunciBaris(d.id, fase)} dayType={d} fase={fase} hariIni={hariIni} onIsi={buka} />
              );
            })()
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
            <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.status.sukses.teks }}>
              {status.jumlah === 1 ? 'Satu target tersimpan' : `${status.jumlah} target tersimpan`}. Berlaku mulai hari ini; hari
              yang sudah lewat tetap memakai target saat itu.
              {status.hariDiredistribusiTetap > 0
                ? ` ${status.hariDiredistribusiTetap === 1 ? 'Satu hari' : `${status.hariDiredistribusiTetap} hari`} yang kalorinya sudah diredistribusi tetap memakai angka redistribusinya.`
                : ''}
            </Text>
          ) : null}
          {status.jenis === 'gagal' ? (
            <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.status.bahaya.teks }}>
              {status.pesan}
            </Text>
          ) : null}
          {cobaSimpan && adaTidakSah ? (
            <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.status.bahaya.teks }}>
              Ada isian yang perlu diperbaiki sebelum disimpan.
            </Text>
          ) : null}
          {menyunting && peringatanSimpan.length > 0 ? (
            <Panel nada="peringatan">
              <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
                <Text style={{ ...typography.label, color: colors.status.peringatan.teks }}>
                  Protein turun atau di bawah 1,6 g/kg di {peringatanSimpan.length === 1 ? 'satu target' : `${peringatanSimpan.length} target`}
                </Text>
                {peringatanSimpan.map((b) => (
                  <Text key={kunciBaris(b.dayTypeId, b.fase)} style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
                    {b.nama} · {b.fase}:{' '}
                    {[
                      b.peringatan.turunG !== null ? `turun ${formatAngka(b.peringatan.turunG)} g` : null,
                      b.peringatan.rendah && b.peringatan.gPerKg !== null
                        ? `${formatDesimal(b.peringatan.gPerKg, 1)} g/kg`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                ))}
                <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
                  Protein yang menjaga otot selama kalori ditekan; kurangi karbo atau lemak dulu bila bisa.
                </Text>
              </View>
            </Panel>
          ) : null}
          {menyunting ? (
            <>
              <Tombol
                label={
                  proteinDisetujui && peringatanSimpan.length > 0
                    ? 'Tetap simpan'
                    : berubah.length > 1
                      ? `Simpan ${berubah.length} perubahan`
                      : 'Simpan perubahan'
                }
                nonaktif={berubah.length === 0}
                memproses={menyimpan}
                onPress={() => void simpan()}
              />
              <Tombol
                varian="bertepi"
                label={berubah.length > 0 ? 'Batalkan perubahan' : 'Selesai menyunting'}
                onPress={selesaiMenyunting}
                nonaktif={menyimpan}
              />
            </>
          ) : (
            <Tombol
              label="Sunting target"
              onPress={() => {
                setStatus({ jenis: 'diam' });
                setTampilan('per-fase');
                setMode('sunting');
              }}
            />
          )}
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
            Karbo tidak ditargetkan: yang tersisa dari kalori setelah protein dan lemak ditampilkan sebagai gambaran.
          </Text>
        </View>
      </ScrollView>

      <SheetGantiFase terbuka={sheetFase} onTutup={() => setSheetFase(false)} />
      {suntingSatu ? (
        <SheetSuntingTarget
          terbuka
          onTutup={() => setSuntingSatu(null)}
          namaTipeHari={tipeHari.find((d) => d.id === suntingSatu.dayTypeId)?.nama ?? ''}
          fase={suntingSatu.fase}
          tersimpan={cariTarget(suntingSatu.dayTypeId, suntingSatu.fase)}
          beratKg={beratKg}
          simpan={async (nilai) => {
            const { hariDiredistribusiTetap } = await simpanTarget([
              { day_type_id: suntingSatu.dayTypeId, fase: suntingSatu.fase, nilai },
            ]);
            setStatus({ jenis: 'tersimpan', jumlah: 1, hariDiredistribusiTetap });
          }}
        />
      ) : null}

      <KerangkaSheet terbuka={konfirmasiKeluar} onTutup={() => setKonfirmasiKeluar(false)} label="Perubahan belum disimpan">
        <Text style={{ ...typography.title, color: colors.teks }}>Buang perubahan?</Text>
        <Text style={{ ...typography.body, color: colors.teksRedup }}>
          {berubah.length === 1 ? 'Satu target' : `${berubah.length} target`} belum disimpan. Target yang berlaku tetap
          seperti sebelumnya.
        </Text>
        <View style={{ gap: spacing.sm }}>
          <Tombol label="Lanjut menyunting" onPress={() => setKonfirmasiKeluar(false)} />
          <Tombol
            varian="bertepi"
            label="Buang & kembali"
            onPress={() => {
              setKonfirmasiKeluar(false);
              buangSemua();
              kembaliSatuLangkah();
            }}
          />
        </View>
      </KerangkaSheet>
    </KeyboardAvoidingView>
  );
}

/** Satu tipe hari dalam mode baca: target, sisa karbo, dan kapan ia terpilih. */
function KartuTargetBaca({
  dayType,
  target,
  hariIni,
  onSunting,
}: {
  dayType: DayType;
  target: NilaiTarget;
  hariIni: boolean;
  onSunting: () => void;
}) {
  return (
    <Card nada={hariIni ? 'aksen' : undefined} style={{ gap: spacing.md }}>
      {/* Isinya satu elemen bagi pembaca layar; tombol Sunting tetap terpisah. */}
      <View
        accessible
        accessibilityLabel={`${dayType.nama}${hariIni ? ', hari ini' : ''}: ${formatAngka(target.target_kalori)} kilokalori, protein ${formatMakro(target.target_protein_g)} gram, lemak ${formatMakro(target.target_lemak_g)} gram, sat fat paling banyak ${formatMakro(target.batas_sat_fat_g)} gram. ${aturanDeteksiTipeHari(dayType)}`}
        style={{ gap: spacing.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <Text style={{ ...typography.bodyTebal, color: colors.teks }}>
            {dayType.nama}
            {dayType.is_default ? <Sisipan>bawaan</Sisipan> : null}
          </Text>
          {hariIni ? <Pill label="Hari ini" warna={colors.aksen.teks} /> : null}
        </View>
        {/* Angka kartu sengaja sekunder: angka utama layar ini ada di atas. */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
          <Text style={{ ...typography.bodyTebal, color: colors.teks }}>{formatAngka(target.target_kalori)}</Text>
          <Text style={{ ...typography.label, color: colors.teksSamar }}>kcal</Text>
        </View>
        <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
          Protein {formatMakro(target.target_protein_g)} g · Lemak {formatMakro(target.target_lemak_g)} g · Sat fat ≤
          {formatMakro(target.batas_sat_fat_g)} g · sisa karbo {formatAngka(karboTersisaG(target))} g
        </Text>
        <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
          {aturanDeteksiTipeHari(dayType)}
        </Text>
      </View>
      <Tombol
        varian="teks"
        ukuran="kecil"
        label="Sunting target ini"
        aksesLabel={`Sunting target ${dayType.nama}`}
        onPress={() => onSunting()}
      />
    </Card>
  );
}

const TAMPILAN: { nilai: 'per-fase' | 'matriks'; label: string }[] = [
  { nilai: 'per-fase', label: 'Per fase' },
  { nilai: 'matriks', label: 'Matriks' },
];

/** Tipe hari yang belum punya target di fase ini: dikatakan, lalu satu ketukan untuk mengisinya. */
function KartuTargetKosong({
  dayType,
  fase,
  hariIni,
  onIsi,
}: {
  dayType: DayType;
  fase: Fase;
  hariIni: boolean;
  onIsi: () => void;
}) {
  return (
    <Card style={{ gap: spacing.md, borderWidth: 1, borderStyle: 'dashed', borderColor: hariIni ? colors.aksen.isian : colors.garisKontrol }}>
      <View
        accessible
        accessibilityLabel={`${dayType.nama}${hariIni ? ', hari ini' : ''}: target fase ${fase} belum diisi. ${aturanDeteksiTipeHari(dayType)}`}
        style={{ gap: spacing.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <Text style={{ ...typography.bodyTebal, color: colors.teks }}>{dayType.nama}</Text>
          {hariIni ? <Pill label="Hari ini" warna={colors.aksen.teks} /> : null}
        </View>
        <Text style={{ ...typography.bodyTebal, color: colors.teksRedup }}>Belum diisi</Text>
        <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
          Hari bertipe {dayType.nama} di fase {fase} belum punya target, jadi Hari Ini belum bisa menghitung sisanya.
        </Text>
        <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
          {aturanDeteksiTipeHari(dayType)}
        </Text>
      </View>
      <Tombol label="Isi target" aksesLabel={`Isi target ${dayType.nama} untuk fase ${fase}`} onPress={onIsi} />
    </Card>
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
  /** `null` bila target ini belum pernah diisi. */
  tersimpan: NilaiTarget | null;
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
        <Text style={{ ...typography.bodyTebal, color: colors.teks }}>
          {dayType.nama}
          {dayType.is_default ? <Sisipan>bawaan</Sisipan> : null}
        </Text>
        {diubah ? (
          <Tombol
            varian="teks"
            ukuran="kecil"
            label="Kembalikan"
            aksesLabel={
              tersimpan
                ? `Kembalikan ${dayType.nama} ke ${formatAngka(tersimpan.target_kalori)} kilokalori`
                : `Kosongkan lagi isian ${dayType.nama}`
            }
            nonaktif={nonaktif}
            onPress={() => onKembalikan()}
          />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {KOLOM.map((k) => (
          <InputTarget
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
            <Text key={k.kunci} style={{ ...typography.labelBiasa, color: colors.status.bahaya.teks }}>
              {galat[k.kunci]}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
        {hasil.sah
          ? `Sisa untuk karbo ${formatAngka(hasil.karboG)} g${diubah && tersimpan ? ` · tersimpan ${formatAngka(tersimpan.target_kalori)} kcal, protein ${formatMakro(tersimpan.target_protein_g)} g` : ''}`
          : 'Sisa untuk karbo muncul setelah isian lengkap.'}
      </Text>
    </Card>
  );
}
