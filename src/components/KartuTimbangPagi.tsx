import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, Panel } from './Card';
import { PenandaSumber } from './PenandaSumber';
import { sumberBerat } from '@/lib/sumber';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { formatDesimal, formatTanggalPanjang, RENTANG_BERAT_KG } from '@recomp/logika';
import type { EntriBerat } from '@/mocks/dailyLog';
import { colors, radius, spacing, TAP_MIN, tint, typography, ukuran } from '@/theme';
import type { SumberBerat } from '@/types/domain';
import { KeadaanKosong } from './Keadaan';
import { Tombol } from './Tombol';
import { PemilihAngka, uraiAngka } from './Pemilih';
import { formatSelisih } from '@/lib/formatTampilan';
import { KerangkaSheet } from './KerangkaSheet';

/** Langkah satu ketukan tombol −/+ (kg). */
const LANGKAH_KG = 0.1;
/** Sama dengan CHECK database (`RENTANG_BERAT_KG`). */
const BERAT_MIN = RENTANG_BERAT_KG.min;
const BERAT_MAKS = RENTANG_BERAT_KG.maks;

/**
 * Selisih terhadap timbangan terakhir yang dianggap tidak wajar untuk semalam.
 * Di atas ini pengguna diminta mengonfirmasi — penjaga salah ketik, bukan
 * penghakiman atas angkanya.
 */
const AMBANG_KONFIRMASI_KG = 3;

/** Berapa lama tanda "Tersimpan" bertahan di kartu setelah sheet tertutup. */
const DURASI_TANDA_MS = 2200;

/** Tahap penyimpanan; dipakai untuk mengunci tombol dan memberi umpan balik. */
type StatusSimpan = 'idle' | 'konfirmasi' | 'menyimpan' | 'tersimpan' | 'gagal';

type Props = {
  /** Berat pagi hari ini; `null` bila belum ditimbang. */
  beratKg: number | null;
  sumber: SumberBerat | null;
  /** Berat tercatat terakhir sebelum hari ini — nilai awal saat belum menimbang. */
  beratSebelumnyaKg: number | null;
  /** Beberapa timbangan terakhir beserta asalnya, urut baru → lama. */
  riwayat: EntriBerat[];
  /**
   * Menyimpan berat. Boleh async dan boleh menolak — sheet menampilkan
   * status "Menyimpan…", "Tersimpan", atau "Gagal" sesuai hasilnya, jadi
   * penggantian ke penulisan Supabase nanti tidak mengubah komponen ini.
   */
  onSimpan: (beratKg: number) => void | Promise<void>;
};

/**
 * Kartu Timbang Pagi — mode cepat DUA TAP.
 *
 * Tap 1: ketuk kartu → sheet terbuka dengan angka sudah terisi
 *        (berat hari ini, atau berat terakhir bila belum menimbang).
 * Tap 2: ketuk Simpan.
 *
 * Tombol −/+ dan input angka tersedia untuk koreksi, tapi tidak wajib dilewati:
 * jalur tercepat tetap dua tap dan papan ketik tidak muncul sendiri.
 */
