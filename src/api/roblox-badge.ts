import axios from "axios";
import { SimpleCache } from "../utils/cache";

const badgeCache = new SimpleCache();

/**
 * Check if a Roblox user has a specific badge.
 * Uses the Roblox Badges API: GET https://badges.roblox.com/v1/users/{userId}/badges/awarded-dates?badgeIds={badgeId}
 * @returns true if the user has the badge, false otherwise
 */
export async function doesUserHaveBadge(userId: string | number, badgeId: number): Promise<boolean> {
    const cacheKey = `${userId}_${badgeId}`;
    const cached = badgeCache.get(cacheKey);
    if (cached !== undefined) {
        return cached as boolean;
    }

    try {
        const response = await axios.get(
            `https://badges.roblox.com/v1/users/${userId}/badges/awarded-dates`,
            { params: { badgeIds: badgeId } }
        );

        if (response.status === 200 && response.data?.data) {
            const hasBadge = response.data.data.length > 0;
            badgeCache.set(cacheKey, hasBadge, 5 * 60 * 1000); // Cache for 5 minutes
            return hasBadge;
        }
    } catch (error) {
        console.error(`[Roblox Badge]: Failed to check badge ${badgeId} for user ${userId}`, error);
    }

    badgeCache.set(cacheKey, false, 60 * 1000); // Cache failure for 1 minute
    return false;
}
