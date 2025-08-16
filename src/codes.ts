import csvParser from "csv-parser";
import fs from 'fs';
import config from "./config";

const availableCodeTypes = [5000, 10000, 50000, 100000];
const mainDir = config.CODES_FOLDERNAME;

function rawr(filename: any): Promise<string[]> {
    const results: any[] = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(`${mainDir}/${String(filename)}.csv`)
            .pipe(csvParser())
            .on('data', (data: {[x: string]: string}) => {
                results.push(Object.values(data)[0]);
            })
            .on('end', () => {
                // console.log(results[0], results[1]);
                resolve(results);
            });
    });
}

let compiled: Map<number, string[]>

export function readCodes() {
    if (!compiled) {
        compiled = new Map();
        availableCodeTypes.forEach(async (n) => {
            const list = await rawr(n);
            compiled.set(n, list);
        });
    }
    return compiled;
}