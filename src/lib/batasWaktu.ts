/** Server tidak menjawab dalam batas waktu; diperlakukan seperti putus jaringan. */
export class BatasWaktuHabis extends Error {
  readonly status = 0;
  constructor() {
    super('batas waktu');
    this.name = 'BatasWaktuHabis';
  }
}

/**
 * Tunggu `janji` paling lama `ms`. Lewat dari itu melempar `BatasWaktuHabis`;
 * janjinya sendiri tetap berjalan (tidak bisa dibatalkan), jadi pemanggil
 * yang peduli hasil terlambat harus menjaganya sendiri.
 */
export function dalamBatasWaktu<T>(janji: Promise<T>, ms: number): Promise<T> {
  return new Promise((selesai, gagal) => {
    const t = setTimeout(() => gagal(new BatasWaktuHabis()), ms);
    janji.then(
      (v) => {
        clearTimeout(t);
        selesai(v);
      },
      (e) => {
        clearTimeout(t);
        gagal(e);
      },
    );
  });
}
