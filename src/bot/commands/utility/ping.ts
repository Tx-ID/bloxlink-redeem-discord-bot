import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder, type Interaction } from "discord.js";

const command = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with pong!")
    .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)

async function execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply({flags: [MessageFlags.Ephemeral]});
    try {
        await interaction.user.send("Pong!");
        await interaction.editReply({
            content: "Success.",
        });
    } catch {
        await interaction.editReply({
            content: "Failed to send direct-message, please allow direct messages from this server.",
        });
    }
}

export { command, execute };