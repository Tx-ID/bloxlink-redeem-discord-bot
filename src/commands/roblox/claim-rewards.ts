import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder, type Interaction } from "discord.js";

import config from "../../config";
import { getUnclaimedCodesByAmount, getUserIdClaims, getUserIdEligibility } from '../../db';
import { getRobloxFromDiscordId, getRobloxUserFromUserId } from "../../bloxlink";

const command = new SlashCommandBuilder()
    .setName("claim-rewards")
    .setDescription("Messages you privately if you have any rewards.")
    .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)

async function execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply({flags: [MessageFlags.Ephemeral]});

    const bloxlink_data = await getRobloxFromDiscordId(interaction.guildId, interaction.user.id);
    if (!bloxlink_data || !bloxlink_data.robloxID) {
        await interaction.editReply({
            content: "Unable to process reward. You are not linked to bloxlink.",
        });
        return;
    }
    const roblox_data = await getRobloxUserFromUserId(bloxlink_data.robloxID);
    if (!roblox_data) {
        await interaction.editReply({
            content: "Unable to process reward. Invalid Roblox account.",
        });
        return;
    }

    const claims = await getUserIdClaims(Number(bloxlink_data.robloxID));
    const eligibilities = await getUserIdEligibility(Number(bloxlink_data.robloxID));
    const missing_amount = eligibilities.filter((amount) => !claims.find((claim) => claim.Amount === amount));

    try {
        const lines = [
            `Logged in as [@${roblox_data.name}](https://www.roblox.com/users/${roblox_data.id}/profile).`,
            "",
            eligibilities.length <= 0 ? "**You don't have any redeemable rewards.**" : "Your rewards:"
        ];

        await interaction.user.send({
            embeds: [{
                description: lines.join('\n'),
            }]
        });

        await interaction.editReply({
            content: "Success. Please check your Direct Messages.",
        });
    } catch {
        await interaction.editReply({
            content: "Failed to send direct-message, please allow direct messages from this server.",
        });
    }
}

export { command, execute };