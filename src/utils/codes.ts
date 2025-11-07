import csvParser from "csv-parser";
import fs from 'fs';
import * as readline from 'readline';
import config from "../config";

const availableCodeTypes = [5000, 10000];
const mainDir = config.CODES_FOLDERNAME;

function readLines(filename: string): Promise<string[]> {
    const results: string[] = [];
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filename, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: stream });
        rl.on('line', line => {
            if (line !== "" && line.trim() !== "")
                results.push(line);
        });
        rl.on('close', () => {
            resolve(results);
        });
        rl.on('error', err => reject(err));
    });
}

let compiled: Map<number, string[]>

export async function readCodes(): Promise<Map<number, string[]>> {
    if (!compiled) {
        compiled = new Map();
        await Promise.all(availableCodeTypes.map(async (n) => {
            const list = await readLines(`${mainDir}/${String(n)}.csv`);
            compiled.set(n, list);
        }));
    }
    return compiled;
}