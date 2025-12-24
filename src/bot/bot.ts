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

import * as claimRewards from "./commands/roblox/claim-rewards";
import * as ping from "./commands/utility/ping";

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
    private readyPromise: Promise<boolean>;

    private client_id: string | undefined;
    private token: string | undefined;

    private commands: Map<
        string,
        { command: SlashCommandBuilder; execute: (interaction: Interaction) => Promise<any> }
    > = new Map();

    constructor(token: string, client_id: string) {
        this.client_id = client_id;
        this.token = token;

        this.readyPromise = new Promise((resolve) => {
            this.client.once("clientReady", (readyClient) => {
                this.trueClient = readyClient;
                console.log(
                    `Logged in discord bot as: ${readyClient.user.username}#${readyClient.user.discriminator} || ${readyClient.user.id}`,
                );
                resolve(true);
            });
        });

        this.client.login(`Bot ${token}`);

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
                    command.execute(interaction)
                        .catch((error) => {
                            console.log(`Failed during execution "${interaction.commandName}"`);
                            console.error(error);
                            
                            if (interaction.replied || interaction.deferred) {
                                interaction.followUp({
                                    content:
                                        "There was an error while executing this command!",
                                    flags: MessageFlags.Ephemeral,
                                }).catch(() => {});
                            } else {
                                interaction.reply({
                                    content:
                                        "There was an error while executing this command!",
                                    flags: MessageFlags.Ephemeral,
                                }).catch(() => {});;
                            }
                        });

                } catch {
                    console.log(`Failed to execute "${interaction.commandName}"`);
                }
            }
        });
    }

    public async init() {
        const commandModules = [claimRewards, ping];

        for (const command of commandModules) {
            // @ts-ignore
            if ("command" in command && "execute" in command) {
                // @ts-ignore
                this.commands.set(command.command.name, command);
            } else {
                console.log(
                    `[WARNING] A command is missing a required "command" or "execute" property.`,
                );
            }
        }
    }

    public async clearCommands() {
        try {
            const rest = new REST().setToken(this.token!);
        } catch {}
    }

    public async createCommands(guildId?: string) {
        const rest = new REST({version: "10"}).setToken(this.token!);
        try {
            const commands = Array.from(this.commands.values()).map((d) => d.command.toJSON());
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
        return this.readyPromise;
    }

    public async getGuilds() {
        await this.waitForReady();
        return this.trueClient!.guilds.fetch();
    }
}
