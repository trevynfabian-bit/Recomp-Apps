import { Text, View } from 'react-native';
import {
  estimasiBodyFatNavy,
  formatDesimal,
  formatTanggalPanjang,
  komposisiTubuh,
  type HasilBodyFat,
} from '@recomp/logika';
import { Card, Pemisah } from './Card';
import { Pill } from './Pill';
import type { Profile, UkuranTubuh } from '@/types/domain';
import { colors, radius, spacing, typography } from '@/theme';
import { Tombol } from './Tombol';

type Props = {
  profil: Profile;
  /** Pencatatan terbaru — sumber lingkar pinggang & leher. */
  terbaru: UkuranTubuh;
  /** Pencatatan paling awal, untuk memperlihatkan arah estimasi. */
  pertama: UkuranTubuh | null;
  /**
   * Rata-rata berat 7 hari, bukan timbangan harian — angka harian bergoyang
   * karena air dan isi usus, dan massa lemak yang ikut bergoyang akan terbaca
   * seperti perubahan komposisi yang tidak pernah terjadi. `null` bila belum
   * ada timbangan sama sekali.
   */
  beratRataRataKg: number | null;
  /**
   * Membuka sheet melengkapi profil. Dipakai saat estimasi terhalang data
   * profil yang kosong — dan tetap tersedia saat estimasi berhasil, karena
   * tinggi badan yang salah ketik akan memiringkan SETIAP estimasi tanpa
   * pernah terlihat salah.
   */
  onLengkapiProfil: () => void;
};

/**
 * Kartu estimasi body fat metode Navy.
 *
 * Kartu ini sengaja tidak memakai angka hero: hero layar ini sudah dipakai
 * lingkar pinggang, yang merupakan PENGUKURAN, sementara angka di sini hasil
 * rumus. Memberi keduanya bobot visual yang sama akan menyamakan sesuatu yang
 * diukur dengan sesuatu yang ditebak.
 *
 * Yang ditampilkan karena itu bukan satu angka telanjang, melainkan angka
 * beserta rentang wajarnya, arah perubahannya, dan seberapa jauh satu
 * sentimeter salah ukur menggesernya.
 */
export function KartuBodyFat({
  profil,
  terbaru,
  pertama,
  beratRataRataKg,
  onLengkapiProfil,
}: Props) {
  const hasil = estimasiBodyFatNavy({
    jenisKelamin: profil.jenis_kelamin,
    tinggiCm: profil.tinggi_cm,
    pinggangCm: terbaru.pinggang_cm,
    leherCm: terbaru.leher_cm,
  });

  if (hasil.persen === null) {
    return (
      <KartuKosong
        alasan={hasil.alasanKosong}
        kurang={hasil.kurang}
        onLengkapiProfil={onLengkapiProfil}
      />
    );
  }

  const awal =
    pertama && pertama.id !== terbaru.id
      ? estimasiBodyFatNavy({
          jenisKelamin: profil.jenis_kelamin,
          tinggiCm: profil.tinggi_cm,
          pinggangCm: pertama.pinggang_cm,
          leherCm: pertama.leher_cm,
        })
      : null;
  const selisihPoin =
    awal?.persen != null ? Math.round((hasil.persen - awal.persen) * 10) / 10 : null;

  const komposisi = beratRataRataKg !== null ? komposisiTubuh(hasil.persen, beratRataRataKg) : null;

  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
          Body fat
        </Text>
        <Pill diKartu label="ESTIMASI" warna={colors.aksen.teks} />
      </View>

      {/* Angka, lalu rentangnya. Rentang tidak disembunyikan di balik info icon:
          ia bagian dari angkanya, bukan catatan kaki. */}
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          <Text style={{ ...typography.display, color: colors.teks }}>
            {formatDesimal(hasil.persen)}
          </Text>
          <Text style={{ ...typography.title, color: colors.teksSamar, paddingBottom: spacing.xxs }}>%</Text>
        </View>
        <Text style={{ ...typography.label, color: colors.teksRedup }}>
          wajarnya di antara {formatDesimal(hasil.rentang!.bawah)}% dan{' '}
          {formatDesimal(hasil.rentang!.atas)}%
        </Text>
        {/* Perubahan dan periodenya satu kalimat: dipisah, "sejak 1 September"
            terbaca seolah menerangkan rentang di atasnya. */}
        {selisihPoin !== null && pertama ? (
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            {selisihPoin === 0
              ? 'tidak berubah'
              : `${selisihPoin > 0 ? '+' : '−'}${formatDesimal(Math.abs(selisihPoin))} poin`}{' '}
            sejak {formatTanggalPanjang(pertama.tanggal)}
          </Text>
        ) : null}
      </View>

      {/* Massa lemak vs massa bebas lemak — di sinilah rekomposisi terlihat. */}
      {komposisi ? (
        <View
          style={{
            flexDirection: 'row',
            borderRadius: radius.md,
            backgroundColor: colors.permukaanCekung,
            overflow: 'hidden',
          }}
        >
          <BagianKomposisi
            label="Massa lemak"
            nilai={komposisi.lemakKg}
            warna={colors.macroTeks.lemak}
          />
          <Pemisah arah="vertikal" />
          <BagianKomposisi
            label="Massa bebas lemak"
            nilai={komposisi.bebasLemakKg}
            warna={colors.status.sukses.teks}
          />
        </View>
      ) : null}

      {komposisi ? (
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          Dihitung dari rata-rata berat 7 hari {formatDesimal(beratRataRataKg!)} kg, bukan timbangan
          satu pagi. Keduanya ikut menanggung ketidakpastian persennya: ±
          {formatDesimal(hasil.ketidakpastian, 0)} poin di sini berarti sekitar ±
          {formatDesimal((hasil.ketidakpastian / 100) * beratRataRataKg!)} kg.
        </Text>
      ) : null}

      {/* Kenapa angka ini tidak boleh dibaca sebagai hasil pengukuran. */}
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          Metode Navy menghitungnya dari lingkar pinggang dan leher plus tinggi badan — bukan dari
          lemak yang benar-benar diukur. Galat bakunya sekitar ±
          {formatDesimal(hasil.ketidakpastian, 0)} poin terhadap DXA, jadi ANGKANYA jangan dipakai
          sebagai target. ARAHNYA yang berguna: galat yang sama ikut terbawa tiap pekan, sehingga
          sebagian besar saling meniadakan saat Anda membandingkannya dengan diri sendiri.
        </Text>
        {hasil.sensitivitasPinggang !== null ? (
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            Pada ukuran Anda, meteran pinggang yang meleset 1 cm menggeser estimasi ini{' '}
            {formatDesimal(Math.abs(hasil.sensitivitasPinggang))} poin — itulah kenapa titik ukur
            yang konsisten lebih menentukan daripada ketelitian angkanya.
          </Text>
        ) : null}
      </View>

      {/* Masukan profil ditampilkan terbuka, bukan disembunyikan: tinggi badan
          yang salah ketik memiringkan setiap estimasi tanpa pernah kelihatan
          salah di angkanya. */}
      <Tombol
        varian="bertepi"
        ukuran="kecil"
        label="Ubah"
        aksesLabel="Ubah tinggi badan dan jenis kelamin"
        sejajar="tengah"
        onPress={() => onLengkapiProfil()}
      />
    </Card>
  );
}

