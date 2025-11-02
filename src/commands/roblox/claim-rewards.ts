import { ApplicationIntegrationType, InteractionContextType, MessageFlags, MessagePayload, SlashCommandBuilder, type APIEmbed, type Interaction, type MessageCreateOptions } from "discord.js";

import config from "../../config";
import { getUnclaimedCodesByAmount, getUserIdClaims, getUserIdEligibility } from '../../db';
import { getRobloxFromDiscordId, getRobloxUserFromUserId } from "../../bloxlink";

const command = new SlashCommandBuilder()
    .setName("claim-airdrop")
    .setDescription("Messages you privately if you have any airdrop.")
    .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)

async function execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply({flags: [MessageFlags.Ephemeral]});

    const bloxlink_data = await getRobloxFromDiscordId(interaction.guildId, interaction.user.id);
    if (!bloxlink_data || !bloxlink_data.robloxID) {
        interaction.editReply({
            // content: "Unable to process airdrop. You are not linked to bloxlink.",
            content: "Maaf anda belum memenuhi syarat untuk melakukan claim airdrop. Harap untuk menghubungkan akun Roblox anda ke bot Bloxlink untuk verifikasi."
        }).catch(() => { console.log("Interaction failed [1]") });
        return;
    }
    const roblox_data = await getRobloxUserFromUserId(bloxlink_data.robloxID);
    if (!roblox_data) {
        interaction.editReply({
            // content: "Unable to process airdrop. Invalid Roblox account.",
            content: "Maaf anda belum memenuhi syarat untuk melakukan claim airdrop. Akun Roblox anda tidak dapat diverifikasi."
        }).catch(() => { console.log("Interaction failed [2]") });
        return;
    }

    const claims = await getUserIdClaims(Number(bloxlink_data.robloxID));
    const eligibilities = await getUserIdEligibility(Number(bloxlink_data.robloxID));

    try {
        let reward_type = "";
        if (eligibilities.length > 0) {
            reward_type = eligibilities[0]! === 5000 ? "GoPay Coins" : "Voucher Cashback GoPay"
        }

        const lines = eligibilities.length < 1 ? [
            // `Logged in as [@${roblox_data.name}](https://www.roblox.com/users/${roblox_data.id}/profile).`,
            // "",
            // eligibilities.length <= 0 ? "**You don't have any redeemable rewards.**" : "Your rewards:"
            "Maaf anda belum mendapatkan airdrop.",
        ] : [
            "# 🎉 Selamat!",
            `## Kamu berhasil mendapatkan __Rp ${new Intl.NumberFormat("id").format(eligibilities[0]!)}__ ${reward_type} dari kolaborasi spesial Indo Voice x GoPay Airdrop Event! 🎊`,
            "",
            `🎟️ Kode Voucher: \`${claims[0]!.CodeUsed}\``,
            "📲 Tukarkan langsung di aplikasi GoPay!",
            "",
            `🔓 Cara Menukarkan Kode Voucher:\nStep 1: Buka aplikasi GoPay\nStep 2: Scroll ke bawah dan ketuk “Voucher Saya”\nStep 3: Pilih “Punya kode promo?”\nStep 4: Masukkan kode: \`${claims[0]!.CodeUsed}\` dan klik Tukar\nStep 5: Selesai! GoPay Coins kamu sudah masuk — cek di menu Riwayat Transaksi`,
            "",
            `⚠️ Perlu diingat kode voucher hanya dapat diclaim satu kali. Oleh karena itu, jangan berikan kode ini kesiapapun!`,
            "",
            "💡 Gunakan GoPay Coins kamu untuk transaksi lebih hemat dan seru di berbagai layanan!",
        ];

        const embed: APIEmbed = {
            title: "Indo Voice x Gopay Airdrop Event",
            color: 3851227,
            description: lines.join('\n'),
        };

        if (eligibilities.length >= 1) {
            embed.footer = {
                "text": "Kode voucher akan hangus apabila tidak ditukarkan sebelum 31 November 2025."
            }
            embed.image = {
                "url": "https://i.ibb.co.com/MyKP3mQy/Cara-tuker-voucher-gopay-coins.jpg"
            }
        }

        const payload: MessagePayload | MessageCreateOptions = {
            tts: false,
            embeds: [embed]
        };

        await interaction.user.send(payload);
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