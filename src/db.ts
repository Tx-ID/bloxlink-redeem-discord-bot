import { JSONFilePreset } from 'lowdb/node';
import type { Low } from 'lowdb';
import fs from 'fs/promises';

import config from "./config";
import { readCodes } from './codes';
import path from 'path';
const codesByAmount = readCodes();

type ClaimData = {
    UserId: number,
    Timestamp: number,
    Amount: number,
    CodeUsed: string,
};

type ElibilityUserData = {
    UserId: number,
    EligibleList: number[],
};

type ClaimUserData = {
    UserId: number,
    ClaimList: ClaimData[],
}

type Data = {
    Eligibilities: ElibilityUserData[],
    Claims: ClaimUserData[],
};

let db: Low<Data>

export async function getDB() {
    if (!db) {
        await fs.mkdir('dbs', {recursive: true});

        const defaultData: Data = {Eligibilities: [], Claims: []};
        db = await JSONFilePreset<Data>(`dbs/${config.DB_FILENAME}`, defaultData);
        await db.read();
    }
    return db;
};


//
export async function getUserIdEligibility(userId: number) {
    const db = await getDB();
    const get = db.data.Eligibilities.find(userdata => userdata.UserId === userId);
    return get ? get.EligibleList : [];
}

export async function getUserIdClaims(userId: number) {
    const db = await getDB();
    const get = db.data.Claims.find(userdata => userdata.UserId === userId);
    return get ? get.ClaimList : [];
}

export async function getClaimedCodes() {
    const db = await getDB();
    const list: string[] = [];

    db.data.Claims.forEach((userdata) => {
        userdata.ClaimList.forEach(data => list.push(data.CodeUsed));
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


//
export async function setUserIdEligible(userId: number, amount: number) {
    const db = await getDB();

    // const get_map = db.data.Eligibilities.get(String(userId)) ?? new Map();
    // get_map.set(amount, true);
    // db.data.Eligibilities.set(String(userId), get_map);

    let index
    let get = db.data.Eligibilities.find((value, i) => {
        const ok = value.UserId === userId;
        if (ok) {
            index = i - 1;
        }
        return ok;
    });
    if (get) {
        if (get.EligibleList.includes(amount))
            return;
    } else {
        get = {
            UserId: userId,
            EligibleList: []
        };
    }

    get.EligibleList.push(amount);
    if (index && get) {
        db.data.Eligibilities[index] = get;
    } else {
        db.data.Eligibilities.push(get);
    }
    await db.write();
}

export async function addClaimData(userId: number, Amount: number, Code: string) {
    const db = await getDB();

    // const get_list = db.data.Claims.get(String(userId)) ?? [];
    // get_list.push({
    //     UserId: userId,
    //     Timestamp: Date.now(),
    //     Amount,
    //     CodeUsed: Code,
    // });
    // db.data.Claims.set(String(userId), get_list);

    let index
    let get = db.data.Claims.find((value, i) => {
        const ok = value.UserId === userId;
        if (ok) {
            index = i - 1;
        }
        return ok;
    });
    if (get) {
        
    } else {
        get = {
            UserId: userId,
            ClaimList: []
        };
    }

    get.ClaimList.push({
        UserId: userId,
        Timestamp: Date.now(),
        Amount,
        CodeUsed: Code,
    });
    if (index && get) {
        db.data.Claims[index] = get;
    } else {
        db.data.Claims.push(get);
    }
    await db.write();
}