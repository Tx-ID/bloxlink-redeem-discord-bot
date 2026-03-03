import { ApplicationIntegrationType, InteractionContextType, MessageFlags, MessagePayload, SlashCommandBuilder, type APIEmbed, type Interaction, type MessageCreateOptions } from "discord.js";

import config from "../../../config";
import { getUnclaimedCodesByAmount, getUserIdClaims, getUserIdEligibility, getRandomUnclaimedCode, addClaimData } from '../../../database/db';
import { getRobloxFromDiscordId } from "../../../api/verification";
import { getRobloxUserFromUserId } from "../../../api/roblox";
import { getCodeLabel } from "../../../utils/codes";

const command = new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Messages you privately if you have any rewards.")
    .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)

async function execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) return;

    if (!interaction.inGuild()) return;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const verification_data = await getRobloxFromDiscordId(interaction.guildId, interaction.user.id);
    if (!verification_data || !verification_data.robloxID) {
        interaction.editReply({
            // content: "Unable to process airdrop. You are not linked to bloxlink.",
            content: config.VERIFICATION_MESSAGE
        }).catch(() => { console.log("Interaction failed [1]") });
        return;
    }
    const roblox_data = await getRobloxUserFromUserId(verification_data.robloxID);
    if (!roblox_data) {
        interaction.editReply({
            // content: "Unable to process airdrop. Invalid Roblox account.",
            content: "Maaf anda belum memenuhi syarat untuk melakukan claim airdrop. Akun Roblox anda tidak dapat diverifikasi."
        }).catch(() => { console.log("Interaction failed [2]") });
        return;
    }

    const claims = await getUserIdClaims(Number(verification_data.robloxID));
    const eligibilities = await getUserIdEligibility(Number(verification_data.robloxID));

    try {
        // If user is eligible but has no claim, assign a code now
        if (eligibilities.length > 0 && claims.length === 0) {
            const amount = eligibilities[0]!;
            const code = await getRandomUnclaimedCode(amount);
            
            if (!code) {
                interaction.editReply({
                    content: "Maaf, kode voucher sedang tidak tersedia. Silakan hubungi admin."
                }).catch(() => { console.log("Interaction failed [assign code]") });
                return;
            }
            
            await addClaimData(Number(verification_data.robloxID), amount, code);
            // Refresh claims after adding
            const updatedClaims = await getUserIdClaims(Number(verification_data.robloxID));
            // Use the updated claims for display
            claims.length = 0;
            claims.push(...updatedClaims);
        }

        let reward_type = "";
        if (eligibilities.length > 0) {
            reward_type = getCodeLabel(eligibilities[0]!);
        }

        const lines = eligibilities.length < 1 ? [
            // `Logged in as [@${roblox_data.name}](https://www.roblox.com/users/${roblox_data.id}/profile).`,
            // "",
            // eligibilities.length <= 0 ? "**You don't have any redeemable rewards.**" : "Your rewards:"
            "Maaf anda belum bisa melakukan claim.",
        ] : [
            "# 🎉 Selamat!",
            `## Kamu berhasil mendapatkan __${reward_type}__ dari kolaborasi spesial ${config.EVENT_TITLE}! 🎊`,
            "",
            `🎟️ Kode Voucher: \`${claims[0]!.CodeUsed}\``,
            "📲 Tukarkan langsung di aplikasi GoPay!",
            "",
            `🔓 Cara Menukarkan Kode Voucher:\nStep 1: Buka aplikasi GoPay\nStep 2: Scroll ke bawah dan ketuk "Voucher Saya"\nStep 3: Pilih "Punya kode promo?"\nStep 4: Masukkan kode: \`${claims[0]!.CodeUsed}\` dan klik Tukar\nStep 5: Selesai! GoPay Coins kamu sudah masuk — cek di menu Riwayat Transaksi`,
            "",
            `⚠️ Perlu diingat kode voucher hanya dapat diclaim satu kali. Oleh karena itu, jangan berikan kode ini kesiapapun!`,
            "",
            "💡 Gunakan GoPay Coins kamu untuk transaksi lebih hemat dan seru di berbagai layanan!",
        ];

        const embed: APIEmbed = {
            title: config.EVENT_TITLE,
            color: 3851227,
            description: lines.join('\n'),
        };

        if (eligibilities.length >= 1) {
            embed.footer = {
                "text": `Kode akan hangus apabila tidak ditukarkan sebelum ${config.CODES_EXPIRY}.`
            }
            embed.image = {
                "url": "https://i.ibb.co.com/MyKP3mQy/Cara-tuker-voucher-gopay-coins.jpg"
            }
        }

        const payload: MessagePayload | MessageCreateOptions = {
            tts: false,
            embeds: [embed]
        };

        await interaction.user.send(payload)
            .then(() => {
                interaction.editReply({
                    content: "Success. Please check your Direct Messages.",
                }).catch(() => { console.log(`Interaction failed [3]`) });

            }).catch(() => {
                interaction.editReply({
                    content: "Failed to send direct-message, please allow direct messages from this server.",
                }).catch(() => { console.log(`Interaction failed [4]`) });

            });

    } catch {
        interaction.editReply({
            content: "Failed to send direct-message, please allow direct messages from this server.",
        }).catch(() => { console.log(`Interaction failed [5]`) });

    }
}

export { command, execute };