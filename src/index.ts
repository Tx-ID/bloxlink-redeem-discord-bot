import { parseArgs } from "util";
import config from "./config";
import { Bot as bot } from './bot/bot';
import { Server } from "./server/server";

process.title = process.env.PROCESS_NAME || "bloxlink-redeem-discord-bot";


//
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
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
async function main() {
    const server = new Server();

    let DiscordBot: bot;
    if (config.DISCORD_BOT_TOKEN && config.DISCORD_BOT_CLIENT_ID) {
        DiscordBot = new bot( config.DISCORD_BOT_TOKEN, config.DISCORD_BOT_CLIENT_ID );
        await DiscordBot.init();
        await DiscordBot.waitForReady();

        // Register commands globally on every startup
        await DiscordBot.createCommands();
    } else {
        console.error(`Unable to start bot, missing either DISCORD_BOT_TOKEN or DISCORD_BOT_CLIENT_ID.`);
    }
}

main();