import axios from "axios";
import { SimpleCache } from "../utils/cache";
import config from "../config";

export type BadgeCheckResult =
    | { hasBadge: boolean; rateLimited?: false; privateInventory?: false }
    | { hasBadge: false; rateLimited: true; privateInventory?: false }
    | { hasBadge: false; rateLimited?: false; privateInventory: true };

const badgeCache = new SimpleCache();

/** Global cooldown: when any request gets rate limited, block ALL badge requests until this time */
let globalCooldownUntil = 0;
const GLOBAL_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown after any rate limit

/**
 * Check badge ownership via Roblox Open Cloud Inventory API (authenticated, better rate limits).
 * GET https://apis.roblox.com/cloud/v2/users/{userId}/inventory-items?filter=badgeIds={badgeId}
 */
async function checkBadgeViaOpenCloud(userId: string | number, badgeId: number): Promise<BadgeCheckResult | null> {
    if (!config.ROBLOX_OPEN_CLOUD_API_KEY) return null; // No API key configured, skip

    try {
        const response = await axios.get(
            `https://apis.roblox.com/cloud/v2/users/${userId}/inventory-items`,
            {
                params: { filter: `badgeIds=${badgeId}` },
                headers: { "x-api-key": config.ROBLOX_OPEN_CLOUD_API_KEY },
                timeout: 10000,
            }
        );

        if (response.status === 200) {
            const items = response.data?.inventoryItems;
            const hasBadge = Array.isArray(items) && items.length > 0;
            return { hasBadge };
        }

        return null; // Unexpected status, fall through to legacy
    } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const body = axios.isAxiosError(error) ? error.response?.data : undefined;

        if (status === 429) {
            const retryAfter = axios.isAxiosError(error) ? error.response?.headers?.["retry-after"] : undefined;
            console.warn(`[Roblox Badge]: Open Cloud rate limited for badge ${badgeId}, user ${userId} | retry-after: ${retryAfter ?? "none"} | body: ${JSON.stringify(body)}`);
            globalCooldownUntil = Date.now() + GLOBAL_COOLDOWN_MS;
            return { hasBadge: false, rateLimited: true };
        }

        // 403 PERMISSION_DENIED = user has private inventory
        if (status === 403) {
            console.warn(`[Roblox Badge]: Open Cloud permission denied (private inventory) for badge ${badgeId}, user ${userId} | body: ${JSON.stringify(body)}`);
            return { hasBadge: false, privateInventory: true };
        }

        console.error(`[Roblox Badge]: Open Cloud failed for badge ${badgeId}, user ${userId} | status: ${status ?? "N/A"} | body: ${JSON.stringify(body)} | message: ${error instanceof Error ? error.message : error}`);
        return null; // Fall through to legacy
    }
}

/**
 * Check badge ownership via legacy unauthenticated endpoints (roproxy / badges.roblox.com).
 */
async function checkBadgeViaLegacy(userId: string | number, badgeId: number): Promise<BadgeCheckResult> {
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
                return { hasBadge };
            }
        } catch (error) {
            const isLast = url === endpoints[endpoints.length - 1];
            const host = new URL(url).host;
            if (axios.isAxiosError(error) && error.response?.status === 429) {
                const retryAfter = error.response.headers?.["retry-after"];
                const body = error.response.data;
                console.warn(`[Roblox Badge]: Rate limited at ${host} for badge ${badgeId}, user ${userId} | status: 429 | retry-after: ${retryAfter ?? "none"} | body: ${JSON.stringify(body)}`);
                globalCooldownUntil = Date.now() + GLOBAL_COOLDOWN_MS;
                if (!isLast) continue;
                return { hasBadge: false, rateLimited: true };
            }
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            const body = axios.isAxiosError(error) ? error.response?.data : undefined;
            console.error(`[Roblox Badge]: Failed at ${host} for badge ${badgeId}, user ${userId} | status: ${status ?? "N/A"} | body: ${JSON.stringify(body)} | message: ${error instanceof Error ? error.message : error}`);
            if (!isLast) continue;
        }
    }

    return { hasBadge: false };
}

/**
 * Check if a Roblox user has a specific badge.
 * Tries Open Cloud API first (authenticated, reliable), falls back to legacy endpoints.
 */
export async function doesUserHaveBadge(userId: string | number, badgeId: number): Promise<BadgeCheckResult> {
    const cacheKey = `${userId}_${badgeId}`;
    const cached = badgeCache.get(cacheKey);
    if (cached !== undefined) {
        return cached as BadgeCheckResult;
    }

    // If we're in a global cooldown, don't hit any API
    if (Date.now() < globalCooldownUntil) {
        console.warn(`[Roblox Badge]: Global cooldown active, skipping API call for badge ${badgeId}, user ${userId}`);
        return { hasBadge: false, rateLimited: true };
    }

    // Try Open Cloud first
    const openCloudResult = await checkBadgeViaOpenCloud(userId, badgeId);
    if (openCloudResult) {
        badgeCache.set(cacheKey, openCloudResult, openCloudResult.rateLimited ? GLOBAL_COOLDOWN_MS : 15 * 60 * 1000);
        return openCloudResult;
    }

    // Fall back to legacy endpoints
    const legacyResult = await checkBadgeViaLegacy(userId, badgeId);
    const cacheTtl = legacyResult.rateLimited ? GLOBAL_COOLDOWN_MS : legacyResult.hasBadge ? 15 * 60 * 1000 : 5 * 60 * 1000;
    badgeCache.set(cacheKey, legacyResult, cacheTtl);
    return legacyResult;
}
