import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  hasilLabSama,
  isianDariHasilLab,
  PENANDA_KOSONG,
  penandaDariTemplat,
  periksaHasilLab,
  tanggalHariIni,
  TEMPLAT_PANEL_LAB,
} from '@recomp/logika';
import type { HasilPeriksaLab, IsianHasilLab, IsianPenandaLab } from '@recomp/logika';
import { Card, KerangkaSheet, PenandaSumber, TombolBertepi, TombolUtama } from '@/components';
import { KesalahanHasilLab } from '@/data/hasilLab';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { SUMBER_HASIL_LAB } from '@/lib/sumber';
import { useHasilLab } from '@/state/hasilLab';
import { colors, ukuranIkon, radius, spacing, TAP_MIN, typography } from '@/theme';

type GalatLab = Extract<HasilPeriksaLab, { sah: false }>['galat'];

const ISIAN_AWAL: IsianHasilLab = { nama: '', tanggal: '', laboratorium: '', penanda: [{ ...PENANDA_KOSONG }] };

/** Tanggal hari ini ditulis seperti orang Indonesia menulisnya: 23/9/2026. */
function hariIniTertulis(): string {
  const [y, m, d] = tanggalHariIni().split('-').map(Number);
  return `${d}/${m}/${y}`;
}

/**
 * Tambah atau ubah hasil lab (`?id=` untuk mengubah entri yang ada).
 *
 * Angkanya DISALIN dari kertas hasil, jadi form ini dirancang untuk menyalin
 * dengan setia, bukan untuk menafsirkan: satu baris per penanda (nama, nilai,
 * satuan, dan rentang rujukan dari lab bila tercetak). Templat panel hanya
 * mengisi nama & satuan penanda yang umum — rentang rujukannya tidak pernah
 * diisikan app, karena rentang itu milik laboratorium yang memeriksa dan
 * berbeda antar lab.
 *
 * Aturannya di `periksaHasilLab` (@recomp/logika): angka cara Indonesia
 * ("5,3"), tanggal "3/9/2026" dan tidak di masa depan, rentang tidak
 * terbalik, penanda tidak ganda. Baris yang sepenuhnya kosong diabaikan.
 * Galat tampil setelah percobaan simpan pertama.
 *
 * Simpan lewat `useHasilLab`: `simpan_hasil_lab` di Supabase (hasil & penanda
 * dalam satu transaksi), atau tiruan tanpa kredensial Supabase.
 */
