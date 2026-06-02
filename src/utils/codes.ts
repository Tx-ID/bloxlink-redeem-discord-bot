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

    // Lazada's {amount}.csv files use the semicolon-delimited format with a
    // header row, where the redeem code is the `displayCode` column. Every
    // other server uses plain one-code-per-line files.
    const useDelimited = server.name === "LAZADA";

    await Promise.all(amounts.map(async (n) => {
        const file = `${server.codesFoldername}/${String(n)}.csv`;
        try {
            const list = useDelimited
                ? (await readDelimitedCodeRows(file)).map(row => row.displayCode)
                : await readLines(file);
            result.set(n, list);
        } catch (err) {
            console.warn(`[Codes:${server.name}]: Could not read ${file}`, err);
            result.set(n, []);
        }
    }));

    return result;
}

// =============================================
// Delimited (header) CSV support
// =============================================
// Some events (e.g. Lazada) ship their {amount}.csv files as a semicolon-
// delimited CSV with a header row instead of one raw code per line:
//   displayCode;validFrom;validTo;status;discountAmount;Minimum Spend;usageLimitPerCode
// The redeem code is the `displayCode` column; the file is still keyed by the
// amount in its filename, so the rest of the system works unchanged.

/** One parsed row of a delimited voucher CSV. */
export interface DelimitedCodeRow {
    displayCode: string;
    validFrom: string;
    validTo: string;
    status: string;
    discountAmount: number;
    minimumSpend: string;
    usageLimitPerCode: string;
}

/** Parse a possibly currency-formatted amount ("50000", "50000.00", "Rp 50.000") to a number. */
function parseAmount(raw: string): number {
    const trimmed = raw.trim();
    const direct = Number(trimmed);
    if (trimmed !== "" && Number.isFinite(direct)) return direct;
    const digits = trimmed.replace(/[^\d]/g, "");
    return digits ? Number(digits) : 0;
}

/**
 * Parse a semicolon-delimited voucher CSV that has a header row into structured
 * rows. Rows without a `displayCode` are skipped.
 */
export function readDelimitedCodeRows(filename: string): Promise<DelimitedCodeRow[]> {
    const rows: DelimitedCodeRow[] = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filename, { encoding: "utf-8" })
            .pipe(csvParser({
                separator: ";",
                // Strip a leading UTF-8 BOM off the first header and trim names.
                mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "").trim(),
            }))
            .on("data", (row: Record<string, string>) => {
                const displayCode = (row.displayCode ?? "").trim();
                if (!displayCode) return;
                rows.push({
                    displayCode,
                    validFrom: (row.validFrom ?? "").trim(),
                    validTo: (row.validTo ?? "").trim(),
                    status: (row.status ?? "").trim(),
                    discountAmount: parseAmount(row.discountAmount ?? ""),
                    minimumSpend: (row["Minimum Spend"] ?? "").trim(),
                    usageLimitPerCode: (row.usageLimitPerCode ?? "").trim(),
                });
            })
            .on("end", () => resolve(rows))
            .on("error", reject);
    });
}

/**
 * Get the display label for an amount within a specific reward server.
 */
export function getServerCodeLabel(server: RewardServerConfig, amount: number): string {
    return server.codeTypes[amount] || `Rp ${new Intl.NumberFormat("id").format(amount)} Unknown Reward`;
}
