import axios from "axios";
import config from "../config";
import type { LookupRobloxData } from "./bloxlink";

const chitoseREST = axios.create({
    baseURL: config.CHITOSE_API_BASE_URL,
    headers: {
        "x-api-key": config.CHITOSE_API_KEY,
    },
});

export async function getRobloxFromDiscordId(guildId: string, discordId: string): Promise<LookupRobloxData | undefined> {
    try {
        const response = await chitoseREST.get(`guild/${guildId}/user/discord/${discordId}`);
        if (response.status === 200 && response.data) {
            const data = response.data.data;
            if (data && data.robloxAccounts && data.robloxAccounts.length > 0) {
                // Determine which account to use. For now, picking the first one.
                const mainAccount = data.robloxAccounts[0];

                return {
                    robloxID: mainAccount.robloxUserId,
                    resolved: {
                        discord: {
                            nick: data.discord.globalName || data.discord.username,
                            user: {
                                id: data.discord.id,
                                username: data.discord.username,
                            },
                        },
                        roblox: {
                            name: mainAccount.robloxUsername,
                            id: Number(mainAccount.robloxUserId),
                            is_banned: false, // Not provided by Chitose sample
                        },
                    },
                };
            }
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(
                `[Chitose]: Failed to get roblox from discordId: ${discordId}`,
                error.message
            );
            return undefined;
        }

        console.error(`[Chitose]: Failed to get roblox from discordId: ${discordId}`, error);
    }
    return undefined;
}
