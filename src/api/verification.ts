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
