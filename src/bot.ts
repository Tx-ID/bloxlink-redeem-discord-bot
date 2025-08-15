import {
    Client,
    Collection,
    GatewayIntentBits,
    type Interaction,
    MessageFlags,
    REST,
    Routes,
    SlashCommandBuilder,
} from "discord.js";
import * as Axios from "axios";

import fs from "fs";
import path from "path";

export class Bot {
    private client: Client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.DirectMessages,
        ],
    });
    private trueClient: Client<true> | undefined;

    private client_id: string | undefined;
    private token: string | undefined;

    private commands: Map<
        string,
        { command: SlashCommandBuilder; execute: (interaction: Interaction) => void }
    > = new Map();

    constructor(token: string, client_id: string) {
        this.client_id = client_id;
        this.token = token;

        this.client = this.client.on("ready", (readyClient) => {
            this.trueClient = readyClient;
            console.log(
                `Logged in discord bot as: ${readyClient.user.username}#${readyClient.user.discriminator} || ${readyClient.user.id}`,
            );
        });
        this.client.login(`Bot ${token}`);

        //
        const foldersPath = path.join(__dirname, "./commands");
        const commandFolders = fs.readdirSync(foldersPath);

        for (const folder of commandFolders) {
            const commandsPath = path.join(foldersPath, folder);
            const commandFiles = fs.readdirSync(commandsPath).filter((file) =>
                file.endsWith(".ts")
            );
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                const command = require(filePath);
                if ("command" in command && "execute" in command) {
                    this.commands.set(command.command.name, command);
                    // commands.push(command.command.toJSON());
                } else {
                    console.log(
                        `[WARNING] The command at ${filePath} is missing a required "command" or "execute" property.`,
                    );
                }
            }
        }

        this.client.on("interactionCreate", async (interaction) => {
            if (interaction.isChatInputCommand()) {
                const command = this.commands.get(interaction.commandName);
                if (!command) {
                    console.error(
                        `No command matching ${interaction.commandName} was found.`,
                    );
                    return;
                }

                try {
                    await command.execute(interaction);
                } catch (error) {
                    console.error(error);
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({
                            content:
                                "There was an error while executing this command!",
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        await interaction.reply({
                            content:
                                "There was an error while executing this command!",
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                }
            }
        });
    }

    public async clearCommands() {
        try {
            const rest = new REST().setToken(this.token!);
        } catch {}
    }

    public async createCommands(guildId?: string) {
        const rest = new REST({version: "10"}).setToken(this.token!);
        try {
            const commands = this.commands.values().map((d) => d.command.toJSON()).toArray();
            if (guildId) {
                console.log(
                    `refreshing ${this.commands.size} application (/) commands to guild ${guildId}`,
                );
                const data: any = await rest.put(
                    Routes.applicationGuildCommands(this.client_id!, guildId),
                    { body: commands },
                );
            } else {
                const data: any = await rest.put(
                    Routes.applicationCommands(this.client_id!),
                    { body: commands },
                );
            }
        } catch (error) {
            console.error(error);
        }
    }

    public async waitForReady() {
        if (this.trueClient) {
            return new Promise((resolve) => resolve(true));
        }
        return new Promise((resolve) => {
            this.client.on("ready", (readyClient) => {
                resolve(true);
            });
        });
    }

    public async getGuilds() {
        await this.waitForReady();
        return this.trueClient!.guilds.fetch();
    }
}
