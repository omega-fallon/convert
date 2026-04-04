// file: ota.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";

// Seeded random number generator by steveruizok on GitHub
function rng(seed = '') {
  let x = 0
  let y = 0
  let z = 0
  let w = 0

  function next() {
    const t = x ^ (x << 11)
    x = y
    y = z
    z = w
    w ^= ((w >>> 19) ^ t ^ (t >>> 8)) >>> 0
    return w / 0x100000000
  }

  for (var k = 0; k < seed.length + 64; k++) {
    x ^= seed.charCodeAt(k) | 0
    next()
  }

  return next()
}

class otaHandler implements FormatHandler {

    public name: string = "ota";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    #canvas?: HTMLCanvasElement;
    #ctx?: CanvasRenderingContext2D;

    async init () {
        this.supportedFormats = [
            CommonFormats.PNG.supported("png", true, true, true),
            {
                name: "Over The Air bitmap",
                format: "ota",
                extension: "otb",
                mime: "image/x-ota",
                from: true,
                to: true,
                internal: "ota",
                category: Category.IMAGE,
                lossless: false,
            },
        ];

        this.#canvas = document.createElement("canvas");
        this.#ctx = this.#canvas.getContext("2d") || undefined;

        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];
        
        if (!this.#canvas || !this.#ctx) {
            throw "Handler not initialized.";
        }
        
        if (inputFormat.internal === "ota" && outputFormat.mime === CommonFormats.PNG.mime) {
            for (const file of inputFiles) {
                let new_file_bytes = new Uint8Array(file.bytes);
            
                // Read header to get image size
                this.#canvas.width = new_file_bytes[1];
                this.#canvas.height = new_file_bytes[2];
                
                // Read each byte and write 8 pixels to screen per
                const rgba: number[] = []
                for (let i = 4; i < new_file_bytes.length; i++) {
                    for (let bit = 7; bit > -1; bit--) {
                        // Convert to binary and look at the bits.
                        if (new_file_bytes[i] & (1 << bit)) {
                            rgba.push(0x00, 0x00, 0x00, 0xFF);
                        }
                        else {
                            rgba.push(0xFF, 0xFF, 0xFF, 0xFF);
                        }
                        
                        if (rgba.length >= (this.#canvas.width*this.#canvas.height*4)) {
                            break;
                        }
                    }
                    
                    if (rgba.length >= (this.#canvas.width*this.#canvas.height*4)) {
                        break;
                    }
                }
                
                // Writes our results to the canvas
                const image_data = new ImageData(new Uint8ClampedArray(rgba), this.#canvas.width, this.#canvas.height);

                this.#ctx.putImageData(image_data, 0, 0);

                new_file_bytes = await new Promise((resolve, reject) => {
                    this.#canvas!.toBlob((blob) => {
                        if (!blob) return reject("Canvas output failed");
                        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
                    }, outputFormat.mime);
                });
                
                outputFiles.push({
                    name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension,
                    bytes: new_file_bytes
                })
            }
        }
        else if (inputFormat.mime === CommonFormats.PNG.mime && outputFormat.internal === "ota") {
            for (const file of inputFiles) {
                let writer_array: number[] = [];
                
                // Some code copied from mcmap.ts
                const blob = new Blob([file.bytes as BlobPart], { type: inputFormat.mime });

                const image = new Image();
                await new Promise((resolve, reject) => {
                    image.addEventListener("load", resolve);
                    image.addEventListener("error", reject);
                    image.src = URL.createObjectURL(blob);
                });

                if (image.naturalWidth > 0xFF || image.naturalHeight > 0xFF) {
                    if (image.naturalWidth > image.naturalHeight) {
                        this.#canvas.width = 0xFF;
                        this.#canvas.height = Math.floor(image.height*(0xFF/image.width));
                    }
                    else {
                        this.#canvas.width = Math.floor(image.width*(0xFF/image.height));
                        this.#canvas.height = 0xFF;
                    }
                    
                    // Safety for extreme proportions (t.w.s.s.)
                    if (this.#canvas.width < 1) {
                        this.#canvas.width = 1;
                    }
                    if (this.#canvas.height < 1) {
                        this.#canvas.height = 1;
                    }
                    
                    console.log("Image resized to "+this.#canvas.width+" "+this.#canvas.height);
                }
                else {
                    this.#canvas.width = image.width;
                    this.#canvas.height = image.height;
                }
                this.#ctx.drawImage(image, 0, 0, this.#canvas.width, this.#canvas.height);

                const pixels = this.#ctx.getImageData(0, 0, this.#canvas.width, this.#canvas.height);
                console.log("pixels.data:");
                console.log(pixels.data);

                // Start writing our .otb file, first with the header
                writer_array.push(0x00, this.#canvas.width, this.#canvas.height, 0x01);
                let bits = [];
                
                // Iterate through the image to find the average luminance
                //let average_luminance = 0;
                //for (let i = 0; i < pixels.data.length; i += 4) {
                //    average_luminance += pixels.data[i]*0.2126 + pixels.data[i+1]*0.7152 + pixels.data[i+2]*0.0722;
                //}
                //average_luminance /= pixels.data.length/4;
                
                // Iterate again to push bits
                for (let i = 0; i < pixels.data.length; i += 4) {
                    const absolute_radiance = 0xFF*0.2126 + 0xFF*0.7152 + 0xFF*0.0722;
                    const luminance = pixels.data[i]*0.2126 + pixels.data[i+1]*0.7152 + pixels.data[i+2]*0.0722;
                    
                    // Determine initial state of bit based on luminance threshold
                    let bit_to_push = 1
                    if (luminance >= 0.5*absolute_radiance) {
                        bit_to_push = 0;
                    }
                    
                    // Have a seeded random chance to flip the bit, weighed so that pixels closer to middle grey have a higher chance. This creates random noise that makes the image details come out clearer. Because it's seeded, the same input image will always have the same output image. In addition, the chances for pure black or white pixels being swapped is 0, so no noise is applied to an already black-and-white image.
                    const rng_result = rng(i.toString());
                    console.log("rng_result: "+rng_result);
                    if (Math.abs(rng_result) + 0.8 < 1 - Math.abs(luminance - 0.5*absolute_radiance)/(absolute_radiance)) {
                        if (bit_to_push === 0) {
                            bit_to_push = 1;
                        }
                        else if (bit_to_push === 1) {
                            bit_to_push = 0;
                        }
                    }
                    
                    bits.push(bit_to_push.toString());
                }
                console.log("bits (pre-padding):")
                console.log(bits);
                
                // Pad bits
                while (bits.length % 8 !== 0) {
                    bits.push("0");
                }
                
                // Finally, use the bits to write to our file's bytes
                for (let i = 0; i < bits.length; i += 8) {
                    const result: string = bits[i+0].concat(bits[i+1],bits[i+2],bits[i+3],bits[i+4],bits[i+5],bits[i+6],bits[i+7]);
                    
                    writer_array.push(parseInt(result,2));
                }
                
                outputFiles.push({
                    name: file.name.split(".").slice(0, -1).join(".") + "." + outputFormat.extension,
                    bytes: new Uint8Array(writer_array)
                })
            }
        }
        else {
            throw new Error("Invalid input-output.");
        }
    
        return outputFiles;
    }
}

export default otaHandler;
