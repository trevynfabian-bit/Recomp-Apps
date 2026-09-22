/**
 * Pemeriksa bentuk permintaan Anthropic untuk Edge Function estimasi foto.
 *
 * Edge Function berjalan di Deno dan tidak bisa diperiksa `tsc` proyek ini,
 * padahal bagian paling rawan salah justru bentuk permintaan API-nya. Berkas
 * ini menyusun permintaan yang SAMA memakai tipe SDK resmi, jadi salah nama
 * field atau salah bentuk ketahuan saat `npm run cek:edge`.
 *
 * Tidak pernah ikut ter-bundle ke aplikasi dan tidak memanggil API sungguhan.
 */
import type Anthropic from '@anthropic-ai/sdk';

const SKEMA_HASIL = {
  type: 'object' as const,
  properties: {
    nama_makanan: { type: 'string' },
    kalori: { type: 'integer' },
    protein_g: { type: 'number' },
    lemak_g: { type: 'number' },
    karbo_g: { type: 'number' },
    sat_fat_g: { type: 'number' },
    keyakinan: { type: 'string', enum: ['rendah', 'sedang', 'tinggi'] },
    catatan: { type: 'string' },
  },
  required: [
    'nama_makanan', 'kalori', 'protein_g', 'lemak_g',
    'karbo_g', 'sat_fat_g', 'keyakinan', 'catatan',
  ],
  additionalProperties: false,
};

/** Bentuk permintaan yang dipakai index.ts, diketik dengan tipe SDK. */
export const permintaan: Anthropic.MessageCreateParamsNonStreaming = {
  model: 'claude-opus-5',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  output_config: { effort: 'medium' },
  system: 'Anda menaksir kandungan gizi makanan dari foto.',
  tools: [
    {
      name: 'catat_estimasi_makanan',
      description: 'Catat hasil taksiran gizi untuk makanan pada foto.',
      input_schema: SKEMA_HASIL,
      strict: true,
    },
  ],
  tool_choice: { type: 'auto' },
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' },
        },
        { type: 'text', text: 'Taksir kandungan gizi makanan pada foto ini.' },
      ],
    },
  ],
};

/** Pembacaan respons yang dipakai index.ts, diketik dengan tipe SDK. */
export function bacaRespons(respons: Anthropic.Message) {
  if (respons.stop_reason === 'refusal') return null;

  const blokTool = respons.content.find((b) => b.type === 'tool_use');
  if (!blokTool || blokTool.type !== 'tool_use') return null;

  return {
    input: blokTool.input as Record<string, unknown>,
    pemakaian: {
      input: respons.usage.input_tokens,
      output: respons.usage.output_tokens,
    },
  };
}
