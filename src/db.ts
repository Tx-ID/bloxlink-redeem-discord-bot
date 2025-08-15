import { JSONFilePreset } from 'lowdb/node';
import config from "./config";

type ClaimData = {
    UserId: number,
    Timestamp: number,
    Amount: number,
    CodeUsed: string,
};

type Data = {
    Eligibilities: Map<number, Map<number, boolean>>, // {[UserId]: {[Amount]: true}}
    Claims: Map<number, ClaimData[]>,
};

export async function getDB() {
    const defaultData: Data = {Eligibilities: new Map(), Claims: new Map()};
    const db = await JSONFilePreset<Data>(config.DB_FILENAME, defaultData);
    await db.read();
};