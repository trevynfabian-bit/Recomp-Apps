import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { formatMakro } from '@recomp/logika';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import type { Profile } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, tint, typography, ukuran } from '@/theme';
import { Tombol } from './Tombol';
import { Panel } from './Card';
import { Isian } from './Isian';

/** Batas tinggi yang masuk akal; penjaga salah ketik, bukan penilaian. */
const TINGGI_MIN = 100;
const TINGGI_MAKS = 250;

type StatusSimpan = 'idle' | 'menyimpan' | 'tersimpan' | 'gagal';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  profil: Profile;
  onSimpan: (perubahan: Partial<Profile>) => void | Promise<void>;
};

/**
 * Sheet melengkapi data profil yang dibutuhkan estimasi body fat.
 *
 * Kenapa di sini dan bukan di Setelan: pengguna menemukan kekurangannya saat
 * sedang melihat layar Ukuran, dan memindahkannya ke tab lain berarti ia harus
 * mengingat sendiri untuk kembali. Perjalanan bolak-balik itulah yang membuat
 * data profil tidak pernah terisi.
 *
 * Tiap field disertai alasan KENAPA rumus membutuhkannya. Meminta jenis kelamin
 * tanpa menjelaskan apa pun terasa seperti pengumpulan data; menyebutkan bahwa
 * rumus Navy memakai konstanta berbeda untuk pria dan wanita membuatnya
 * terbaca sebagai apa adanya.
 */
