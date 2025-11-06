import mongoose, { model, Schema } from "mongoose";

import config from "./config";
import { readCodes } from "./codes";
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
 * @returns {Promise<string[]>} A promise resolving to a list of all claimed codes.
 */
export async function getClaimedCodes(): Promise<string[]> {
    const result = await ClaimModel.aggregate([
        { $unwind: "$ClaimList" },
        {
            $group: {
                _id: null,
                allCodes: { $push: "$ClaimList.CodeUsed" },
            },
        },
    ]);
    return result.length > 0 ? result[0].allCodes : [];
}

/**
 * Gets a map of all unclaimed codes, organized by amount. (Asynchronous)
 * @returns {Promise<Map<number, string[]>>} A promise resolving to the map.
 */
export async function getUnclaimedCodesByAmount(): Promise<
    Map<number, string[]>
> {
    const claimedList = await getClaimedCodes();
    const claimedSet = new Set(claimedList);
    const unclaimed = new Map<number, string[]>();

    codesByAmount.entries().forEach(([amount, codes]) => {
        const list = codes.filter((code) => !claimedSet.has(code));
        unclaimed.set(amount, list);
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
