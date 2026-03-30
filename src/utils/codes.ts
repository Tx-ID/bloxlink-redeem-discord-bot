import csvParser from "csv-parser";
import fs from 'fs';
import * as readline from 'readline';
import config from "../config";
import type { RewardServerConfig } from "../config/reward-servers";

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

// =============================================
// Dynamic per-server code loading
// =============================================

/** Cache: server name → Promise<Map<amount, codes[]>> */
const serverCodesCache = new Map<string, Promise<Map<number, string[]>>>();

/**
 * Read codes for a reward server config. Results are cached per server name.
 */
export function readServerCodes(server: RewardServerConfig): Promise<Map<number, string[]>> {
    const cached = serverCodesCache.get(server.name);
    if (cached) return cached;

    const promise = loadServerCodes(server);
    serverCodesCache.set(server.name, promise);
    return promise;
}

async function loadServerCodes(server: RewardServerConfig): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>();
    const amounts = Object.keys(server.codeTypes).map(Number);

    if (amounts.length === 0) return result;

    await Promise.all(amounts.map(async (n) => {
        try {
            const list = await readLines(`${server.codesFoldername}/${String(n)}.csv`);
            result.set(n, list);
        } catch (err) {
            console.warn(`[Codes:${server.name}]: Could not read ${server.codesFoldername}/${n}.csv`, err);
            result.set(n, []);
        }
    }));

    return result;
}

/**
 * Get the display label for an amount within a specific reward server.
 */
export function getServerCodeLabel(server: RewardServerConfig, amount: number): string {
    return server.codeTypes[amount] || `Rp ${new Intl.NumberFormat("id").format(amount)} Unknown Reward`;
}
