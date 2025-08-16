
import * as z from "zod";
import dotenv from 'dotenv';
dotenv.config({quiet: true});

export default {

    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_BOT_CLIENT_ID: process.env.DISCORD_BOT_CLIENT_ID,

    DEADLINE_ACTIVE: z.coerce.boolean({error: "Invalid type for: DEADLINE_ACTIVE"}).default(false).parse(process.env.DEADLINE_ACTIVE),
    DEADLINE_UNIX: process.env.DEADLINE_UNIX ? z.coerce.date({error: "Invalid type for: DEADLINE_UNIX"}).nullable().parse(process.env.DEADLINE_UNIX) : null,

    DB_FILENAME: z.coerce.string().default("db.json").parse(process.env.DB_FILENAME),
    CODES_FOLDERNAME: process.env.CODES_FOLDERNAME !== "" ? process.env.CODES_FOLDERNAME : "codes",
    
    ROBLOX_BADGE_ID: process.env.ROBLOX_BADGE_ID ? z.coerce.number({error: "Invalid type for: ROBLOX_BADGE_ID"}).nullable().parse(process.env.ROBLOX_BADGE_ID) : null,

    BLOXLINK_API_KEY: process.env.BLOXLINK_API_KEY ? z.coerce.string().nullable().parse(process.env.BLOXLINK_API_KEY) : null,
    BLOXLINK_API_BASE_URL: z.coerce.string().default("https://api.blox.link/v4/").parse(process.env.BLOXLINK_API_BASE_URL),

    PORT: process.env.PORT ?? 5478,
    BEARER_KEY: process.env.BEARER_KEY,
    
};