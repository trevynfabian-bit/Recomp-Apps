import { Ionicons } from '@expo/vector-icons';
import { View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { colors, radius, typography, ukuran } from '@/theme';

type Tab = {
  /** Nama berkas rute di `app/(tabs)/`. */
  rute: string;
  /** Label tab: judul layarnya atau bentuk pendeknya ("Tren" untuk "Tren berat"). */
  judul: string;
  /**
   * Nama ikon Ionicons TANPA akhiran: tab terpilih memakai glyph terisi
   * (`today`), tab lain garis (`today-outline`). Terpilih jadi terbaca dari
   * bentuk, bukan dari warna saja (HIG: Tab bars).
   */
  ikon: 'today' | 'analytics' | 'wallet' | 'sparkles' | 'settings';
};

/**
 * Tab final (docs/desain/peta-navigasi.md §4): lima, batas HIG untuk iPhone,
 * diurutkan menurut seberapa sering dibuka dalam sehari — mencatat hari ini,
 * melihat arah berat, memeriksa jatah minggu, bertanya ke coach, lalu
 * setelan yang jarang disentuh di ujung. "Setelan", bukan "Pengaturan":
 * iOS berbahasa Indonesia memakai "Pengaturan" untuk app Settings-nya sendiri,
 * dan app ini punya tautan ke sana (izin notifikasi, Kesehatan). Judul layar diawali label tabnya,
 * supaya satu tempat punya satu nama (dijaga `cek:desain`).
 */
export const TAB: Tab[] = [
  { rute: 'index', judul: 'Hari Ini', ikon: 'today' },
  { rute: 'tren', judul: 'Tren', ikon: 'analytics' },
  { rute: 'budget', judul: 'Budget', ikon: 'wallet' },
  { rute: 'coach', judul: 'Coach', ikon: 'sparkles' },
  { rute: 'pengaturan', judul: 'Setelan', ikon: 'settings' },
];

/** Tab bar utama. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.aksen.teks,
        tabBarInactiveTintColor: colors.teksSamar,
        tabBarStyle: {
          backgroundColor: colors.latar,
          borderTopColor: colors.garis,
        },
        // Label tab tidak kapital, jadi tanpa tracking caption (itu untuk huruf kapital).
        tabBarLabelStyle: { ...typography.caption, letterSpacing: 0, textTransform: 'none' },
      }}
    >
      {TAB.map((t) => (
        <Tabs.Screen
          key={t.rute}
          name={t.rute}
          options={{
            title: t.judul,
            tabBarIcon: ({ color, size, focused }) => <IkonTab ikon={t.ikon} terpilih={focused} warna={color} ukuranIkon={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}

/**
 * Ikon tab dengan tiga penanda terpilih yang saling menguatkan: warna aksen,
 * glyph terisi, dan garis aksen pendek di tepi atas tab. Pembaca layar
 * mendapat keadaan terpilih dari tab bar (`aria-selected`).
 */
function IkonTab({
  ikon,
  terpilih,
  warna,
  ukuranIkon,
}: {
  ikon: Tab['ikon'];
  terpilih: boolean;
  warna: ColorValue;
  ukuranIkon: number;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      {terpilih ? (
        <View
          style={{
            position: 'absolute',
            // Menempel ke tepi atas tab: padding tab bawaan diimbangi.
            top: -ukuran.penandaTab.jarakAtas,
            width: ukuran.penandaTab.lebar,
            height: ukuran.penandaTab.tinggi,
            borderBottomLeftRadius: radius.pill,
            borderBottomRightRadius: radius.pill,
            backgroundColor: colors.aksen.isian,
          }}
        />
      ) : null}
      <Ionicons name={terpilih ? ikon : `${ikon}-outline`} size={ukuranIkon} color={warna} />
    </View>
  );
}
