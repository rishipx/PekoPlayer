// Generates the app icons from the transparent master in branding/icon.png: PNGs for the web app (public/icons) and the
// Windows icon for the desktop build (desktop/build/icon.ico). Run with `npm run icons`; the outputs are committed.
import fs from 'node:fs';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(dirname(fileURLToPath(import.meta.url)), '..');
const master = path.join(root, 'branding', 'icon.png');
const out = path.join(root, 'public', 'icons');
const PLATE = '#FFF1E0'; // solid backdrop for icons that cannot be transparent (maskable, iOS)

// Transparent icon: the artwork scaled to `scale` of a square canvas.
async function transparent(size, scale, file) {
  const art = await sharp(master)
    .resize(Math.round(size * scale), Math.round(size * scale), { fit: 'contain' })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art }])
    .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
    .toFile(path.join(out, file));
}

// Opaque icon: the artwork centered on a solid plate. Maskable icons keep the artwork inside the 80% safe zone.
async function plated(size, scale, file) {
  const art = await sharp(master)
    .resize(Math.round(size * scale), Math.round(size * scale), { fit: 'contain' })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: PLATE } })
    .composite([{ input: art }])
    .flatten({ background: PLATE })
    .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
    .toFile(path.join(out, file));
}

fs.mkdirSync(out, { recursive: true });
await transparent(512, 1, 'icon-512.png');
await transparent(192, 1, 'icon-192.png');
await transparent(64, 1, 'icon-64.png');
await transparent(32, 1, 'favicon-32.png');
await plated(512, 0.66, 'icon-maskable-512.png');
await plated(180, 0.8, 'apple-touch-icon.png');

// Windows .ico: a directory of PNG-compressed images (supported since Windows Vista).
async function ico(file, sizes) {
  const images = await Promise.all(
    sizes.map((size) => sharp(master).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer()),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((size, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(images[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return entry;
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([header, ...entries, ...images]));
}
await ico(path.join(root, 'desktop', 'build', 'icon.ico'), [16, 24, 32, 48, 64, 128, 256]);
console.log('icons written to', out);
