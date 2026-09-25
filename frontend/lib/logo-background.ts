import { PNG } from "pngjs";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Remove only a near-white background connected to the image edges.
// Enclosed white brand details and already transparent logos stay intact.
export async function transparentLogo(input: Buffer): Promise<Buffer> {
  const { env } = getCloudflareContext();
  if (!env.IMAGES) throw new Error("Image processor unavailable");
  const transformed = await env.IMAGES.input(new Response(new Uint8Array(input)).body!)
    .transform({ width: 128, height: 128, fit: "scale-down" })
    .output({ format: "image/png" });
  const png = PNG.sync.read(await readLogo(transformed.response()));
  const { data, width, height } = png;
  const original = Buffer.from(data);
  const white = (pixel: number) => {
    const i = pixel * 4;
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    return min >= 225 && max - min <= 24 && data[i + 3] >= 200;
  };
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  if (corners.filter(white).length >= 2) {
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;
    const enqueue = (pixel: number) => {
      if (!visited[pixel] && (white(pixel) || data[pixel * 4 + 3] <= 10)) {
        visited[pixel] = 1;
        queue[tail++] = pixel;
      }
    };
    for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
    while (head < tail) {
      const pixel = queue[head++];
      data[pixel * 4 + 3] = 0;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x > 0) enqueue(pixel - 1);
      if (x + 1 < width) enqueue(pixel + 1);
      if (y > 0) enqueue(pixel - width);
      if (y + 1 < height) enqueue(pixel + width);
    }
    // Avoid erasing an entirely white mark.
    if (!data.some((value, index) => index % 4 === 3 && value > 0)) original.copy(data);
  }
  return PNG.sync.write(png);
}

export async function readLogo(response: Response): Promise<Buffer> {
  const limit = 2 * 1024 * 1024;
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > limit) throw new Error("Logo unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) { await reader.cancel(); throw new Error("Logo too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
