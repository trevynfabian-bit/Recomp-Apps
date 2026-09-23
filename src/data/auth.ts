import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { SesiServer } from '@recomp/logika';
import { supabase } from '@/lib/supabase';
import { penyimpananSesi, type PenyimpananSesi } from '@/lib/sesiPerangkat';

/**
 * Autentikasi lewat Supabase Auth: akun yang SAMA dengan web Next.js.
 *
 * Tidak ada pendaftaran di app (PRD); yang ada masuk, keluar, dan kirim
 * tautan atur ulang kata sandi. Galat Supabase dilempar APA ADANYA (membawa
 * `code` dan `status`), karena pemetaannya ke kalimat yang layak tampil
 * sudah ada di satu tempat: `kodeGagalMasuk` (@recomp/logika).
 *
 * `PenyediaSesi` memakai antarmuka `AuthApp` di bawah dan tidak tahu apakah
 * yang di belakangnya Supabase atau tiruan (`@/mocks/sesi`, dipakai bila
 * kredensial Supabase belum diisi).
 */

export type Pengguna = { id: string; email: string };

export type AuthApp = {
  /** Melempar galat bergaya Supabase (`code`, `status`, `message`). */
  masuk: (email: string, sandi: string) => Promise<Pengguna>;
  /** Mencabut sesi ini di server; melempar bila server tidak terjangkau. */
  keluar: () => Promise<void>;
  kirimAturUlang: (email: string) => Promise<void>;
  /** Keadaan sesi Supabase di perangkat, untuk `putuskanSesi`. */
  sesiServer: () => Promise<SesiServer>;
  /** Hapus sisa sesi Supabase di perangkat; tidak pernah melempar. */
  bersihkan: () => Promise<void>;
  /**
   * Dipanggil saat Supabase mengakhiri sesi dari sisinya (token pembaru
   * dicabut atau berakhir). Mengembalikan fungsi berhenti mendengarkan.
   */
  dengarkanBerakhir: (saatBerakhir: () => void) => () => void;
  /** Catatan sesi milik app; lihat `@/lib/sesiPerangkat`. */
  catatan: PenyimpananSesi;
};

export const authSupabase: AuthApp = {
  async masuk(email, sandi) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: sandi });
    if (error) throw error;
    if (!data.user) throw { code: 'unexpected_failure', status: 500, message: 'Sesi tidak diterima' };
    return { id: data.user.id, email: data.user.email ?? email };
  },

  async keluar() {
    // `local`: hanya sesi perangkat ini. Bawaan Supabase (`global`) mencabut
    // SEMUA sesi akun, termasuk web yang sedang terbuka di laptop.
    // Supabase tetap menghapus sesi di perangkat meski server tidak menjawab.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  },

  async kirimAturUlang(email) {
    // Tanpa `redirectTo`: tautannya menuju Site URL proyek, yaitu web, tempat
    // halaman atur ulang kata sandi sudah ada. Supabase menjawab sama untuk
    // email yang terdaftar maupun tidak.
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },

  async sesiServer() {
    // getSession membaca dari perangkat dan memperbarui token bila perlu.
    const { data, error } = await supabase.auth.getSession();
    if (data.session) {
      const u = data.session.user;
      return { ada: true, pengguna: { id: u.id, email: u.email ?? '' } };
    }
    // Pembaruan token gagal karena jaringan/server: belum tentu dicabut.
    if (error && isAuthRetryableFetchError(error)) return { ada: 'tidak-pasti' };
    return { ada: false };
  },

  async bersihkan() {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  },

  dengarkanBerakhir(saatBerakhir) {
    const { data } = supabase.auth.onAuthStateChange((peristiwa) => {
      // Ditunda: Supabase melarang kerja berat di dalam pendengar ini.
      if (peristiwa === 'SIGNED_OUT') setTimeout(saatBerakhir, 0);
    });
    return () => data.subscription.unsubscribe();
  },

  catatan: penyimpananSesi('recomp.sesi'),
};
