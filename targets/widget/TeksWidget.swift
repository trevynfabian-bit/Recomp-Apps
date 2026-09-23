import Foundation

/// Cermin `KeadaanKosongWidget` di @recomp/logika: tidak ada angka hari ini.
enum KeadaanKosongWidget {
  case belumMasuk
  case tanpaTarget
  case hariBaru
}

/// Data yang dibaca widget — cermin `RingkasanWidget` di @recomp/logika.
struct RingkasanWidget {
  let sisaKalori: Int?
  let sisaProteinG: Double?
  let targetKalori: Int?
  let dihitungPada: Date?
  var kosong: KeadaanKosongWidget? = nil
  var targetProteinG: Double? = nil
}

/// Ringkasan yang tersimpan di app group, beserta tanggal (WIB) miliknya.
struct RingkasanTersimpan {
  let ringkasan: RingkasanWidget
  /// `YYYY-MM-DD` menurut Asia/Jakarta.
  let tanggal: String
}

struct TeksPersegi {
  let judul: String
  let baris1: String
  let baris2: String
  let aksesLabel: String
}

struct IsiLingkar {
  let angka: String
  let satuan: String
  /// Porsi target yang terpakai, 0...1; `nil` bila target tidak diketahui.
  let terpakai: Double?
  let aksesLabel: String
}

