import { parseArgs } from "util";
import config from "./config";
import { Bot as bot } from './bot';
import { Server } from "./server";


//
const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    flag1: {
      type: 'boolean',
    },
    flag2: {
      type: 'string',
    },
    ["gen-commands"]: {
        type: "boolean",
    },
  },
  allowPositionals: true,
});


//
const server = new Server();

let DiscordBot: bot;
if (config.DISCORD_BOT_TOKEN && config.DISCORD_BOT_CLIENT_ID) {
    DiscordBot = new bot( config.DISCORD_BOT_TOKEN, config.DISCORD_BOT_CLIENT_ID );

    if (values["gen-commands"]) {
      DiscordBot.waitForReady().then(async () => {
        const guilds = await DiscordBot.getGuilds();
        for (const guild of guilds.values()) {
            await DiscordBot.createCommands(guild.id);
        }
      });
    }
} else {
    console.error(`Unable to start bot, missing either DISCORD_BOT_TOKEN or DISCORD_BOT_CLIENT_ID.`);
}