import {
  initializeImageMagick,
  Magick,
  ImageMagick,
  MagickFormat
} from "/node_modules/@imagemagick/magick-wasm/dist/index.js";

import mime from "/node_modules/mime/dist/src/index.js";

let supportedFormats = [];

async function init () {

  const response = await fetch("/node_modules/@imagemagick/magick-wasm/dist/magick.wasm");
  const bytes = await response.arrayBuffer();
  await initializeImageMagick(bytes);

  for (const format of Magick.supportedFormats) {
    supportedFormats.push({
      name: format.description,
      format: format.format,
      extension: mime.getExtension(format.mimeType) ||
        format.mimeType?.split("/")?.pop() ||
        format.format,
      mime: format.mimeType,
      from: format.supportsReading,
      to: format.supportsWriting,
      internal: format.moduleFormat,
    });
  }

}

async function doConvert (inputFile, inputFormat, outputFormat) {

  const inputBuffer = await inputFile.arrayBuffer();
  const inputBytes = new Uint8Array(inputBuffer);

  return await new Promise((resolve, reject) => {
    ImageMagick.read(inputBytes, image => {
      image.write(outputFormat.internal, resolve);
    });
  });

}

export default {
  init,
  supportedFormats,
  doConvert
};
