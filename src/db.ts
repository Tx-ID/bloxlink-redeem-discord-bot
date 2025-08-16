import { JSONFilePreset } from 'lowdb/node';
import type { Low } from 'lowdb';
import config from "./config";
import { readCodes } from './codes';
const codesByAmount = readCodes();

type ClaimData = {
    UserId: number,
    Timestamp: number,
    Amount: number,
    CodeUsed: string,
};

type Data = {
    Eligibilities: Map<number, Map<number, boolean>>, // {[UserId]: {[Amount]: true}}
    Claims: Map<number, ClaimData[]>, // {[UserId]: ClaimData[]}
};

let db: Low<Data>

export async function getDB() {
    if (!db) {
        const defaultData: Data = {Eligibilities: new Map(), Claims: new Map()};
        db = await JSONFilePreset<Data>(config.DB_FILENAME, defaultData);
        await db.read();
    }
    return db;
};

export async function getUserIdEligibility(userId: number) {
    const db = await getDB();
    const get = db.data.Eligibilities.get(userId)
    return get ? get.keys().toArray() : [];
}

export async function getUserIdClaims(userId: number) {
    const db = await getDB();
    return db.data.Claims.get(userId) ?? [];
}

export async function getClaimedCodes() {
    const db = await getDB();
    const list: string[] = [];

    db.data.Claims.values().forEach((datas) => {
        datas.forEach(data => list.push(data.CodeUsed));
    });
    return list;
}

export async function getUnclaimedCodesByAmount() {
    const claimed = await getClaimedCodes();
    const unclaimed = new Map<number, string[]>();

    codesByAmount.entries().forEach(([amount, codes]) => {
        const list = codes.filter((code) => !claimed.includes(code));
        unclaimed.set(amount, list);
    });
    return unclaimed;
}