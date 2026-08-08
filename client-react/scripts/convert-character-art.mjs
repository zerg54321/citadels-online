import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, '..', 'src', 'assets', 'characters');

const TARGET_W = 560;
const TARGET_H = 784;
const QUALITY = 80;

const NAMES = [
  'assassin', 'thief', 'magician', 'king',
  'bishop', 'merchant', 'architect', 'warlord',
];

let total = 0;

for (const name of NAMES) {
  const src = resolve(ASSETS, `${name}.jpg`);
  const dst = resolve(ASSETS, `${name}.webp`);

  const info = await sharp(src)
    .resize(TARGET_W, TARGET_H, { fit: 'cover', position: 'attention' })
    .webp({ quality: QUALITY })
    .toFile(dst);

  total += info.size;
  console.log(`${name}: ${info.width}x${info.height} ${(info.size / 1024).toFixed(1)}KB`);
}

console.log(`\nTotal: ${(total / 1024).toFixed(1)}KB (${(total / 1024 / 1024).toFixed(2)}MB)`);
console.log(total < 1_500_000 ? 'PASS (<1.5MB)' : 'FAIL (>=1.5MB)');
