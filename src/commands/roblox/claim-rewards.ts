import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder, type Interaction } from "discord.js";

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
    await interaction.editReply({
        content: "Bot sedang dalam proses perbaikan."
    });
    return;

    const bloxlink_data = await getRobloxFromDiscordId(interaction.guildId, interaction.user.id);
    if (!bloxlink_data || !bloxlink_data.robloxID) {
        await interaction.editReply({
            // content: "Unable to process airdrop. You are not linked to bloxlink.",
            content: "Maaf anda belum memenuhi syarat untuk melakukan claim airdrop. Harap untuk menghubungkan akun Roblox anda ke bot Bloxlink sebagai verifikasi."
        });
        return;
    }
    const roblox_data = await getRobloxUserFromUserId(bloxlink_data.robloxID);
    if (!roblox_data) {
        await interaction.editReply({
            // content: "Unable to process airdrop. Invalid Roblox account.",
            content: "Maaf anda belum memenuhi syarat untuk melakukan claim airdrop. Akun Roblox anda tidak dapat diverifikasi."
        });
        return;
    }

    const claims = await getUserIdClaims(Number(bloxlink_data.robloxID));
    const eligibilities = await getUserIdEligibility(Number(bloxlink_data.robloxID));

    try {
        const lines = eligibilities.length <= 0 ? [
            // `Logged in as [@${roblox_data.name}](https://www.roblox.com/users/${roblox_data.id}/profile).`,
            // "",
            // eligibilities.length <= 0 ? "**You don't have any redeemable rewards.**" : "Your rewards:"
            "Maaf anda belum bisa melakukan claim airdrop.",
        ] : [
            "# 🎉 Selamat!\n\n\n🎟️ Kode Voucher: `<code>`\n📲 Tukarkan langsung di aplikasi GoPay!\n\n🔓 Cara Menukarkan Kode Voucher:\nStep 1: Buka aplikasi GoPay\nStep 2: Scroll ke bawah dan ketuk “Voucher Saya”\nStep 3: Pilih “Punya kode promo?”\nStep 4: Masukkan kode: `<code>` dan klik Tukar\nStep 5: Selesai! GoPay Coins kamu sudah masuk — cek di menu Riwayat Transaksi\n\n⚠️ Perlu diingat kode voucher hanya dapat diclaim satu kali. Oleh karena itu, jangan berikan kode ini kesiapapun!\n\n💡 Gunakan GoPay Coins kamu untuk transaksi lebih hemat dan seru di berbagai layanan!",
            "## Kamu berhasil mendapatkan __Rp<nominal>__ GoPay Coins dari kolaborasi spesial Indo Voice x GoPay Airdrop Event! 🎊",
        ];

        claims.forEach(data => {
            lines.push(`- **${data.CodeUsed}**`);
        });

        await interaction.user.send({
            tts: false,
            embeds: [{
                title: "Indo Voice x Gopay Airdrop Event",
                color: 3851227,
                description: lines.join('\n'),
                footer: {
                    "text": "Kode voucher akan hangus apabila tidak ditukarkan sebelum 10 September 2025."
                },
                "image": {
                    "url": ""
                },
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