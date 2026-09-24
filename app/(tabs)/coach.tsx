import { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DISCLAIMER_COACH,
  formatJam,
  formatTanggalPanjang,
  judulPercakapan,
  kelompokkanPerTanggal,
  tanggalHariIni,
} from '@recomp/logika';
import {
  Chip,
  GelembungMengetik,
  GelembungPesan,
  HeaderLayar,
  InputChat,
  KeadaanKosong,
  PemisahTanggal,
  SheetRiwayatPercakapan,
  Tombol,
} from '@/components';

import { useProfil } from '@/state/profil';
import { balasCoachStub, mockRiwayatPercakapan, SARAN_PERTANYAAN } from '@/mocks/coach';
import type { Percakapan, PesanCoach } from '@/types/domain';
import { colors, spacing, typography } from '@/theme';

/**
 * Layar chat AI Coach.
 *
 * Fase 1 frontend: balasan datang dari stub di `@/mocks/coach`, dan seluruh
 * riwayat hidup di state layar ini. Kontrak yang diasumsikan ke backend
 * sederhana — kirim teks pertanyaan, terima teks jawaban — sehingga task layer
 * backend cukup menukar `balasCoachStub` dengan panggilan Edge Function dan
 * `mockRiwayatPercakapan` dengan query Supabase, tanpa mengubah layout.
 *
 * Keadaan yang sengaja dibangun sejak awal, bukan ditempel belakangan:
 * "mengirim", "gagal + coba lagi", dan "coach sedang menyusun". Chat yang cuma
 * punya jalur bahagia akan terlihat rusak begitu jaringan sekali saja meleset,
 * dan itu pasti terjadi di ponsel.
 */
