// file: exeIcoExtractor.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats from "src/CommonFormats.ts";

function read_lendian4(b1: number, b2: number, b3: number, b4: number): number {
    return b1 + (b2*16*16) + (b3*16*16*16) + (b4*16*16*16*16);
}

class exeIcoExtractorHandler implements FormatHandler {

    public name: string = "exeIcoExtractor";
    public supportedFormats?: FileFormat[];
    public ready: boolean = false;

    #canvas?: HTMLCanvasElement;
    #ctx?: CanvasRenderingContext2D;
    
    async init () {
        this.supportedFormats = [
            CommonFormats.EXE.supported("exe", true, false),
            CommonFormats.ICO.supported("ico", false, true),
        ];
        this.ready = true;
    }

    async doConvert (
        inputFiles: FileData[],
        inputFormat: FileFormat,
        outputFormat: FileFormat
    ): Promise<FileData[]> {
        const outputFiles: FileData[] = [];
        
        if (inputFormat.internal === "exe" && outputFormat.internal === "ico") {
            for (const file of inputFiles) {
                let i = 0;
                
                // Find embedded ICO data
                while (i+6+11 < file.bytes.length) {
                    if (file.bytes[i] === 0x00 && file.bytes[i+1] === 0x00 && file.bytes[i+2] === 0x01 && file.bytes[i+3] === 0x00 && !(file.bytes[i+4] === 0x00 && file.bytes[i+5] === 0x00) && file.bytes[i+6] !== 0x00 && file.bytes[i+6+1] !== 0x00 && file.bytes[i+6+3] === 0x00 && (file.bytes[i+6+4] === 0x00 || file.bytes[i+6+4] === 0x01) && file.bytes[i+6+5] === 0x00) {
                        let BytesInRes = read_lendian4(file.bytes[i+6+8],file.bytes[i+6+9],file.bytes[i+6+10],file.bytes[i+6+11]);
                        
                        if (BytesInRes === 0) {
                            continue;
                        }
                        
                        if (i+6+14+BytesInRes > file.bytes.length) {
                            break;
                        }
                    
                        console.log("Found potential ICO data at ",i);
                        
                        outputFiles.push({bytes: new Uint8Array(file.bytes.subarray(i,i+6+14+BytesInRes)), name: i + ".ico"})
                    }
                    i += 1;
                }
            }
        }
        else {
            throw new Error("Invalid input-output.");
        }
        
        return outputFiles;
    }
}

export default exeIcoExtractorHandler;