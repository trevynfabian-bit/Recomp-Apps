/**
 * Target widget layar kunci untuk `@bacons/apple-targets`.
 *
 * BELUM DIAKTIFKAN: plugin `@bacons/apple-targets` sengaja belum dipasang di
 * app.json. Kode Swift di folder ini belum pernah dikompilasi (tidak ada Xcode
 * di lingkungan tempat ia ditulis), dan target native yang gagal dikompilasi
 * menggagalkan seluruh build iOS. Mengaktifkannya adalah langkah pertama task
 * backend widget: pasang plugin, jalankan `npx expo prebuild -p ios`, bangun
 * di Xcode, lalu ganti `PenyediaTiruan` dengan pembacaan `daily_summaries`.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'widget',
  name: 'RecompWidget',
  bundleIdentifier: '.widget',
  // `containerBackground` & gauge layar kunci butuh iOS 17.
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
});