export function SheetLengkapiProfil({ terbuka, onTutup, profil, onSimpan }: Props) {
  const [tinggi, setTinggi] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<Profile['jenis_kelamin']>(null);
  const [status, setStatus] = useState<StatusSimpan>('idle');

  useEffect(() => {
    if (!terbuka) return;
    // formatMakro, bukan formatDesimal: tinggi 176 cm tidak perlu tampil "176,0".
    setTinggi(profil.tinggi_cm !== null ? formatMakro(profil.tinggi_cm) : '');
    setJenisKelamin(profil.jenis_kelamin);
    setStatus('idle');
  }, [terbuka, profil.tinggi_cm, profil.jenis_kelamin]);

  const tinggiAngka = urai(tinggi);
  const tinggiValid =
    tinggiAngka !== null && tinggiAngka >= TINGGI_MIN && tinggiAngka <= TINGGI_MAKS;
  const bisaSimpan = tinggiValid && jenisKelamin !== null;
  const terkunci = status === 'menyimpan' || status === 'tersimpan';

  async function simpan() {
    if (!bisaSimpan) return;
    setStatus('menyimpan');
    try {
      await onSimpan({
        tinggi_cm: Math.round((tinggiAngka as number) * 10) / 10,
        jenis_kelamin: jenisKelamin,
      });
      ketukBerhasil();
      setStatus('tersimpan');
      setTimeout(onTutup, 650);
    } catch {
      setStatus('gagal');
    }
  }

  return (
    <Modal visible={terbuka} transparent animationType="slide" onRequestClose={onTutup}>
      <View style={{ flex: 1, backgroundColor: colors.selubung, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Tutup" onPress={onTutup} style={{ flex: 1 }} />

        <View
          style={{
            maxHeight: '88%',
            backgroundColor: colors.permukaan,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.garis,
          }}
        >
          <View
            style={{
              alignItems: 'center',
              paddingTop: spacing.md,
              paddingBottom: spacing.md,
              gap: spacing.sm,
            }}
          >
            <View
              style={{
                width: ukuran.pegangan.lebar,
                height: ukuran.pegangan.tinggi,
                borderRadius: radius.pill,
                backgroundColor: colors.garis,
              }}
            />
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
              Data untuk estimasi body fat
            </Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
          >
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              Dua data ini dipakai rumus Navy dan disimpan di profil, jadi cukup diisi sekali.
              Keduanya tidak dikirim ke mana pun selain database Anda sendiri.
            </Text>

            {/* Tinggi badan. Sengaja tanpa placeholder angka: angka contoh di
                kolom kosong terbaca seperti nilai yang sudah terisi. */}
            <Isian
              label="Tinggi badan"
              unit="cm"
              angka
              value={tinggi}
              onChangeText={setTinggi}
              keyboardType="decimal-pad"
              inputMode="decimal"
              selectTextOnFocus
              aksesLabel="Tinggi badan dalam sentimeter"
              galat={tinggi !== '' && !tinggiValid ? `Masukkan tinggi antara ${TINGGI_MIN} dan ${TINGGI_MAKS} cm.` : null}
              keterangan="Rumus Navy membandingkan lingkar pinggang dengan tinggi badan — tanpa tinggi, lingkar yang sama bisa berarti komposisi yang sangat berbeda."
            />

            {/* Jenis kelamin */}
            <View style={{ gap: spacing.sm }}>
              <Text style={{ ...typography.body, color: colors.teks }}>Jenis kelamin</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['pria', 'wanita'] as const).map((nilai) => (
                  <PilihanKelamin
                    key={nilai}
                    label={nilai === 'pria' ? 'Pria' : 'Wanita'}
                    aktif={jenisKelamin === nilai}
                    onPilih={() => {
                      ketukRingan();
                      setJenisKelamin(nilai);
                    }}
                  />
                ))}
              </View>
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                Rumus Navy memakai konstanta yang berbeda untuk pria dan wanita. Versi wanita juga
                butuh lingkar pinggul, yang belum dicatat app ini — jadi untuk sekarang estimasinya
                baru bisa dihitung untuk pria.
              </Text>
            </View>

            {status === 'gagal' ? (
              <Panel nada="bahaya" style={{ gap: spacing.xs }}>
                <Text style={{ ...typography.label, color: colors.status.bahaya.teks }}>
                  Gagal menyimpan
                </Text>
                <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                  Isian Anda masih ada di layar ini. Coba lagi.
                </Text>
              </Panel>
            ) : null}

            <View style={{ gap: spacing.md, paddingBottom: spacing.xl }}>
              <Tombol
                label={labelSimpan(status)}
                onPress={() => void simpan()}
                nonaktif={!bisaSimpan}
                memproses={status === 'menyimpan'}
                berhasil={status === 'tersimpan'}
              />

              <Tombol
                varian="teks"
                ukuran="kecil"
                nada="netral"
                label="Nanti saja"
                nonaktif={terkunci}
                sejajar="tengah"
                onPress={onTutup}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Satu pilihan jenis kelamin; terpilih ditandai bentuk, bukan warna saja. */
function PilihanKelamin({
  label,
  aktif,
  onPilih,
}: {
  label: string;
  aktif: boolean;
  onPilih: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: aktif }}
      accessibilityLabel={label}
      onPress={onPilih}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: TAP_MIN,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: aktif ? colors.aksen.isian : colors.garisKontrol,
        backgroundColor: aktif ? tint(colors.aksen.isian, 'pilih') : colors.permukaanCekung,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: ukuran.radio,
          height: ukuran.radio,
          borderRadius: radius.pill,
          borderWidth: 2,
          borderColor: aktif ? colors.aksen.isian : colors.garisKontrol,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {aktif ? (
          <View style={{ width: ukuran.titik, height: ukuran.titik, borderRadius: radius.pill, backgroundColor: colors.aksen.isian }} />
        ) : null}
      </View>
      <Text style={{ ...typography.body, color: aktif ? colors.teks : colors.teksRedup }}>
        {label}
      </Text>
    </Pressable>
  );
}

function labelSimpan(status: StatusSimpan): string {
  switch (status) {
    case 'menyimpan':
      return 'Menyimpan…';
    case 'tersimpan':
      return 'Tersimpan';
    case 'gagal':
      return 'Coba lagi';
    default:
      return 'Simpan ke profil';
  }
}

/** Urai input pengguna; menerima koma maupun titik sebagai pemisah desimal. */
function urai(teks: string): number | null {
  const bersih = teks.replace(',', '.').trim();
  if (bersih === '') return null;
  const n = Number(bersih);
  return Number.isFinite(n) ? n : null;
}
