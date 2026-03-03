import mongoose, { model, Schema } from "mongoose";

import config from "../config";
import { readCodes } from "../utils/codes";
const codesByAmount = readCodes();

interface IClaimData {
    Timestamp: number;
    Amount: number;
    CodeUsed: string;
}
interface IClaimUser {
    UserId: number;
    ClaimList: IClaimData[];
}
interface IEligibilityUser {
    UserId: number;
    EligibleList: number[];
}

const ClaimDataSchema = new Schema<IClaimData>({
    Timestamp: { type: Number, required: true, default: Date.now },
    Amount: { type: Number, required: true },
    CodeUsed: { type: String, required: true, index: true },
}, { _id: false });

const ClaimUserSchema = new Schema<IClaimUser>({
    UserId: { type: Number, required: true, unique: true, index: true },
    ClaimList: { type: [ClaimDataSchema], default: [] },
});

const EligibilityUserSchema = new Schema<IEligibilityUser>({
    UserId: { type: Number, required: true, unique: true, index: true },
    EligibleList: { type: [Number], default: [] },
});

export const EligibilityModel = model<IEligibilityUser>(
    "Eligibility",
    EligibilityUserSchema,
);
export const ClaimModel = model<IClaimUser>("Claim", ClaimUserSchema);

export async function initializeDatabase() {
    if (mongoose.connection.readyState >= 1) {
        console.log("Database connection already established.");
        return;
    }

    try {
        await mongoose.connect(config.MONGO_CONNECTION_URL);
        console.log("Database connected successfully.");
    } catch (error) {
        console.error("Database connection failed:", error);
        process.exit(1);
    }
}

/**
 * Gets a user's eligibility list. (Asynchronous)
 * @returns {Promise<number[]>} A promise resolving to the user's list or an empty array.
 */
export async function getUserIdEligibility(userId: number): Promise<number[]> {
    const userEligibility = await EligibilityModel.findOne({ UserId: userId })
        .lean();
    return userEligibility ? userEligibility.EligibleList : [];
}

/**
 * Gets a user's claim list. (Asynchronous)
 * @returns {Promise<IClaimData[]>} A promise resolving to the user's claims or an empty array.
 */
export async function getUserIdClaims(userId: number): Promise<IClaimData[]> {
    const userClaims = await ClaimModel.findOne({ UserId: userId }).lean();
    return userClaims ? userClaims.ClaimList : [];
}

/**
 * Gets all codes that have been claimed. (Asynchronous)
 * @returns {Promise<Set<string>>} A promise resolving to a Set of all claimed codes.
 */
export async function getClaimedCodes(): Promise<Set<string>> {
    const claims = await ClaimModel.find({}, "ClaimList.CodeUsed").lean();
    const claimedSet = new Set<string>();
    
    for (const user of claims) {
        if (user.ClaimList) {
            for (const claim of user.ClaimList) {
                claimedSet.add(claim.CodeUsed);
            }
        }
    }
    return claimedSet;
}

/**
 * Count eligible users for a specific amount.
 */
export async function countEligibleUsersByAmount(amount: number): Promise<number> {
    const result = await EligibilityModel.countDocuments({
        EligibleList: amount
    });
    return result;
}

/**
 * Count eligible users without claims for a specific amount.
 * These are users who are eligible but haven't claimed yet.
 */
export async function countEligibleUsersWithoutClaimsByAmount(amount: number): Promise<number> {
    // Find users who are eligible for this amount
    const eligibleUsers = await EligibilityModel.find({
        EligibleList: amount
    }, { UserId: 1 }).lean();
    
    if (eligibleUsers.length === 0) return 0;
    
    const eligibleUserIds = eligibleUsers.map(u => u.UserId);
    
    // Find which of these users already have claims for this amount
    const usersWithClaims = await ClaimModel.find({
        UserId: { $in: eligibleUserIds },
        "ClaimList.Amount": amount
    }, { UserId: 1 }).lean();
    
    const usersWithClaimsSet = new Set(usersWithClaims.map(u => u.UserId));
    
    // Count eligible users without claims
    return eligibleUserIds.filter(userId => !usersWithClaimsSet.has(userId)).length;
}

/**
 * Gets a random unclaimed code for a specific amount.
 * Checks against the database to ensure it hasn't been used.
 * Now also considers eligible users who haven't claimed yet to prevent over-allocation.
 */
