import SwiftUI
import WidgetKit

/// Satu entri timeline widget.
struct EntriWidget: TimelineEntry {
  let date: Date
  let ringkasan: RingkasanWidget
  /// Cermin `settings_notifications.widget_aktif`: bila mati, layar kunci
  /// tidak menampilkan satu angka pun.
  let tampilkanAngka: Bool
}

/// Penyedia TIRUAN: angka yang sama dengan layar Hari Ini tiruan di app.
/// Task backend menggantinya dengan pembacaan `daily_summaries` (dihitung
/// server) — widget hanya MEMBACA, tidak pernah menghitung.
struct PenyediaTiruan: TimelineProvider {
  static let contoh = RingkasanWidget(sisaKalori: 1120, sisaProteinG: 57, targetKalori: 3100, dihitungPada: Date())

  func placeholder(in context: Context) -> EntriWidget {
    EntriWidget(date: Date(), ringkasan: Self.contoh, tampilkanAngka: true)
  }

  func getSnapshot(in context: Context, completion: @escaping (EntriWidget) -> Void) {
    completion(placeholder(in: context))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<EntriWidget>) -> Void) {
    // Minta dimuat ulang setengah jam lagi; server menghitung ulang ringkasan
    // secara berkala, dan layar kunci tidak perlu lebih segar dari itu.
    let berikut = Date().addingTimeInterval(30 * 60)
    completion(Timeline(entries: [placeholder(in: context)], policy: .after(berikut)))
  }
}

struct TampilanWidget: View {
  @Environment(\.widgetFamily) private var keluarga
  let entri: EntriWidget

  var body: some View {
    switch keluarga {
    case .accessoryInline:
      Text(TeksWidget.sebaris(entri.ringkasan, tampilkanAngka: entri.tampilkanAngka))
    case .accessoryCircular:
      WidgetLingkar(isi: TeksWidget.lingkar(entri.ringkasan, tampilkanAngka: entri.tampilkanAngka))
    default:
      WidgetPersegi(teks: TeksWidget.persegi(entri.ringkasan, tampilkanAngka: entri.tampilkanAngka))
    }
  }
}

/// Cincin porsi target yang terpakai + sisa di tengah. Monokrom, seperti semua
/// widget layar kunci; tidak ada warna "melewati target".
struct WidgetLingkar: View {
  let isi: IsiLingkar

  var body: some View {
    Group {
      if let terpakai = isi.terpakai {
        Gauge(value: terpakai) {
          Text(isi.satuan)
        } currentValueLabel: {
          Text(isi.angka).minimumScaleFactor(0.6)
        }
        .gaugeStyle(.accessoryCircularCapacity)
      } else {
        VStack(spacing: 0) {
          Text(isi.angka).font(.headline).minimumScaleFactor(0.6)
          Text(isi.satuan).font(.caption2).foregroundStyle(.secondary)
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(isi.aksesLabel)
  }
}

struct WidgetPersegi: View {
  let teks: TeksPersegi

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(teks.judul.uppercased()).font(.caption2).foregroundStyle(.secondary)
      Text(teks.baris1).font(.headline).lineLimit(1).minimumScaleFactor(0.8)
      Text(teks.baris2).font(.caption).foregroundStyle(.secondary).lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(teks.aksesLabel)
  }
}

struct SisaHariIniWidget: Widget {
  let kind = "SisaHariIni"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: PenyediaTiruan()) { entri in
      TampilanWidget(entri: entri)
        .containerBackground(for: .widget) { Color.clear }
    }
    .configurationDisplayName("Sisa hari ini")
    .description("Sisa kalori dan protein hari ini.")
    .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}

@main
struct RecompWidgetBundle: WidgetBundle {
  var body: some Widget {
    SisaHariIniWidget()
  }
}