export function KartuTimbangPagi({
  beratKg,
  sumber,
  beratSebelumnyaKg,
  riwayat,
  onSimpan,
}: Props) {
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [status, setStatus] = useState<StatusSimpan>('idle');
  const [baruTersimpan, setBaruTersimpan] = useState(false);
  const nilaiAwal = beratKg ?? beratSebelumnyaKg ?? 70;
  const [draf, setDraf] = useState(() => formatDesimal(nilaiAwal));

  // Samakan draf dengan data terbaru dan reset status setiap sheet dibuka.
  useEffect(() => {
    if (sheetTerbuka) {
      setDraf(formatDesimal(nilaiAwal));
      setStatus('idle');
    }
  }, [sheetTerbuka, nilaiAwal]);

  // Tanda "Tersimpan" di kartu hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (!baruTersimpan) return;
    const t = setTimeout(() => setBaruTersimpan(false), DURASI_TANDA_MS);
    return () => clearTimeout(t);
  }, [baruTersimpan]);

  const drafAngka = uraiAngka(draf);
  const valid = drafAngka !== null && drafAngka >= BERAT_MIN && drafAngka <= BERAT_MAKS;
  const selisih =
    beratKg !== null && beratSebelumnyaKg !== null ? beratKg - beratSebelumnyaKg : null;
  const jenisSumber = beratKg !== null ? sumberBerat(sumber) : null;

  /** Selisih draf terhadap timbangan terakhir — dasar konfirmasi salah ketik. */
  const lompatan =
    drafAngka !== null && beratSebelumnyaKg !== null
      ? Math.abs(drafAngka - beratSebelumnyaKg)
      : 0;
  const perluKonfirmasi = lompatan > AMBANG_KONFIRMASI_KG;

  /** Tap Simpan: minta konfirmasi dulu bila lompatannya tidak wajar. */
  function tekanSimpan() {
    if (!valid || drafAngka === null) return;
    if (perluKonfirmasi && status !== 'konfirmasi') {
      ketukRingan();
      setStatus('konfirmasi');
      return;
    }
    void jalankanSimpan();
  }

  async function jalankanSimpan() {
    if (!valid || drafAngka === null) return;
    setStatus('menyimpan');
    try {
      await onSimpan(Math.round(drafAngka * 10) / 10);
      ketukBerhasil();
      setStatus('tersimpan');
      setBaruTersimpan(true);
      // Beri sekejap agar konfirmasi terbaca sebelum sheet menutup sendiri.
      setTimeout(() => setSheetTerbuka(false), 650);
    } catch {
      setStatus('gagal');
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          beratKg !== null
            ? `Berat pagi ${formatDesimal(beratKg)} kilogram. Ketuk untuk mengubah.`
            : 'Belum menimbang pagi ini. Ketuk untuk mencatat.'
        }
        onPress={() => {
          ketukRingan();
          setSheetTerbuka(true);
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
                Timbang pagi
              </Text>

              {beratKg !== null ? (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                  <Text style={{ ...typography.display, color: colors.teks }}>
                    {formatDesimal(beratKg)}
                  </Text>
                  <Text style={{ ...typography.label, color: colors.teksSamar }}>kg</Text>
                  {selisih !== null && Math.abs(selisih) >= 0.05 ? (
                    <Text
                      style={{
                        ...typography.label,
                        color: selisih > 0 ? colors.aksen.teks : colors.status.sukses.teks,
                      }}
                    >
                      {formatSelisih(selisih)}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ ...typography.display, color: colors.teksSamar }}>—</Text>
              )}

              {jenisSumber !== null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <PenandaSumber
                    jenis={jenisSumber}
                    detail={jenisSumber === 'sinkron' ? 'Apple Health' : undefined}
                  />
                  <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                    {baruTersimpan ? '' : 'ketuk untuk ubah'}
                  </Text>
                  {baruTersimpan ? (
                    <Text style={{ ...typography.caption, color: colors.status.sukses.teks }}>
                      ✓ Tersimpan
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                  Belum ditimbang · ketuk untuk catat
                </Text>
              )}
            </View>

            <View
              style={{
                width: TAP_MIN,
                height: TAP_MIN,
                borderRadius: radius.pill,
                backgroundColor: tint(colors.aksen.isian, 'aktif'),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ ...typography.title, color: colors.aksen.teks }}>
                {beratKg === null ? '+' : '›'}
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>

      <KerangkaSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} label="Berat pagi">
        <PemilihAngka
          nilai={draf}
          onUbah={setDraf}
          langkah={LANGKAH_KG}
          min={BERAT_MIN}
          maks={BERAT_MAKS}
          cadangan={nilaiAwal}
          unit="kg"
          unitAkses="kilogram"
          aksesLabel="Berat dalam kilogram"
          galat={valid ? null : `Masukkan berat antara ${BERAT_MIN} dan ${BERAT_MAKS} kg`}
        />

        {/* Asal angka yang sedang diubah, plus akibat menyimpannya. */}
        {jenisSumber !== null ? (
          <Panel>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>Asal angka</Text>
              <PenandaSumber
                jenis={jenisSumber}
                detail={jenisSumber === 'sinkron' ? 'Apple Health' : undefined}
              />
            </View>
            {jenisSumber === 'sinkron' ? (
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                Angka ini ditarik dari Apple Health. Menyimpan di sini akan
                menggantinya dengan catatan manual Anda.
              </Text>
            ) : null}
          </Panel>
        ) : null}

        {/* Timbangan sebelumnya beserta asalnya masing-masing. */}
        {riwayat.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
              Timbangan sebelumnya
            </Text>
            {riwayat.map((r) => (
              <View
                key={r.tanggal}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                }}
              >
                <Text style={{ ...typography.caption, color: colors.teksRedup, flex: 1 }}>
                  {formatTanggalPanjang(r.tanggal)}
                </Text>
                <PenandaSumber jenis={sumberBerat(r.sumber_berat) ?? 'manual'} />
                <Text style={{ ...typography.label, color: colors.teks, width: ukuran.kolomAngkaBaris, textAlign: 'right' }}>
                  {formatDesimal(r.berat_pagi_kg)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <KeadaanKosong
            tampilan="polos"
            judul="Belum ada catatan berat sebelumnya"
            keterangan="Timbangan yang Anda simpan tampil di sini sebagai pembanding."
          />
        )}

        {/* Penjaga salah ketik: lompatan tak wajar diminta dikonfirmasi. */}
        {status === 'konfirmasi' ? (
          <Panel nada="aksen">
            <Text style={{ ...typography.label, color: colors.aksen.teks }}>
              Beda {formatDesimal(lompatan)} kg dari timbangan terakhir
            </Text>
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              Lompatan sebesar ini biasanya salah ketik. Periksa sekali lagi, atau
              lanjutkan bila memang benar.
            </Text>
          </Panel>
        ) : null}

        {status === 'gagal' ? (
          <Panel nada="bahaya" style={{ gap: spacing.xs }}>
            <Text style={{ ...typography.label, color: colors.status.bahaya.teks }}>
              Gagal menyimpan
            </Text>
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              Angka Anda masih tersimpan di layar ini. Coba lagi.
            </Text>
          </Panel>
        ) : null}

        <View style={{ gap: spacing.md }}>
          <Tombol
            label={labelTombolSimpan(status, perluKonfirmasi)}
            onPress={tekanSimpan}
            nonaktif={!valid}
            memproses={status === 'menyimpan'}
            berhasil={status === 'tersimpan'}
          />

          <Tombol
            varian="teks"
            ukuran="kecil"
            nada="netral"
            sejajar="tengah"
            label={status === 'konfirmasi' ? 'Periksa lagi' : 'Batal'}
            nonaktif={status === 'menyimpan' || status === 'tersimpan'}
            onPress={() => (status === 'konfirmasi' ? setStatus('idle') : setSheetTerbuka(false))}
          />
        </View>
      </KerangkaSheet>
    </>
  );
}

/** Teks tombol simpan sesuai tahap penyimpanan. */
function labelTombolSimpan(status: StatusSimpan, perluKonfirmasi: boolean): string {
  switch (status) {
    case 'menyimpan':
      return 'Menyimpan…';
    case 'tersimpan':
      return 'Tersimpan';
    case 'gagal':
      return 'Coba lagi';
    case 'konfirmasi':
      return 'Ya, simpan';
    default:
      return perluKonfirmasi ? 'Simpan…' : 'Simpan';
  }
}
