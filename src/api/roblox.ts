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

    try {
        const response = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
        if (response.status === 200) {
            robloxUserCache.set(id, response.data, 60 * 60 * 1000); // 1 hour
            return response.data;
        }
    } catch (error) {
        console.error(`[Roblox]: Failed to get roblox user from userId: ${userId}`, error);
    }
}