export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const { profil } = useProfil();

  const [riwayat, setRiwayat] = useState<Percakapan[]>(mockRiwayatPercakapan);
  const [aktifId, setAktifId] = useState(
    mockRiwayatPercakapan[mockRiwayatPercakapan.length - 1]?.id ?? '',
  );
  const [menjawab, setMenjawab] = useState(false);
  const [sheetRiwayat, setSheetRiwayat] = useState(false);
  const gulungRef = useRef<ScrollView>(null);

  const aktif = riwayat.find((p) => p.id === aktifId) ?? null;
  const pesan = aktif?.pesan ?? [];

  /** Pemisah tanggal dihitung sekali per perubahan daftar, bukan per gelembung. */
  const awalKelompok = useMemo(() => {
    const peta = new Map<string, string>();
    for (const k of kelompokkanPerTanggal(pesan, tanggalHariIni())) {
      peta.set(k.idPesan[0], k.label);
    }
    return peta;
  }, [pesan]);

  /** Selalu turun ke pesan terbaru; itu yang dicari setelah mengirim. */
  const keBawah = useCallback(() => {
    requestAnimationFrame(() => gulungRef.current?.scrollToEnd({ animated: true }));
  }, []);

  /** Tulis balik satu utas, sekaligus menyegarkan judul & waktu terakhirnya. */
  const perbaruiUtas = useCallback(
    (id: string, ubah: (pesan: PesanCoach[]) => PesanCoach[]) => {
      setRiwayat((lama) =>
        lama.map((p) => {
          if (p.id !== id) return p;
          const pesanBaru = ubah(p.pesan);
          return {
            ...p,
            pesan: pesanBaru,
            judul: judulPercakapan(pesanBaru),
            diperbaruiPada: pesanBaru[pesanBaru.length - 1]?.waktu ?? p.diperbaruiPada,
          };
        }),
      );
    },
    [],
  );

  const tanya = useCallback(
    async (teks: string) => {
      const utasId = aktifId;
      const id = `m-${Date.now()}`;
      perbaruiUtas(utasId, (p) => [
        ...p,
        {
          id,
          peran: 'pengguna',
          teks,
          waktu: new Date().toISOString(),
          status: 'mengirim',
        },
      ]);
      setMenjawab(true);
      keBawah();

      try {
        const jawaban = await balasCoachStub(teks);
        perbaruiUtas(utasId, (p) => [
          ...p.map((m) => (m.id === id ? { ...m, status: 'terkirim' as const } : m)),
          {
            id: `${id}-balas`,
            peran: 'coach',
            teks: jawaban.teks,
            waktu: new Date().toISOString(),
            // Asal angka datang sebagai DATA dari balasan, bukan diurai dari
            // kalimatnya — itu yang membuat penandanya bisa dipercaya.
            rujukan: jawaban.rujukan,
            // Kartu angka hasil function calling; dihitung app, bukan diketik
            // ulang model ke dalam teks.
            widget: jawaban.widget,
            // Terisi bila pertanyaannya melewati batas medis.
            penolakan: jawaban.penolakan,
          },
        ]);
      } catch {
        // Pesan pengguna TETAP di daftar dengan tanda gagal — menghapusnya
        // berarti menghilangkan apa yang sudah ia ketik.
        perbaruiUtas(utasId, (p) =>
          p.map((m) => (m.id === id ? { ...m, status: 'gagal' as const } : m)),
        );
      } finally {
        setMenjawab(false);
        keBawah();
      }
    },
    [aktifId, keBawah, perbaruiUtas],
  );

  /** Kirim ulang pesan yang gagal: buang yang lama, kirim isinya lagi. */
  const cobaLagi = useCallback(
    (gagal: PesanCoach) => {
      perbaruiUtas(aktifId, (p) => p.filter((m) => m.id !== gagal.id));
      void tanya(gagal.teks);
    },
    [aktifId, perbaruiUtas, tanya],
  );

  /** Utas baru dibuat KOSONG dan langsung dibuka. */
  const mulaiBaru = useCallback(() => {
    const id = `p-${Date.now()}`;
    setRiwayat((lama) => [
      ...lama,
      { id, judul: 'Percakapan baru', diperbaruiPada: new Date().toISOString(), pesan: [] },
    ]);
    setAktifId(id);
    setSheetRiwayat(false);
  }, []);

  const kosong = pesan.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.latar }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.bottom + 48}
    >
      {/* Kepala layar tidak ikut menggulung: nama coach, fase, dan jalan masuk
          ke riwayat perlu tetap terlihat saat membaca jawaban yang panjang. */}
      <View
        style={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
          gap: spacing.xs,
          borderBottomWidth: 1,
          borderBottomColor: colors.garis,
        }}
      >
        {/* Subjudul: fase yang dipakai coach + judul utas yang sedang dibuka,
            supaya tidak tersesat setelah berpindah dari riwayat. */}
        <HeaderLayar
          judul="Coach"
          subjudul={`${profil.fase_aktif} · ${
            aktif && !kosong ? aktif.judul : `membaca data sampai ${formatTanggalPanjang(tanggalHariIni())}`
          }`}
          aksi={
            <Tombol
              varian="bertepi"
              ukuran="kecil"
              label="Riwayat"
              aksesLabel="Riwayat percakapan"
              onPress={() => setSheetRiwayat(true)}
            />
          }
        />

        {/* Disclaimer berdiri TETAP di kepala layar, bukan hanya muncul saat
            menolak: batas itu perlu diketahui sebelum pertanyaannya diketik,
            bukan sesudah pengguna telanjur mengetiknya. */}
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          {DISCLAIMER_COACH}
        </Text>
      </View>

      <ScrollView
        ref={gulungRef}
        // Daerah percakapan diberi nama supaya pembaca layar bisa melompat ke
        // sini langsung, tanpa menyusuri kepala layar tiap kali.
        accessibilityLabel="Daftar pesan percakapan"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={keBawah}
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.lg,
          flexGrow: 1,
          justifyContent: kosong ? 'center' : 'flex-start',
        }}
      >
        {kosong ? (
          <KeadaanKosong
            tampilan="polos"
            ikon="chatbubbles-outline"
            judul="Belum ada percakapan"
            keterangan="Coach membaca log harian, tren berat, ukuran tubuh, dan budget mingguan Anda, jadi pertanyaannya boleh langsung soal angka Anda sendiri."
          />
        ) : (
          pesan.map((m, i) => (
            <View key={m.id} style={{ gap: spacing.lg }}>
              {awalKelompok.has(m.id) ? <PemisahTanggal label={awalKelompok.get(m.id)!} /> : null}
              <GelembungPesan
                pesan={m}
                // Jam ditampilkan saat MENITNYA berganti, bukan di tiap pesan.
                // Coach menjawab dalam hitungan detik, jadi aturan "tiap ganti
                // peran" akan mencetak jam yang sama dua kali berturut-turut.
                tampilkanJam={
                  i === pesan.length - 1 || formatJam(pesan[i + 1].waktu) !== formatJam(m.waktu)
                }
                onCobaLagi={cobaLagi}
                onTanya={(t) => void tanya(t)}
              />
            </View>
          ))
        )}

        {menjawab ? <GelembungMengetik /> : null}
      </ScrollView>

      {/* Saran pertanyaan: menghemat mengetik sekaligus memberi tahu coach ini
          bisa ditanya apa. Disembunyikan saat coach sedang menjawab. */}
      {!menjawab ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
          }}
        >
          {SARAN_PERTANYAAN.map((s) => (
            <Chip key={s} label={s} aksesLabel={`Tanyakan: ${s}`} onPress={() => void tanya(s)} />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ paddingBottom: insets.bottom + spacing.sm }}>
        <InputChat sibuk={menjawab} onKirim={(t) => void tanya(t)} />
      </View>

      <SheetRiwayatPercakapan
        terbuka={sheetRiwayat}
        onTutup={() => setSheetRiwayat(false)}
        daftar={riwayat}
        aktifId={aktifId}
        onPilih={(id) => {
          setAktifId(id);
          setSheetRiwayat(false);
        }}
        onBaru={mulaiBaru}
      />
    </KeyboardAvoidingView>
  );
}
