/**
 * Clear per-guild (server-scoped) slash commands so that ONLY global commands
 * remain. For every guild the bot is in, this overwrites that guild's command
 * set with an empty array. Global commands are left untouched.
 *
 * Why: the bot registers its commands globally on startup (see bot.ts
 * `createCommands()` with no guildId). Any guild-scoped commands registered
 * previously — manually, during testing, or by an old build — shadow and
 * duplicate the global ones in those servers. This wipes them.
 *
 * Usage (run with tsx; reads DISCORD_* from .env):
 *   npm run clear-guild-commands              # clear every guild the bot is in
 *   tsx scripts/clear-guild-commands.ts --dry # preview only, change nothing
 *   tsx scripts/clear-guild-commands.ts --guild 123456789012345678  # one guild
 */
import { parseArgs } from "util";
import { REST, Routes } from "discord.js";
import config from "../src/config";

interface PartialGuild {
    id: string;
    name: string;
}

/** Page through GET /users/@me/guilds (max 200 per page) and return all guilds. */
async function listBotGuilds(rest: REST): Promise<PartialGuild[]> {
    const all: PartialGuild[] = [];
    let after: string | undefined;

    for (;;) {
        const query = new URLSearchParams({ limit: "200" });
        if (after) query.set("after", after);

        const page = (await rest.get(Routes.userGuilds(), { query })) as PartialGuild[];
        all.push(...page);

        if (page.length < 200) break;
        after = page[page.length - 1]!.id;
    }

    return all;
}

async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            dry: { type: "boolean" },
            guild: { type: "string" },
        },
        allowPositionals: true,
    });

    const dry = values.dry === true;
    const token = config.DISCORD_BOT_TOKEN;
    const clientId = config.DISCORD_BOT_CLIENT_ID;

    if (!token || !clientId) {
        console.error("[clear-guild-commands]: Missing DISCORD_BOT_TOKEN or DISCORD_BOT_CLIENT_ID in env.");
        process.exit(1);
    }

    const rest = new REST({ version: "10" }).setToken(token);

    const guilds = values.guild
        ? [{ id: values.guild, name: "(specified)" }]
        : await listBotGuilds(rest);

    if (guilds.length === 0) {
        console.log("[clear-guild-commands]: Bot is in no guilds; nothing to clear.");
        return;
    }

    console.log(`[clear-guild-commands]: ${dry ? "[DRY] " : ""}Clearing guild commands for ${guilds.length} guild(s)...`);

    let cleared = 0;
    for (const guild of guilds) {
        if (dry) {
            console.log(`  [DRY] would clear: ${guild.name} (${guild.id})`);
            continue;
        }
        try {
            // PUT with an empty body removes all of this guild's commands.
            await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: [] });
            cleared++;
            console.log(`  cleared: ${guild.name} (${guild.id})`);
        } catch (err) {
            console.error(`  FAILED: ${guild.name} (${guild.id})`, err);
        }
    }

    if (!dry) {
        console.log(`[clear-guild-commands]: Done. Cleared ${cleared}/${guilds.length} guild(s). Global commands are unchanged.`);
    }
}

main().catch((err) => {
    console.error("[clear-guild-commands]: Unexpected error", err);
    process.exit(1);
});