/** Satu sisi pecahan berat: massa lemak atau massa bebas lemak. */
function BagianKomposisi({
  label,
  nilai,
  warna,
}: {
  label: string;
  nilai: number;
  warna: string;
}) {
  return (
    <View style={{ flex: 1, padding: spacing.md, gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: colors.teksSamar }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
        {/* Tanda ± bukan hiasan: kedua angka ini turunan dari persen yang estimasi. */}
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>±</Text>
        <Text style={{ ...typography.title, color: warna }}>{formatDesimal(nilai)}</Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>kg</Text>
      </View>
    </View>
  );
}

/**
 * Tampilan saat estimasi tidak bisa dihitung.
 *
 * Alasannya disebut, lalu — bila memang bisa diperbaiki dari profil — jalan
 * keluarnya disediakan di tempat. Kartu yang cuma bilang "belum bisa dihitung"
 * memindahkan pekerjaan mencari tahu ke pengguna, dan itu alasan paling umum
 * data profil tidak pernah terisi.
 *
 * Tombol UTAMA hanya muncul untuk kekurangan yang benar-benar bisa ditutup dari
 * profil. Untuk `pinggul` ia diganti tautan sekunder: mengisi profil tidak akan
 * memunculkan estimasi (lingkar pinggulnya belum dicatat app ini), tapi jalan
 * masuk ke profil tetap harus ada — tanpa itu, salah ketuk "Wanita" akan
 * mengunci pengguna di kartu yang tidak punya jalan keluar. Untuk `ukuran`
 * tidak ada keduanya: yang itu cuma bisa diperbaiki dengan mengukur ulang.
 */
function KartuKosong({
  alasan,
  kurang,
  onLengkapiProfil,
}: {
  alasan: HasilBodyFat['alasanKosong'];
  kurang: HasilBodyFat['kurang'];
  onLengkapiProfil: () => void;
}) {
  const bisaDilengkapi = kurang === 'tinggi' || kurang === 'jenis-kelamin';
  const adaJalanKeProfil = bisaDilengkapi || kurang === 'pinggul';

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
          Body fat
        </Text>
        <Pill diKartu label="ESTIMASI" warna={colors.teksRedup} />
      </View>
      <Text style={{ ...typography.body, color: colors.teksRedup }}>Belum bisa dihitung</Text>
      <Text style={{ ...typography.caption, color: colors.teksSamar }}>
        {alasan ?? 'Data yang dibutuhkan rumus Navy belum lengkap.'}
      </Text>

      {bisaDilengkapi ? (
        <>
          <Tombol label="Lengkapi profil" aksesLabel="Lengkapi profil" onPress={onLengkapiProfil} />
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            Cukup sekali isi. Ukuran yang sudah Anda catat tetap tersimpan dan tidak perlu
            diulang — estimasinya langsung muncul begitu datanya lengkap.
          </Text>
        </>
      ) : adaJalanKeProfil ? (
        <Tombol
          varian="bertepi"
          label="Ubah data profil"
          aksesLabel="Ubah data profil"
          sejajar="tengah"
          onPress={() => onLengkapiProfil()}
        />
      ) : null}
    </Card>
  );
}
