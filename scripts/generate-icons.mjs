// Generates the extension icons (rounded blue square + white chat bubble)
// into public/icon/{size}.png. Run: node scripts/generate-icons.mjs
import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 32, 48, 96, 128];
const BG = [9, 105, 218]; // #0969da
const FG = [255, 255, 255];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icon');
mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  writeFileSync(join(outDir, `${size}.png`), encodePng(drawIcon(size), size));
  console.log(`icon/${size}.png`);
}

/** Returns RGBA pixel buffer. Coverage is computed with 4x4 supersampling. */
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const S = 4; // supersamples per axis

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgCov = 0;
      let fgCov = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          // normalized [0,1] coords of the sample point
          const u = (x + (sx + 0.5) / S) / size;
          const v = (y + (sy + 0.5) / S) / size;
          if (inRoundedRect(u, v, 0.02, 0.02, 0.96, 0.96, 0.22)) {
            bgCov++;
            if (
              inRoundedRect(u, v, 0.22, 0.28, 0.56, 0.36, 0.09) ||
              inTriangle(u, v, [0.32, 0.6], [0.3, 0.76], [0.48, 0.6])
            ) {
              fgCov++;
            }
          }
        }
      }
      const total = S * S;
      const i = (y * size + x) * 4;
      const fgA = fgCov / total;
      const bgA = bgCov / total;
      // composite: fg over bg over transparent
      px[i] = FG[0] * fgA + BG[0] * (bgA - fgA);
      px[i + 1] = FG[1] * fgA + BG[1] * (bgA - fgA);
      px[i + 2] = FG[2] * fgA + BG[2] * (bgA - fgA);
      px[i + 3] = 255 * bgA;
    }
  }
  return px;
}

function inRoundedRect(u, v, x, y, w, h, r) {
  if (u < x || u > x + w || v < y || v > y + h) return false;
  const cx = Math.max(x + r, Math.min(u, x + w - r));
  const cy = Math.max(y + r, Math.min(v, y + h - r));
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r || (u >= x + r && u <= x + w - r) || (v >= y + r && v <= y + h - r);
}

function inTriangle(u, v, a, b, c) {
  const sign = (p1, p2, p3) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign([u, v], a, b);
  const d2 = sign([u, v], b, c);
  const d3 = sign([u, v], c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function encodePng(rgba, size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA

  // raw scanlines, each prefixed with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}
