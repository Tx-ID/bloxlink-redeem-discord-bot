import { parseArgs } from "util";

import * as z from "zod";
import config from "./config";
import express from "express";

import { Bot as bot } from './bot';
import { getDB } from './db';


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
let DiscordBot: bot;

const app = express();
app.use(express.json());

app.post('/set-eligibility', (req, res, next) => {

});
app.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`);
});


//
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