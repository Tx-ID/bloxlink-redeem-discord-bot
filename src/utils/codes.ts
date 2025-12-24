import csvParser from "csv-parser";
import fs from 'fs';
import * as readline from 'readline';
import config from "../config";

const mainDir = config.CODES_FOLDERNAME;

export const CODE_TYPES: Record<number, string> = config.CODE_TYPES;

const availableCodeTypes = Object.keys(CODE_TYPES).map(Number);

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

export function getCodeLabel(amount: number): string {
    return CODE_TYPES[amount] || `Rp ${new Intl.NumberFormat("id").format(amount)} Unknown Reward`;
}