/**
 * Экспорт холста в PNG.
 */

import type { ProjectDocument } from '../core/project';
import { saveBinaryFile } from '../app/files';

export async function exportCanvasPNG(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<void> {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(canvas, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    tempCanvas.toBlob(resolve, 'image/png');
  });
  if (!blob) return;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await saveBinaryFile(`${filename}.png`, bytes, [{ name: 'PNG', extensions: ['png'] }]);
}

export function generateExportFilename(doc: ProjectDocument, ext: string): string {
  const safe = doc.name.replace(/[^a-z0-9а-яё ]/gi, '_').toLowerCase();
  return `vibe-${safe.slice(0, 30)}-${Date.now()}.${ext}`;
}
