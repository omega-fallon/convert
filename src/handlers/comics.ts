// file: comics.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";
import JSZip from "jszip";

class comicsHandler implements FormatHandler {

    public name: string = "comics";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    async init () {
        this.supportedFormats = [
            CommonFormats.PNG.supported("png", true, false),
            CommonFormats.JPEG.supported("jpeg", true, false),
            CommonFormats.WEBP.supported("webp", true, false),
            CommonFormats.BMP.supported("bmp", true, false),
            CommonFormats.TIFF.supported("tiff", true, false),
            CommonFormats.GIF.supported("gif", true, false),
            
            CommonFormats.ZIP.supported("zip", false, true),
            {
                name: "Comic Book Archive (ZIP)",
                format: "cbz",
                extension: "cbz",
                mime: "application/vnd.comicbook+zip",
                from: false,
                to: true,
                internal: "cbz",
            },
        ];

        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];
        
        // Some code copied from wad.ts
        if ((inputFormat.internal === "png" || inputFormat.internal === "jpg" || inputFormat.internal === "webp" || inputFormat.internal === "bmp" || inputFormat.internal === "tiff" || inputFormat.internal === "gif") && (outputFormat.internal === "cbz" || outputFormat.internal === "zip")) {
            const zip = new JSZip();
            
            // Determine the archive name
            const baseName = inputFiles[0].name.replace("_0."+inputFormat.extension,"."+inputFormat.extension).split(".").slice(0, -1).join(".");
        
            // Add files to archive
            let iterations = 0;
            for (const file of inputFiles) {
                if (outputFormat.internal === "cbz") {
                    zip.file("Page "+String(iterations)+"."+inputFormat.extension, file.bytes);
                }
                else {
                    zip.file(file.name, file.bytes);
                }
                iterations += 1;
            }
            
            const output = await zip.generateAsync({ type: "uint8array" });
            outputFiles.push({ bytes: output, name: baseName + "." + outputFormat.extension });
        }
        else {
            throw new Error("Invalid input-output.");
        }
        
        return outputFiles;
    }
}

export default comicsHandler;