import { JSONFilePreset } from 'lowdb/node';
import type { Low } from 'lowdb';
import fs from 'fs/promises';

import config from "./config";
import { readCodes } from './codes';
import path from 'path';
const codesByAmount = readCodes();

// --- Type Definitions (Unchanged) ---
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

// --- Database Singleton Instance ---
let db: Low<Data>;

/**
 * Ensures the database has been initialized before attempting to access it.
 */
function ensureDbInitialized() {
    if (!db) {
        throw new Error("Database has not been initialized. Please call initializeDatabase() once at application startup.");
    }
}

/**
 * Initializes the database, loading it from file into memory.
 * This MUST be called once before any other db function is used.
 */
export async function initializeDatabase() {
    // Prevent re-initialization
    if (db) return;

    await fs.mkdir('dbs', { recursive: true });

    const defaultData: Data = { Eligibilities: [], Claims: [] };
    
    // JSONFilePreset reads the file on initialization or creates it with defaultData
    db = await JSONFilePreset<Data>(`dbs/${config.DB_FILENAME}`, defaultData);
    
    // db.data now holds the entire database content in memory.
    console.log("Database initialized and loaded into memory.");
};

export function getDB() {
    ensureDbInitialized();
    return db;
}


// --- Read Operations (Now Synchronous) ---

/**
 * Gets a user's eligibility list. (Synchronous)
 */
export function getUserIdEligibility(userId: number): number[] {
    ensureDbInitialized();
    const get = db.data.Eligibilities.find(userdata => userdata.UserId === userId);
    return get ? get.EligibleList : [];
}

/**
 * Gets a user's claim list. (Synchronous)
 */
export function getUserIdClaims(userId: number): ClaimData[] {
    ensureDbInitialized();
    const get = db.data.Claims.find(userdata => userdata.UserId === userId);
    return get ? get.ClaimList : [];
}

/**
 * Gets all codes that have been claimed. (Synchronous)
 */
export function getClaimedCodes(): string[] {
    ensureDbInitialized();
    const list: string[] = [];

    db.data.Claims.forEach((userdata) => {
        userdata.ClaimList.forEach(data => list.push(data.CodeUsed));
    });
    return list;
}

/**
 * Gets a map of all unclaimed codes, organized by amount. (Synchronous)
 */
export function getUnclaimedCodesByAmount(): Map<number, string[]> {
    ensureDbInitialized();
    const claimed = getClaimedCodes(); // This call is now synchronous
    const unclaimed = new Map<number, string[]>();

    codesByAmount.entries().forEach(([amount, codes]) => {
        const list = codes.filter((code) => !claimed.includes(code));
        unclaimed.set(amount, list);
    });
    return unclaimed;
}


// --- Write Operations (Remain Asynchronous) ---

/**
 * Adds an amount to a user's eligibility list. (Asynchronous)
 */
export async function setUserIdEligible(userId: number, amount: number) {
    ensureDbInitialized();

    let userEligibility = db.data.Eligibilities.find(user => user.UserId === userId);

    if (userEligibility) {
        // User exists, add amount if it's not already there
        if (!userEligibility.EligibleList.includes(amount)) {
            userEligibility.EligibleList.push(amount);
        } else {
            // Already eligible, no write needed
            return;
        }
    } else {
        // New user, create entry
        db.data.Eligibilities.push({
            UserId: userId,
            EligibleList: [amount]
        });
    }

    // Persist the in-memory change to the file
    await db.write();
}

/**
 * Removes a user or specific amounts from the eligibility list. (Asynchronous)
 */
export async function removeUserIdFromEligible(userId: number, amounts: number[] | null) {
    ensureDbInitialized();

    const index = db.data.Eligibilities.findIndex(value => value.UserId === userId);
    if (index === -1) {
        return false; // User not found
    }

    if (amounts) {
        // Filter out specific amounts
        const userEligibility = db.data.Eligibilities[index]!;
        userEligibility.EligibleList = userEligibility.EligibleList.filter(
            (v) => !amounts.includes(v)
        );
    } else {
        // Remove the entire user record
        db.data.Eligibilities.splice(index, 1);
    }

    await db.write();
    return true;
}

/**
 * Adds a new claim record for a user. (Asynchronous)
 */
export async function addClaimData(userId: number, Amount: number, Code: string) {
    ensureDbInitialized();

    let userClaims = db.data.Claims.find(user => user.UserId === userId);

    if (!userClaims) {
        // New user, create a claim entry for them
        userClaims = {
            UserId: userId,
            ClaimList: []
        };
        db.data.Claims.push(userClaims);
    }

    // Add the new claim to their list
    userClaims.ClaimList.push({
        UserId: userId,
        Timestamp: Date.now(),
        Amount,
        CodeUsed: Code,
    });

    await db.write();
}

/**
 * Removes a user's claim data or specific claims by amount. (Asynchronous)
 */
export async function removeClaimData(userId: number, amounts: number[] | null) {
    ensureDbInitialized();

    const userClaimIndex = db.data.Claims.findIndex(claim => claim.UserId === userId);
    if (userClaimIndex === -1) {
        return false; // User not found
    }

    if (!amounts) {
        // Remove the entire user's claim history
        db.data.Claims.splice(userClaimIndex, 1);
    } else {
        // Filter out claims that match the amounts
        const userClaim = db.data.Claims[userClaimIndex]!;
        userClaim.ClaimList = userClaim.ClaimList.filter(
            claimEntry => !amounts.includes(claimEntry.Amount)
        );
    }
    
    await db.write();
    return true;
}