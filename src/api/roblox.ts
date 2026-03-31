import axios from "axios";
import { SimpleCache } from "../utils/cache";

export type RobloxData = {
    "description": string,
    "created": string,
    "isBanned": boolean,
    "externalAppDisplayName": string,
    "hasVerifiedBadge": boolean,
    "id": number,
    "name": string,
    "displayName": string,
}

const robloxUserCache = new SimpleCache();
export async function getRobloxUserFromUserId(userId: string | number): Promise<RobloxData | undefined> {
    const id = String(userId);
    if (robloxUserCache.get(id)) {
        return robloxUserCache.get(id);
    }

    const endpoints = [
        `https://users.roblox.com/v1/users/${userId}`,
        `https://users.roproxy.com/v1/users/${userId}`,
    ];

    for (const url of endpoints) {
        try {
            const response = await axios.get(url);
            if (response.status === 200) {
                robloxUserCache.set(id, response.data, 60 * 60 * 1000); // 1 hour
                return response.data;
            }
        } catch (error) {
            const isLast = url === endpoints[endpoints.length - 1];
            console.error(`[Roblox]: Failed at ${new URL(url).host} for userId: ${userId}`, error);
            if (!isLast) continue;
        }
    }
}