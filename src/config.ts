import * as z from "zod"; 

export default {

    DISCORD_BOT_TOKEN: z.coerce.string().nullable().parse(process.env.DISCORD_BOT_TOKEN),

    DEADLINE_ACTIVE: z.coerce.boolean().default(false).parse(process.env.DEADLINE_ACTIVE),
    DEADLINE_UNIX: z.coerce.date().nullable().parse(process.env.DEADLINE_UNIX),

    DB_FILENAME: z.coerce.string().default("db.json").parse(process.env.DB_FILENAME),
    CODES_FILENAME: z.coerce.string().default("codes.txt").parse(process.env.CODES_FILENAME),
    ROBLOX_BADGE_ID: z.coerce.number().int().nullable().parse(process.env.ROBLOX_BADGE_ID),

    BLOXLINK_API_KEY: z.coerce.string().nullable().parse(process.env.BLOXLINK_API_KEY),

    BLOXLINK_API_BASE_URL: z.coerce.string().default("https://api.blox.link/v4/").parse(process.env.BLOXLINK_API_BASE_URL),
    // ROBLOX_API_BASE_URL: z.coerce.string().default("https://roproxy.com").parse(process.env.ROBLOX_API_BASE_URL),
    
};