/// Aturan kalimat widget — CERMIN `teksWidget`, `teksWidgetSebaris`, dan
/// `isiWidgetLingkar` di packages/logika/src/pengingat.ts.
///
/// WidgetKit tidak bisa menjalankan TypeScript, jadi aturannya ditulis ulang
/// di sini. Frasa dan nadanya dijaga `npm run cek:widget`: setiap frasa di
/// TypeScript harus ada di berkas ini, dan tidak ada satu pun kata menegur.
/// Mengubah kalimat di satu sisi tanpa sisi lain akan gagal di pemeriksaan itu.
enum TeksWidget {
  /// "1.120" — pemisah ribuan titik, seperti `formatAngka`.
  private static let formatBulat: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "id_ID")
    f.numberStyle = .decimal
    f.maximumFractionDigits = 0
    return f
  }()

  /// "57" atau "12,5" — satu desimal hanya bila ada pecahan, seperti `formatMakro`.
  private static let formatSatuDesimal: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "id_ID")
    f.numberStyle = .decimal
    f.minimumFractionDigits = 0
    f.maximumFractionDigits = 1
    return f
  }()

  static func formatAngka(_ n: Int) -> String {
    formatBulat.string(from: NSNumber(value: n)) ?? String(n)
  }

  static func formatMakro(_ n: Double) -> String {
    let dibulatkan = (n * 10).rounded() / 10
    return formatSatuDesimal.string(from: NSNumber(value: dibulatkan)) ?? String(dibulatkan)
  }

  /// Setelah selama ini, angka widget diberi label jamnya — seperti `BATAS_SEGAR_MS`.
  static let batasSegar: TimeInterval = 60 * 60

  static let zonaWib = TimeZone(identifier: "Asia/Jakarta") ?? TimeZone(secondsFromGMT: 7 * 3600)!

  private static let formatTanggal: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = zonaWib
    f.dateFormat = "yyyy-MM-dd"
    return f
  }()

  /// "07.12" — jam WIB gaya Indonesia, seperti `formatJam`.
  private static let formatJam: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = zonaWib
    f.dateFormat = "HH.mm"
    return f
  }()

  /// Tanggal `YYYY-MM-DD` menurut Asia/Jakarta, seperti `tanggalHariIni`.
  static func tanggalWib(_ t: Date) -> String {
    formatTanggal.string(from: t)
  }

  /// Tengah malam WIB berikutnya: saat ringkasan hari ini berhenti berlaku.
  static func tengahMalamBerikut(setelah t: Date) -> Date {
    var kalender = Calendar(identifier: .gregorian)
    kalender.timeZone = zonaWib
    let awal = kalender.startOfDay(for: t)
    return kalender.date(byAdding: .day, value: 1, to: awal) ?? t.addingTimeInterval(86_400)
  }

  /// Cermin `siapkanWidget`: ringkasan yang tanggalnya BUKAN hari ini dibuang.
  /// Widget hidup berjam-jam tanpa dimuat ulang, dan angka kemarin yang tampil
  /// sebagai hari ini adalah angka salah yang terlihat benar.
  static func siapkan(
    masuk: Bool,
    tersimpan: RingkasanTersimpan?,
    targetKalori: Int?,
    targetProteinG: Double?,
    hariIni: String
  ) -> RingkasanWidget {
    func kosong(_ k: KeadaanKosongWidget) -> RingkasanWidget {
      RingkasanWidget(
        sisaKalori: nil, sisaProteinG: nil, targetKalori: targetKalori, dihitungPada: nil,
        kosong: k, targetProteinG: targetProteinG
      )
    }
    guard masuk else { return kosong(.belumMasuk) }
    guard let kalori = targetKalori else { return kosong(.tanpaTarget) }
    guard let t = tersimpan, t.tanggal == hariIni else { return kosong(.hariBaru) }
    let r = t.ringkasan
    return RingkasanWidget(
      sisaKalori: r.sisaKalori, sisaProteinG: r.sisaProteinG, targetKalori: r.targetKalori ?? kalori,
      dihitungPada: r.dihitungPada, kosong: r.kosong, targetProteinG: r.targetProteinG
    )
  }

  static func persegi(_ r: RingkasanWidget, tampilkanAngka: Bool, sekarang: Date? = nil) -> TeksPersegi {
    guard tampilkanAngka else {
      return TeksPersegi(
        judul: "Recomp",
        baris1: "Buka app untuk",
        baris2: "melihat sisa hari ini",
        aksesLabel: "Recomp. Buka app untuk melihat sisa hari ini."
      )
    }
    switch r.kosong {
    case .belumMasuk:
      return TeksPersegi(
        judul: "Recomp",
        baris1: "Masuk ke app untuk",
        baris2: "melihat sisa hari ini",
        aksesLabel: "Recomp. Masuk ke app untuk melihat sisa hari ini."
      )
    case .tanpaTarget:
      return TeksPersegi(
        judul: "Sisa hari ini",
        baris1: "Target belum diatur",
        baris2: "Atur di app",
        aksesLabel: "Target belum diatur. Atur di app."
      )
    case .hariBaru:
      if let target = r.targetKalori {
        let kalori = "Target \(formatAngka(target)) kcal"
        let protein = r.targetProteinG.map { "Protein \(formatMakro($0)) g" } ?? "Belum ada catatan"
        return TeksPersegi(judul: "Hari baru", baris1: kalori, baris2: protein, aksesLabel: "Hari baru. \(kalori). \(protein).")
      }
    case nil:
      break
    }
    guard let sisa = r.sisaKalori, r.kosong == nil else {
      return TeksPersegi(
        judul: "Sisa hari ini",
        baris1: "Belum ada ringkasan",
        baris2: "Buka app untuk mulai",
        aksesLabel: "Belum ada ringkasan hari ini."
      )
    }
    let kalori = sisa >= 0
      ? "\(formatAngka(sisa)) kcal tersisa"
      : "\(formatAngka(-sisa)) kcal di atas target"
    let protein: String
    if let p = r.sisaProteinG {
      protein = p > 0 ? "\(formatMakro(p)) g protein lagi" : "Protein tercapai"
    } else {
      protein = "Protein belum ditargetkan"
    }
    // Angka yang sudah lebih dari sejam diberi jamnya.
    var judul = "Sisa hari ini"
    if let sekarang, let dihitung = r.dihitungPada, sekarang.timeIntervalSince(dihitung) > batasSegar {
      judul = "Sisa per \(formatJam.string(from: dihitung))"
    }
    return TeksPersegi(judul: judul, baris1: kalori, baris2: protein, aksesLabel: "\(judul): \(kalori). \(protein).")
  }

  static func sebaris(_ r: RingkasanWidget, tampilkanAngka: Bool) -> String {
    if tampilkanAngka, r.kosong == .hariBaru, let target = r.targetKalori {
      return "Target \(formatAngka(target)) kcal"
    }
    guard tampilkanAngka, r.kosong == nil, let sisa = r.sisaKalori else { return "Recomp" }
    let kalori = sisa >= 0 ? "\(formatAngka(sisa)) kcal" : "+\(formatAngka(-sisa)) kcal"
    guard let p = r.sisaProteinG else { return kalori }
    let protein = p > 0 ? "\(formatMakro(p)) g protein" : "protein tercapai"
    return "\(kalori) · \(protein)"
  }

  static func lingkar(_ r: RingkasanWidget, tampilkanAngka: Bool) -> IsiLingkar {
    if tampilkanAngka, r.kosong == .hariBaru, let target = r.targetKalori {
      // Cincin kosong + target: hari baru dimulai dari nol, bukan dari angka kemarin.
      return IsiLingkar(angka: formatAngka(target), satuan: "target", terpakai: 0, aksesLabel: "Hari baru. Target \(formatAngka(target)) kcal.")
    }
    guard tampilkanAngka, r.kosong == nil, let sisa = r.sisaKalori else {
      return IsiLingkar(angka: "–", satuan: "kcal", terpakai: nil, aksesLabel: "Recomp. Buka app untuk melihat sisa hari ini.")
    }
    var terpakai: Double? = nil
    if let target = r.targetKalori, target > 0 {
      // Berhenti di penuh: cincin yang meluap adalah peringatan dalam bentuk grafik.
      terpakai = min(1, max(0, Double(target - sisa) / Double(target)))
    }
    if sisa >= 0 {
      return IsiLingkar(angka: formatAngka(sisa), satuan: "kcal", terpakai: terpakai, aksesLabel: "\(formatAngka(sisa)) kcal tersisa.")
    }
    return IsiLingkar(angka: "+\(formatAngka(-sisa))", satuan: "kcal", terpakai: terpakai, aksesLabel: "\(formatAngka(-sisa)) kcal di atas target.")
  }
}
