// Prepara o áudio gravado no próprio navegador: converte para WAV mono 16 kHz.
// Cada navegador grava num formato (Chrome: WebM/Opus, Safari: MP4/AAC); o WAV é
// aceito pela IA em qualquer caso. O áudio vai só para a IA e nada é salvo no servidor.

const SAMPLE_RATE = 16_000;
export const MAX_AUDIO_SECONDS = 60;

export interface PreparedAudio {
  data: string; // base64 sem prefixo
  mimeType: 'audio/wav';
}

function toWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true); // tamanho do bloco fmt
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // bytes por segundo
  v.setUint16(32, 2, true); // bytes por amostra
  v.setUint16(34, 16, true); // bits por amostra
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function prepareVoiceAudio(blob: Blob): Promise<PreparedAudio> {
  let decoded: AudioBuffer;
  try {
    // decodeAudioData já reamostra para a taxa do contexto (16 kHz).
    decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error('Não consegui processar o áudio. Tente gravar de novo.');
  }

  const length = Math.min(decoded.length, SAMPLE_RATE * MAX_AUDIO_SECONDS);
  const mono = new Float32Array(length);
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / decoded.numberOfChannels;
  }
  return { data: bufferToBase64(toWav(mono, SAMPLE_RATE)), mimeType: 'audio/wav' };
}