export async function getRandomUnclaimedCode(amount: number): Promise<string | undefined> {
    const allCodesMap = await codesByAmount;
    const codes = allCodesMap.get(amount);
    
    if (!codes || codes.length === 0) return undefined;

    // Count eligible users without claims for this amount
    const eligibleWithoutClaims = await countEligibleUsersWithoutClaimsByAmount(amount);
    
    // Get claimed codes
    const claimedSet = await getClaimedCodes();
    
    // Calculate available codes (total - claimed - eligible without claims)
    const availableCodes = codes.filter(c => !claimedSet.has(c));
    const actuallyAvailable = availableCodes.length - eligibleWithoutClaims;
    
    if (actuallyAvailable <= 0) {
        return undefined; // No codes available after accounting for eligible users
    }

    // Try up to 10 times to find a random code that isn't in the DB
    for (let i = 0; i < 10; i++) {
        const randomIndex = Math.floor(Math.random() * availableCodes.length);
        const code = availableCodes[randomIndex];
        
        // Check if this specific code has been used (should already be filtered, but double-check)
        const exists = await ClaimModel.exists({ "ClaimList.CodeUsed": code });
        if (!exists) {
            return code;
        }
    }

    // Fallback: If we fail 10 times, return a random available code
    if (availableCodes.length === 0) return undefined;
    return availableCodes[Math.floor(Math.random() * availableCodes.length)];
}

/**
 * Gets a map of all unclaimed codes, organized by amount. (Asynchronous)
 * @returns {Promise<Map<number, string[]>>} A promise resolving to the map.
 */
export async function getUnclaimedCodesByAmount(): Promise<
    Map<number, string[]>
> {
    const codes = await codesByAmount;
    const claimedSet = await getClaimedCodes();
    const unclaimed = new Map<number, string[]>();

    codes.forEach((list, amount) => {
        const filtered = list.filter((code) => !claimedSet.has(code));
        unclaimed.set(amount, filtered);
    });
    return unclaimed;
}

/**
 * Adds an amount to a user's eligibility list. (Asynchronous)
 * This operation is now atomic and idempotent.
 */
export async function setUserIdEligible(
    userId: number,
    amount: number,
): Promise<void> {
    await EligibilityModel.updateOne(
        { UserId: userId },
        { $addToSet: { EligibleList: amount } },
        { upsert: true },
    );
}

/**
 * Removes a user or specific amounts from the eligibility list. (Asynchronous)
 * @returns {Promise<boolean>} A promise resolving to true if a record was found and modified/deleted.
 */
export async function removeUserIdFromEligible(
    userId: number,
    amounts: number[] | null,
): Promise<boolean> {
    if (amounts) {
        const result = await EligibilityModel.updateOne(
            { UserId: userId },
            { $pullAll: { EligibleList: amounts } },
        );
        return result.matchedCount > 0;
    } else {
        // Remove the entire user record
        const result = await EligibilityModel.deleteOne({ UserId: userId });
        return result.deletedCount > 0;
    }
}

/**
 * Adds a new claim record for a user. (Asynchronous)
 */
export async function addClaimData(
    userId: number,
    Amount: number,
    Code: string,
): Promise<void> {
    const newClaimData: IClaimData = {
        Timestamp: Date.now(),
        Amount,
        CodeUsed: Code,
    };
    await ClaimModel.updateOne(
        { UserId: userId },
        { $push: { ClaimList: newClaimData } },
        { upsert: true },
    );
}

/**
 * Removes a user's claim data or specific claims by amount. (Asynchronous)
 * @returns {Promise<boolean>} A promise resolving to true if a record was found and modified/deleted.
 */
export async function removeClaimData(
    userId: number,
    amounts: number[] | null,
): Promise<boolean> {
    if (!amounts) {
        const result = await ClaimModel.deleteOne({ UserId: userId });
        return result.deletedCount > 0;
    } else {
        const result = await ClaimModel.updateOne(
            { UserId: userId },
            { $pull: { ClaimList: { Amount: { $in: amounts } } } },
        );
        return result.matchedCount > 0;
    }
}

/**
 * Resets only the Claim collection while keeping Eligibility intact.
 * (Asynchronous)
 */
export async function resetClaimedCodes(): Promise<number> {
    const result = await ClaimModel.deleteMany({});
    return result.deletedCount;
}

/**
 * Resets the entire database by clearing both Eligibility and Claim collections.
 * (Asynchronous)
 */
export async function resetDatabase(): Promise<void> {
    await Promise.all([
        EligibilityModel.deleteMany({}),
        ClaimModel.deleteMany({})
    ]);
}
