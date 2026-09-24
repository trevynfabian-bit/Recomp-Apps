import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors, typography } from '@/theme';

type Tab = {
  /** Nama berkas rute di `app/(tabs)/`. */
  rute: string;
  /** Label tab: judul layarnya atau bentuk pendeknya ("Tren" untuk "Tren berat"). */
  judul: string;
  ikon: React.ComponentProps<typeof Ionicons>['name'];
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
  { rute: 'index', judul: 'Hari Ini', ikon: 'today-outline' },
  { rute: 'tren', judul: 'Tren', ikon: 'trending-up-outline' },
  { rute: 'budget', judul: 'Budget', ikon: 'wallet-outline' },
  { rute: 'coach', judul: 'Coach', ikon: 'sparkles-outline' },
  { rute: 'pengaturan', judul: 'Setelan', ikon: 'options-outline' },
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
            tabBarIcon: ({ color, size }) => <Ionicons name={t.ikon} size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
