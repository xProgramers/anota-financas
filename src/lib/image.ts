// Prepara a foto do comprovante no próprio navegador: reduz e converte para JPEG.
// O arquivo original nunca sai do aparelho; só a versão reduzida vai para a IA,
// e nada é salvo no servidor.

const MAX_SIDE = 1600;
const MAX_BASE64 = 3_500_000;

export interface PreparedImage {
  data: string; // base64 sem prefixo
  mimeType: 'image/jpeg';
  previewUrl: string; // URL local (object URL) só para mostrar a miniatura
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* cai para <img> (ex.: HEIC no Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao processar a imagem'))), 'image/jpeg', quality),
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function prepareReceiptImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Essa imagem é grande demais.');

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new Error('Não consegui abrir essa imagem. Tente tirar a foto de novo.');
  }

  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  let scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.');

  for (let attempt = 0; attempt < 4; attempt++) {
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, 0.82 - attempt * 0.1);
    const data = await blobToBase64(blob);
    if (data.length <= MAX_BASE64) {
      if ('close' in source) source.close();
      canvas.width = canvas.height = 0;
      return { data, mimeType: 'image/jpeg', previewUrl: URL.createObjectURL(blob) };
    }
    scale *= 0.75;
  }
  throw new Error('Não consegui reduzir essa imagem. Tente outra foto.');
}
