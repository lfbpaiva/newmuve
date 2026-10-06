// Gera os ícones do app e o favicon do site a partir da logo (public/logo.webp).
// Uso: node scripts/gerar-icones.cjs   (precisa de `npm install --no-save sharp`)
const sharp = require("sharp");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const logo = path.join(root, "public", "logo.webp");
const assets = path.join(root, "mobile", "assets");
const PURPLE = "#8b6bff";

async function whiteVersion() {
  const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) data[i] = data[i + 1] = data[i + 2] = 255;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

(async () => {
  const trimmed = await sharp(logo).trim().png().toBuffer();
  const white = await sharp(await whiteVersion()).trim().png().toBuffer();

  // Logo para as telas (recortada) e versão branca para fundos coloridos.
  await sharp(trimmed).toFile(path.join(assets, "logo.png"));
  await sharp(white).toFile(path.join(assets, "logo-branca.png"));

  // Ícone 1024x1024: logo branca sobre o roxo da marca.
  const mark = await sharp(white).resize({ width: 720, height: 420, fit: "inside" }).toBuffer();
  const icon = (size, markWidth) =>
    sharp({ create: { width: size, height: size, channels: 4, background: PURPLE } })
      .composite([{ input: mark, gravity: "centre" }])
      .resize(size, size)
      .png();
  await icon(1024).toFile(path.join(assets, "icon.png"));
  // Adaptive icon (Android): o sistema recorta as bordas, então a marca fica menor.
  const smallMark = await sharp(white).resize({ width: 560, height: 330, fit: "inside" }).toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: PURPLE } })
    .composite([{ input: smallMark, gravity: "centre" }])
    .png()
    .toFile(path.join(assets, "adaptive-icon.png"));
  // Splash: logo roxa sobre o fundo escuro do app.
  await sharp(trimmed).resize({ width: 600, fit: "inside" }).png().toFile(path.join(assets, "splash-icon.png"));

  // Favicon do site.
  await sharp({ create: { width: 256, height: 256, channels: 4, background: PURPLE } })
    .composite([{ input: await sharp(white).resize({ width: 190, height: 110, fit: "inside" }).toBuffer(), gravity: "centre" }])
    .png()
    .toFile(path.join(root, "public", "favicon.png"));

  console.log("ícones gerados em mobile/assets e public/favicon.png");
})();
