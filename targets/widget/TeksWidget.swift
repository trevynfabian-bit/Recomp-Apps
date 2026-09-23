import Foundation

/// Data yang dibaca widget — cermin `RingkasanWidget` di @recomp/logika.
struct RingkasanWidget {
  let sisaKalori: Int?
  let sisaProteinG: Double?
  let targetKalori: Int?
  let dihitungPada: Date?
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

  static func persegi(_ r: RingkasanWidget, tampilkanAngka: Bool) -> TeksPersegi {
    guard tampilkanAngka else {
      return TeksPersegi(
        judul: "Recomp",
        baris1: "Buka app untuk",
        baris2: "melihat sisa hari ini",
        aksesLabel: "Recomp. Buka app untuk melihat sisa hari ini."
      )
    }
    guard let sisa = r.sisaKalori else {
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
    return TeksPersegi(judul: "Sisa hari ini", baris1: kalori, baris2: protein, aksesLabel: "\(kalori). \(protein).")
  }

  static func sebaris(_ r: RingkasanWidget, tampilkanAngka: Bool) -> String {
    guard tampilkanAngka, let sisa = r.sisaKalori else { return "Recomp" }
    let kalori = sisa >= 0 ? "\(formatAngka(sisa)) kcal" : "+\(formatAngka(-sisa)) kcal"
    guard let p = r.sisaProteinG else { return kalori }
    let protein = p > 0 ? "\(formatMakro(p)) g protein" : "protein tercapai"
    return "\(kalori) · \(protein)"
  }

  static func lingkar(_ r: RingkasanWidget, tampilkanAngka: Bool) -> IsiLingkar {
    guard tampilkanAngka, let sisa = r.sisaKalori else {
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
