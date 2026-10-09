/** The {r, g, b, a} of one pixel of a cached map tile, or null if the tile can't be read (missing or cross-origin). */
export async function tilePixel(url, px, py){
  try{
    const res = await fetch(url);
    if(!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const ctx = new OffscreenCanvas(256, 256).getContext("2d");
    ctx.drawImage(bitmap, 0, 0, 256, 256);
    const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
    return { r, g, b, a };
  }catch(err){
    return null;
  }
}
