import * as Haptics from 'expo-haptics';

/**
 * Pembungkus haptics yang aman dipanggil di mana saja.
 * Di web dan perangkat tanpa taptic engine, panggilan ini tidak melakukan apa-apa
 * alih-alih melempar error.
 */
export function ketukRingan() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function ketukBerhasil() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
