import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(root, "build");
const sizes = [16, 24, 32, 48, 64, 128, 256];
const iconSource = await readFile(path.join(root, "public", "icon.png"));

await mkdir(outputDirectory, { recursive: true });

const pngBuffers = await Promise.all(
  sizes.map(async (size) => {
    const output = path.join(outputDirectory, `icon-${size}.png`);
    const png = await sharp(iconSource).resize(size, size).png().toBuffer();
    await writeFile(output, png);
    return { size, png };
  })
);

await sharp(iconSource).resize(512, 512).png().toFile(path.join(outputDirectory, "icon.png"));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngBuffers.length, 4);

let offset = header.length + pngBuffers.length * 16;
const entries = pngBuffers.map(({ size, png }) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});

await writeFile(
  path.join(outputDirectory, "icon.ico"),
  Buffer.concat([header, ...entries, ...pngBuffers.map(({ png }) => png)])
);
