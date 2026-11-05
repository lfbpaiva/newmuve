const sharp = require("sharp");
const path = require("node:path");

const assets = path.resolve(__dirname, "..", "assets");
const logo = path.join(assets, "logo.png");
const PURPLE = "#8b6bff";

async function whiteVersion() {
  const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) data[i] = data[i + 1] = data[i + 2] = 255;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

function onPurple(mark, size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: PURPLE } })
    .composite([{ input: mark, gravity: "centre" }])
    .png();
}

(async () => {
  const trimmed = await sharp(logo).trim().png().toBuffer();
  const white = await sharp(await whiteVersion()).trim().png().toBuffer();

  await sharp(white).toFile(path.join(assets, "logo-branca.png"));
  await onPurple(await sharp(white).resize({ width: 720, height: 420, fit: "inside" }).toBuffer(), 1024).toFile(path.join(assets, "icon.png"));
  await onPurple(await sharp(white).resize({ width: 560, height: 330, fit: "inside" }).toBuffer(), 1024).toFile(path.join(assets, "adaptive-icon.png"));
  await sharp(trimmed).resize({ width: 600, fit: "inside" }).png().toFile(path.join(assets, "splash-icon.png"));

  console.log("ícones gerados em mobile/assets");
})();