export default function TambahHasilLabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { riwayat, status: statusMuat, tambah, ubah: ubahEntri } = useHasilLab();
  // Dengan `id`: mengubah entri yang ada; tanpa: menambah yang baru.
  const { id } = useLocalSearchParams<{ id?: string }>();
  const asal = id ? riwayat.find((h) => h.id === id) : undefined;
  const [isian, setIsian] = useState<IsianHasilLab>(() => (asal ? isianDariHasilLab(asal) : ISIAN_AWAL));
  const [cobaSimpan, setCobaSimpan] = useState(false);
  const [status, setStatus] = useState<'diam' | 'menyimpan' | 'gagal'>('diam');
  const [pesanGagal, setPesanGagal] = useState('');
  // Dibuka sebelum riwayat selesai dimuat dari server: isi form dari entrinya
  // begitu tiba — sekali saja, supaya isian pengguna tidak pernah ditimpa.
  const sudahDiisi = useRef(Boolean(asal));
  useEffect(() => {
    if (asal && !sudahDiisi.current) {
      sudahDiisi.current = true;
      setIsian(isianDariHasilLab(asal));
    }
  }, [asal]);
  const [konfirmasiBatal, setKonfirmasiBatal] = useState(false);

  const hasil = periksaHasilLab(isian, tanggalHariIni());
  const galat: GalatLab = hasil.sah ? { perPenanda: [] } : hasil.galat;
  const tampil = cobaSimpan;
  const menyimpan = status === 'menyimpan';
  // Perlu konfirmasi saat kembali: tambah → ada yang terisi; ubah → ada yang berbeda dari entri tersimpan.
  const berisi = asal
    ? JSON.stringify(isian) !== JSON.stringify(isianDariHasilLab(asal))
    : isian.nama.trim() !== '' ||
      isian.tanggal.trim() !== '' ||
      isian.laboratorium.trim() !== '' ||
      isian.penanda.some((p) => p.nilai.trim() !== '' || p.rujukanMin.trim() !== '' || p.rujukanMaks.trim() !== '');
  /** Mengubah tanpa perubahan apa pun: tombol simpan tidak aktif. */
  const tanpaPerubahan = Boolean(asal && hasil.sah && hasilLabSama(hasil.hasil, asal));

  const ubah = (perubahan: Partial<IsianHasilLab>) => {
    setIsian((x) => ({ ...x, ...perubahan }));
    if (status === 'gagal') setStatus('diam');
  };
  const ubahPenanda = (i: number, perubahan: Partial<IsianPenandaLab>) =>
    ubah({ penanda: isian.penanda.map((p, j) => (j === i ? { ...p, ...perubahan } : p)) });

  function pakaiTemplat(namaPanel: string) {
    const templat = penandaDariTemplat(namaPanel) ?? [];
    // Penanda yang sudah diisi dipertahankan; templat hanya menambah yang belum ada.
    const dipakai = isian.penanda.filter((p) => Object.values(p).some((v) => v.trim() !== ''));
    const baru = templat.filter((t) => !dipakai.some((p) => p.nama.trim().toLowerCase() === t.nama.toLowerCase()));
    ubah({ nama: namaPanel, penanda: [...dipakai, ...baru] });
  }

  async function simpan() {
    setCobaSimpan(true);
    if (!hasil.sah || menyimpan) return;
    if (tanpaPerubahan) return;
    setStatus('menyimpan');
    try {
      if (asal) await ubahEntri(asal.id, hasil.hasil);
      else await tambah(hasil.hasil);
      ketukBerhasil();
      router.back();
    } catch (e) {
      setPesanGagal(e instanceof KesalahanHasilLab ? e.message : 'Belum tersimpan. Periksa koneksi, lalu coba lagi; isian Anda masih di sini.');
      setStatus('gagal');
    }
  }

  function kembali() {
    if (berisi) setKonfirmasiBatal(true);
    else router.back();
  }

  if (id && !asal && statusMuat === 'memuat') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.latar, paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg }}>
        <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
          Memuat hasil lab…
        </Text>
      </View>
    );
  }

  if (id && !asal) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.latar, paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Text style={{ ...typography.title, color: colors.teks }}>Hasil lab ini tidak ditemukan</Text>
        <Text style={{ ...typography.body, color: colors.teksRedup }}>
          Mungkin sudah dihapus. Riwayat hasil lab lainnya tidak berubah.
        </Text>
        <TombolBertepi label="Kembali ke riwayat" onPress={() => router.back()} />
      </View>
    );
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
              backgroundColor: colors.permukaan,
              borderWidth: 1,
              borderColor: colors.garisKontrol,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ ...typography.title, color: colors.teks }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ ...typography.title, color: colors.teks }}>
              {asal ? 'Ubah hasil lab' : 'Tambah hasil lab'}
            </Text>
            <Text style={{ ...typography.label, color: colors.teksSamar, marginTop: spacing.xxs }}>Salin dari kertas hasilnya</Text>
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <PenandaSumber jenis={SUMBER_HASIL_LAB.jenis} detail={SUMBER_HASIL_LAB.detail} tampilan="pill" />
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            Tulis angka dan rentang rujukan persis seperti tercetak; tersimpan sebagai data mentah, tanpa dibulatkan.
            Rentang rujukan boleh dikosongkan bila tidak ada di kertasnya; app tidak mengisinya sendiri.
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          <Kolom
            label="Nama panel"
            nilai={isian.nama}
            onUbah={(t) => ubah({ nama: t })}
            placeholder="mis. Profil lipid"
            galat={tampil ? galat.nama : undefined}
            nonaktif={menyimpan}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {TEMPLAT_PANEL_LAB.map((t) => (
              <Pressable
                key={t.nama}
                accessibilityRole="button"
                accessibilityLabel={`Templat ${t.nama}: isi nama & satuan ${t.penanda.length} penanda`}
                disabled={menyimpan}
                onPress={() => {
                  ketukRingan();
                  pakaiTemplat(t.nama);
                }}
                style={({ pressed }) => ({
                  minHeight: TAP_MIN - 8,
                  paddingHorizontal: spacing.md,
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: isian.nama === t.nama ? colors.aksen.isian : colors.garisKontrol,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ ...typography.label, color: isian.nama === t.nama ? colors.teks : colors.teksRedup }}>{t.nama}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ gap: spacing.xs }}>
            <Kolom
              label="Tanggal pengambilan sampel"
              nilai={isian.tanggal}
              onUbah={(t) => ubah({ tanggal: t })}
              placeholder="mis. 3/9/2026"
              keyboardType="numbers-and-punctuation"
              galat={tampil ? galat.tanggal : undefined}
              nonaktif={menyimpan}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Isi tanggal hari ini"
              onPress={() => ubah({ tanggal: hariIniTertulis() })}
              style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: TAP_MIN - 8, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ ...typography.label, color: colors.aksen.teks }}>Hari ini</Text>
            </Pressable>
          </View>
          <Kolom
            label="Laboratorium (boleh kosong)"
            nilai={isian.laboratorium}
            onUbah={(t) => ubah({ laboratorium: t })}
            placeholder="mis. Lab klinik"
            galat={tampil ? galat.laboratorium : undefined}
            nonaktif={menyimpan}
          />
        </View>

        <View style={{ gap: spacing.md }}>
          <Text style={{ ...typography.caption, color: colors.teksRedup }}>PENANDA</Text>
          {tampil && galat.penanda ? <TeksGalat teks={galat.penanda} /> : null}
          {isian.penanda.map((p, i) => (
            <KartuPenanda
              key={i}
              ke={i + 1}
              isian={p}
              galat={tampil ? galat.perPenanda[i] : undefined}
              onUbah={(x) => ubahPenanda(i, x)}
              onHapus={isian.penanda.length > 1 ? () => ubah({ penanda: isian.penanda.filter((_, j) => j !== i) }) : undefined}
              nonaktif={menyimpan}
            />
          ))}
          <TombolBertepi
            label="Tambah penanda"
            onPress={() => ubah({ penanda: [...isian.penanda, { ...PENANDA_KOSONG }] })}
            nonaktif={menyimpan}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          {tampil && !hasil.sah ? <TeksGalat teks="Ada isian yang perlu diperbaiki sebelum disimpan." /> : null}
          {status === 'gagal' ? <TeksGalat teks={pesanGagal} /> : null}
          <TombolUtama
            label={asal ? 'Simpan perubahan' : 'Simpan hasil lab'}
            nonaktif={tanpaPerubahan}
            memproses={menyimpan}
            onPress={() => void simpan()}
          />
        </View>
      </ScrollView>

      <KerangkaSheet terbuka={konfirmasiBatal} onTutup={() => setKonfirmasiBatal(false)} label="Isian belum disimpan">
        <Text style={{ ...typography.title, color: colors.teks }}>{asal ? 'Buang perubahan?' : 'Buang isian ini?'}</Text>
        <Text style={{ ...typography.body, color: colors.teksRedup }}>
          {asal
            ? 'Perubahan belum disimpan. Entri yang tersimpan tetap seperti sebelumnya.'
            : 'Hasil lab ini belum disimpan. Riwayat yang sudah ada tidak berubah.'}
        </Text>
        <View style={{ gap: spacing.sm }}>
          <TombolUtama label="Lanjut mengisi" onPress={() => setKonfirmasiBatal(false)} />
          <TombolBertepi
            label="Buang & kembali"
            onPress={() => {
              setKonfirmasiBatal(false);
              router.back();
            }}
          />
        </View>
      </KerangkaSheet>
    </KeyboardAvoidingView>
  );
}

