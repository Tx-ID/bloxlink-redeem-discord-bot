import axios from "axios";
import config from "./config";
import { SimpleCache } from "./cache";

const bloxlinkREST = axios.create({
    baseURL: config.BLOXLINK_API_BASE_URL,
    headers: {
        "Authorization": config.BLOXLINK_API_KEY,
    },
});


//
export type LookupRobloxData = {
    robloxID: string,
    resolved: {
        discord: {
            nick: string,
            user: {
                id: string,
                username: string,
            },
        } | null,
        roblox: {
            name: string,
            id: number,
            is_banned: boolean,
        } | null,
    },
}

export async function getRobloxFromDiscordId(guildId: any, discordId: any): Promise<(LookupRobloxData | undefined)> {
    const json = await bloxlinkREST.get(`/public/guilds/${guildId}/discord-to-roblox/${discordId}`);
    if (json.status === 200) {
        return json.data;
    }
}


//
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
export async function getRobloxUserFromUserId(userId: any): Promise<RobloxData | undefined> {
    const id = String(userId);
    if (robloxUserCache.get(id)) {
        return robloxUserCache.get(id);
    }

    const json = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
    if (json.status === 200) {
        robloxUserCache.set(id, json.data);
        return json.data;
    }
}