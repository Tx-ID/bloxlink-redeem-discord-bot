import axios from "axios";
import { SimpleCache } from "../utils/cache";

export type BadgeCheckResult = { hasBadge: boolean; rateLimited?: false } | { hasBadge: false; rateLimited: true };

const badgeCache = new SimpleCache();

/**
 * Check if a Roblox user has a specific badge.
 * Uses the Roblox Badges API: GET https://badges.roblox.com/v1/users/{userId}/badges/awarded-dates?badgeIds={badgeId}
 */
export async function doesUserHaveBadge(userId: string | number, badgeId: number): Promise<BadgeCheckResult> {
    const cacheKey = `${userId}_${badgeId}`;
    const cached = badgeCache.get(cacheKey);
    if (cached !== undefined) {
        return cached as BadgeCheckResult;
    }

    const endpoints = [
        `https://badges.roblox.com/v1/users/${userId}/badges/awarded-dates`,
        `https://badges.roproxy.com/v1/users/${userId}/badges/awarded-dates`,
    ];

    for (const url of endpoints) {
        try {
            const response = await axios.get(url, { params: { badgeIds: badgeId } });

            if (response.status === 200 && response.data?.data) {
                const hasBadge = response.data.data.length > 0;
                const result: BadgeCheckResult = { hasBadge };
                badgeCache.set(cacheKey, result, 15 * 60 * 1000); // Cache for 15 minutes
                return result;
            }
        } catch (error) {
            const isLast = url === endpoints[endpoints.length - 1];
            if (axios.isAxiosError(error) && error.response?.status === 429) {
                console.warn(`[Roblox Badge]: Rate limited at ${new URL(url).host} for badge ${badgeId}, user ${userId}`);
                if (!isLast) continue; // Try next endpoint
                const result: BadgeCheckResult = { hasBadge: false, rateLimited: true };
                badgeCache.set(cacheKey, result, 5 * 60 * 1000);
                return result;
            }
            console.error(`[Roblox Badge]: Failed at ${new URL(url).host} for badge ${badgeId}, user ${userId}`, error);
            if (!isLast) continue; // Try next endpoint
        }
    }

    const result: BadgeCheckResult = { hasBadge: false };
    badgeCache.set(cacheKey, result, 5 * 60 * 1000); // Cache failure for 5 minutes
    return result;
}
