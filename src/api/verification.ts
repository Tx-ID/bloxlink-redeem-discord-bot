import config from "../config";
import * as bloxlink from "./bloxlink";
import * as chitose from "./chitose";
import type { LookupRobloxData } from "./bloxlink";

export type { LookupRobloxData };

export async function getRobloxFromDiscordId(guildId: string, discordId: string): Promise<LookupRobloxData | undefined> {
    if (config.VERIFICATION_PROVIDER === "CHITOSE") {
        return chitose.getRobloxFromDiscordId(guildId, discordId);
    }
    return bloxlink.getRobloxFromDiscordId(guildId, discordId);
}

/**
 * Try Bloxlink first, then fall back to Chitose.
 * Used by the special server where users may be verified with either provider.
 */
export async function getRobloxFromDiscordIdWithFallback(guildId: string, discordId: string): Promise<LookupRobloxData | undefined> {
    // Try Bloxlink first
    try {
        const bloxlinkResult = await bloxlink.getRobloxFromDiscordId(guildId, discordId);
        if (bloxlinkResult && bloxlinkResult.robloxID) {
            return bloxlinkResult;
        }
    } catch (error) {
        console.error(`[Verification]: Bloxlink lookup failed for ${discordId}, falling back to Chitose`, error);
    }

    // Fall back to Chitose
    try {
        const chitoseResult = await chitose.getRobloxFromDiscordId(guildId, discordId);
        if (chitoseResult && chitoseResult.robloxID) {
            return chitoseResult;
        }
    } catch (error) {
        console.error(`[Verification]: Chitose lookup failed for ${discordId}`, error);
    }

    return undefined;
}
