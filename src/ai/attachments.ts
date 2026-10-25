import type { Attachment } from './generatePlan';

/** Longest image side sent to the model; larger images are scaled down first. */
const MAX_IMAGE_SIDE = 1568;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const ACCEPTED_FILES = [...IMAGE_TYPES, 'application/pdf'].join(',');

const toBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

async function downscale(file: File): Promise<{ data: string; mediaType: Attachment['mediaType'] } | undefined> {
  if (typeof createImageBitmap !== 'function') {
    return undefined;
  }
  const bitmap = await createImageBitmap(file);
  const ratio = MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height);
  if (ratio >= 1) {
    bitmap.close();
    return undefined;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return undefined;
  }
  // Plans are mostly line art on white; PNG keeps the lines crisp.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL('image/png');
  return { data: url.slice(url.indexOf(',') + 1), mediaType: 'image/png' };
}

/** Reads a dropped or picked file into something the model accepts, or throws a readable error. */
export async function readAttachment(file: File): Promise<Attachment> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error('PDF is larger than 20 MB. Export just the floor plan page.');
    }
    return { kind: 'pdf', mediaType: 'application/pdf', data: toBase64(await file.arrayBuffer()), name: file.name };
  }
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new Error('Use a PNG, JPEG, WebP, GIF or PDF file.');
  }
  const scaled = await downscale(file).catch(() => undefined);
  if (scaled) {
    return { kind: 'image', ...scaled, name: file.name };
  }
  return {
    kind: 'image',
    mediaType: file.type as Attachment['mediaType'],
    data: toBase64(await file.arrayBuffer()),
    name: file.name,
  };
}
