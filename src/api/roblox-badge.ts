import axios from "axios";
import { SimpleCache } from "../utils/cache";

export type BadgeCheckResult = { hasBadge: boolean; rateLimited?: false } | { hasBadge: false; rateLimited: true };

const badgeCache = new SimpleCache();

/** Global cooldown: when any request gets rate limited, block ALL badge requests until this time */
let globalCooldownUntil = 0;
const GLOBAL_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown after any rate limit

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

    // If we're in a global cooldown, don't hit the API at all
    if (Date.now() < globalCooldownUntil) {
        console.warn(`[Roblox Badge]: Global cooldown active, skipping API call for badge ${badgeId}, user ${userId}`);
        return { hasBadge: false, rateLimited: true };
    }

    const endpoints = [
        `https://badges.roproxy.com/v1/users/${userId}/badges/awarded-dates`,
        `https://badges.roblox.com/v1/users/${userId}/badges/awarded-dates`,
    ];

    for (const url of endpoints) {
        try {
            const response = await axios.get(url, { params: { badgeIds: badgeId }, timeout: 5000 });

            if (response.status === 200) {
                const badgeData = response.data?.data;
                const hasBadge = Array.isArray(badgeData) && badgeData.length > 0;
                const result: BadgeCheckResult = { hasBadge };
                badgeCache.set(cacheKey, result, 15 * 60 * 1000); // Cache for 15 minutes
                return result;
            }
        } catch (error) {
            const isLast = url === endpoints[endpoints.length - 1];
            const host = new URL(url).host;
            if (axios.isAxiosError(error) && error.response?.status === 429) {
                const retryAfter = error.response.headers?.["retry-after"];
                const body = error.response.data;
                console.warn(`[Roblox Badge]: Rate limited at ${host} for badge ${badgeId}, user ${userId} | status: 429 | retry-after: ${retryAfter ?? "none"} | body: ${JSON.stringify(body)}`);
                // Activate global cooldown so other users don't pile on
                globalCooldownUntil = Date.now() + GLOBAL_COOLDOWN_MS;
                if (!isLast) continue; // Try next endpoint
                const result: BadgeCheckResult = { hasBadge: false, rateLimited: true };
                badgeCache.set(cacheKey, result, GLOBAL_COOLDOWN_MS);
                return result;
            }
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            const body = axios.isAxiosError(error) ? error.response?.data : undefined;
            console.error(`[Roblox Badge]: Failed at ${host} for badge ${badgeId}, user ${userId} | status: ${status ?? "N/A"} | body: ${JSON.stringify(body)} | message: ${error instanceof Error ? error.message : error}`);
            if (!isLast) continue; // Try next endpoint
        }
    }

    const result: BadgeCheckResult = { hasBadge: false };
    badgeCache.set(cacheKey, result, 5 * 60 * 1000); // Cache failure for 5 minutes
    return result;
}
