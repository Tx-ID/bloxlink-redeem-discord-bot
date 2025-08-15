import { SlashCommandBuilder, type Interaction } from "discord.js";

const command = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with pong!")

async function execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    await interaction.reply('Pong!');
}

export { command, execute };