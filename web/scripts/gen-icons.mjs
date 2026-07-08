import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url));
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  await sharp(svg).resize(size, size).png().toFile(new URL(`../public/icons/${name}`, import.meta.url).pathname);
  console.log('wrote', name);
}