function KartuPenanda({
  ke,
  isian,
  galat,
  onUbah,
  onHapus,
  nonaktif,
}: {
  ke: number;
  isian: IsianPenandaLab;
  galat?: Partial<Record<keyof IsianPenandaLab | 'rentang', string>>;
  onUbah: (perubahan: Partial<IsianPenandaLab>) => void;
  onHapus?: () => void;
  nonaktif: boolean;
}) {
  const nama = isian.nama.trim() || `Penanda ${ke}`;
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.label, color: colors.teksRedup }}>Penanda {ke}</Text>
        {onHapus ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Hapus baris ${nama}`}
            disabled={nonaktif}
            onPress={() => {
              ketukRingan();
              onHapus();
            }}
            hitSlop={8}
            style={({ pressed }) => ({ width: TAP_MIN - 8, height: TAP_MIN - 8, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Ionicons name="close" size={ukuranIkon.sedang} color={colors.teksRedup} />
          </Pressable>
        ) : null}
      </View>
      <Kolom label="Nama" aksesLabel={`Penanda ${ke}: nama`} nilai={isian.nama} onUbah={(t) => onUbah({ nama: t })} placeholder="mis. Kolesterol LDL" galat={galat?.nama} nonaktif={nonaktif} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Kolom label="Nilai" aksesLabel={`${nama}: nilai`} nilai={isian.nilai} onUbah={(t) => onUbah({ nilai: t })} placeholder="mis. 138" keyboardType="decimal-pad" galat={galat?.nilai} nonaktif={nonaktif} />
        </View>
        <View style={{ flex: 1 }}>
          <Kolom label="Satuan" aksesLabel={`${nama}: satuan`} nilai={isian.satuan} onUbah={(t) => onUbah({ satuan: t })} placeholder="mis. mg/dL" galat={galat?.satuan} nonaktif={nonaktif} />
        </View>
      </View>
      <Text style={{ ...typography.caption, color: colors.teksSamar }}>RENTANG RUJUKAN DARI LAB</Text>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Kolom label="Batas bawah" aksesLabel={`${nama}: batas bawah rujukan`} nilai={isian.rujukanMin} onUbah={(t) => onUbah({ rujukanMin: t })} placeholder="kosong" keyboardType="decimal-pad" galat={galat?.rujukanMin} nonaktif={nonaktif} />
        </View>
        <View style={{ flex: 1 }}>
          <Kolom label="Batas atas" aksesLabel={`${nama}: batas atas rujukan`} nilai={isian.rujukanMaks} onUbah={(t) => onUbah({ rujukanMaks: t })} placeholder="kosong" keyboardType="decimal-pad" galat={galat?.rujukanMaks} nonaktif={nonaktif} />
        </View>
      </View>
      {galat?.rentang ? <TeksGalat teks={galat.rentang} /> : null}
    </Card>
  );
}

function Kolom({
  label,
  aksesLabel,
  nilai,
  onUbah,
  placeholder,
  keyboardType = 'default',
  galat,
  nonaktif,
}: {
  label: string;
  aksesLabel?: string;
  nilai: string;
  onUbah: (teks: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'numbers-and-punctuation';
  galat?: string;
  nonaktif: boolean;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: colors.teksRedup }}>{label}</Text>
      <TextInput
        value={nilai}
        onChangeText={onUbah}
        editable={!nonaktif}
        placeholder={placeholder}
        placeholderTextColor={colors.teksSamar}
        keyboardType={keyboardType}
        autoCorrect={false}
        accessibilityLabel={aksesLabel ?? label}
        accessibilityHint={galat}
        style={{
          ...typography.body,
          color: colors.teks,
          minHeight: TAP_MIN,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          borderWidth: galat ? 2 : 1,
          borderColor: galat ? colors.status.bahaya.isian : colors.garisKontrol,
          backgroundColor: colors.permukaanCekung,
        }}
      />
      {galat ? <TeksGalat teks={galat} /> : null}
    </View>
  );
}

function TeksGalat({ teks }: { teks: string }) {
  return (
    <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.status.bahaya.teks }}>
      {teks}
    </Text>
  );
}
