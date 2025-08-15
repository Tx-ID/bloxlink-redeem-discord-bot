import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder, type Interaction } from "discord.js";

const command = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with pong!")
    .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)

async function execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    await interaction.reply({
        flags: [MessageFlags.Ephemeral],
        content: "Success.",
    });
    await interaction.user.send("Pong!");
}

export { command, execute };