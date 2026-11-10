import type { Part } from 'firebase/ai';

/**
 * Normalise any photo (HEIC from iPhone camera, WebP, huge JPEG) into a downscaled JPEG.
 * On-device inference only accepts PNG/JPEG and has a ~9k token budget, so smaller is better.
 */
export async function fileToJpegPart(file: Blob, maxSide = 1400): Promise<{ part: Part; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return { part: { type: 'inlineData', inlineData: { data: dataUrl.split(',')[1], mimeType: 'image/jpeg' } }, dataUrl };
}
