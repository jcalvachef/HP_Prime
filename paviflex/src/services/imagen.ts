/** Utilidades de imagen: carga, reducción y conversión. */

export const LADO_MAX_FOTO = 2000;

export async function cargarImagen(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((ok, err) => {
      img.onload = () => ok();
      img.onerror = () => err(new Error('No se pudo leer la imagen'));
      img.src = url;
    });
    return img;
  } finally {
    // La imagen ya está decodificada; liberar la URL no la invalida.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function lienzo(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function lienzoABlob(c: HTMLCanvasElement, tipo = 'image/jpeg', calidad = 0.85): Promise<Blob> {
  return new Promise((ok, err) =>
    c.toBlob((b) => (b ? ok(b) : err(new Error('No se pudo codificar la imagen'))), tipo, calidad),
  );
}

/** Reduce la fotografía a un lado máximo y la recodifica en JPEG (respeta la orientación EXIF). */
export async function normalizarFoto(original: Blob, ladoMax = LADO_MAX_FOTO): Promise<{ blob: Blob; w: number; h: number }> {
  const img = await cargarImagen(original);
  const f = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * f);
  const h = Math.round(img.naturalHeight * f);
  const c = lienzo(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return { blob: await lienzoABlob(c, 'image/jpeg', 0.88), w, h };
}

export function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, err) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.onerror = () => err(r.error ?? new Error('Error de lectura'));
    r.readAsDataURL(blob);
  });
}

export function dataUrlABytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64ABlob(b64: string, tipo: string): Blob {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: tipo });
}
