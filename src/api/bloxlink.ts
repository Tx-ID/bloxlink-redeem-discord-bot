import axios from "axios";
import config from "../config";

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

export async function getRobloxFromDiscordId(guildId: string, discordId: string): Promise<LookupRobloxData | undefined> {
    try {
        const response = await bloxlinkREST.get(`/public/guilds/${guildId}/discord-to-roblox/${discordId}`);
        if (response.status === 200) {
            return response.data;
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const data = error.response?.data as { error?: string } | undefined;
            if (status === 404 && data?.error === "User not found") {
                console.log(`[Bloxlink]: DiscordId ${discordId} user id not found in Guild nor not verified.`);
                return;
            }

            console.error(
                `[Bloxlink]: Failed to get roblox from discordId: ${discordId}`,
                error.message
            );
            return;
        }

        console.error(`[Bloxlink]: Failed to get roblox from discordId: ${discordId}`, error);
    }
}