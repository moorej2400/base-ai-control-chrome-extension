// Minimal, dependency-free PNG renderer for the screenshot scenario.
//
// It rasterizes a short numeric token into a PNG using a tiny 5x7 bitmap font.
// The point: the token exists ONLY as pixels in a server-rendered image — it is
// nowhere in the page DOM or JS source — so the agent can read it only by taking
// a screenshot and using vision. That makes the screenshot scenario a genuine
// test of the vision path (the agent cannot shortcut via evaluate_script).
import { deflateSync } from 'node:zlib';

// 5 wide x 7 tall glyphs for digits 0-9 ('1' = lit pixel).
const FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/** Render `token` (digits) to a PNG Buffer: light glyphs on a dark background. */
export function renderTokenPng(token) {
  const S = 20, pad = 28, gap = 18, CW = 5, CH = 7;
  const gW = CW * S, gH = CH * S;
  const width = pad * 2 + token.length * gW + (token.length - 1) * gap;
  const height = pad * 2 + gH;
  const bg = [43, 43, 64], fg = [124, 214, 255];

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = bg[0]; rgba[i * 4 + 1] = bg[1]; rgba[i * 4 + 2] = bg[2]; rgba[i * 4 + 3] = 255;
  }
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 4;
    rgba[o] = fg[0]; rgba[o + 1] = fg[1]; rgba[o + 2] = fg[2]; rgba[o + 3] = 255;
  };
  let cx = pad;
  for (const chr of token) {
    const g = FONT[chr];
    if (g) for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) {
      if (g[r][c] === '1') for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) set(cx + c * S + sx, pad + r * S + sy);
    }
    cx += gW + gap;
  }

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  const idat = deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
