import { ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, InteractionContextType, MessageFlags, MessagePayload, PermissionFlagsBits, SlashCommandBuilder, type APIEmbed, type Interaction, type MessageCreateOptions } from "discord.js";

import config from "../../../config";
import { getUserIdClaims, getUserIdEligibility, getRandomUnclaimedCode, addClaimData, getServerUserClaims, getServerRandomUnclaimedCode, addServerClaimData } from '../../../database/db';
import { getRobloxFromDiscordId, getRobloxFromDiscordIdWithFallback } from "../../../api/verification";
import { getRobloxUserFromUserId } from "../../../api/roblox";
import { doesUserHaveBadge } from "../../../api/roblox-badge";
import { getCodeLabel, getServerCodeLabel } from "../../../utils/codes";
import { getRewardServerByGuild, type RewardServerConfig } from "../../../config/reward-servers";

function canUsePreview(interaction: Interaction): boolean {
    if (config.PREVIEW_ALLOWED_USER_IDS.includes(interaction.user.id)) return true;
    if (interaction.isChatInputCommand() && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
    return false;
}

const command = new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Messages you privately if you have any rewards.")
    .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addBooleanOption(option =>
        option
            .setName("preview")
            .setDescription("Preview the reward DM with fake data (admin only)")
            .setRequired(false)
    )

/**
 * Handle /claim for a dynamic reward server (badge-gated, Bloxlink→Chitose fallback).
 */
async function executeRewardServer(interaction: Interaction & { guildId: string }, server: RewardServerConfig, preview = false) {
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Preview mode: skip all verification/badge/db checks, use fake data
    if (preview) {
        if (!canUsePreview(interaction)) {
            interaction.editReply({ content: "Preview mode is restricted to administrators." }).catch(() => {});
            return;
        }

        const reward_type = Object.values(server.codeTypes)[0] ?? "Reward";
        const redeemCode = "TESTCODE-XXXX-0000";
        const redeemUrl = `https://gopay.co.id/app/myrewards?promo_code=${redeemCode}`;

        const lines = [
            "# 🎉 Selamat!",
            `## Kamu berhasil mendapatkan __${reward_type}__ dari event spesial ${server.eventTitle}! 🎊`,
            "",
            `🎟️ Kode Voucher: \`${redeemCode}\``,
            `📲 [Tukarkan langsung di aplikasi GoPay!](${redeemUrl})`,
            "",
            `⚠️ Perlu diingat kode voucher hanya dapat diclaim satu kali. Oleh karena itu, jangan berikan kode ini kesiapapun!`,
            "",
            "💡 Terima kasih sudah berpartisipasi!",
        ];

        const embed: APIEmbed = {
            title: `[PREVIEW] ${server.eventTitle}`,
            color: 0xFFD700,
            description: lines.join('\n'),
            footer: { text: `Kode akan hangus apabila tidak ditukarkan sebelum ${server.codesExpiry}.` },
        };

        const redeemButton = new ButtonBuilder()
            .setLabel("Tukarkan di GoPay")
            .setStyle(ButtonStyle.Link)
            .setURL(redeemUrl)
            .setEmoji("📲");
        const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(redeemButton)];

        const payload: MessagePayload | MessageCreateOptions = { tts: false, embeds: [embed], components };

        await interaction.user.send(payload)
            .then(() => {
                interaction.editReply({ content: "Preview DM sent. Check your Direct Messages." }).catch(() => {});
            }).catch(() => {
                interaction.editReply({ content: "Failed to send DM. Please allow direct messages from this server." }).catch(() => {});
            });
        return;
    }

    // Use fallback verification: Bloxlink first, then Chitose
    const verification_data = await getRobloxFromDiscordIdWithFallback(interaction.guildId, interaction.user.id);
    if (!verification_data || !verification_data.robloxID) {
        interaction.editReply({
            content: server.verificationMessage
        }).catch(() => { console.log(`[${server.name}]: Interaction failed [1]`) });
        return;
    }

    const roblox_data = await getRobloxUserFromUserId(verification_data.robloxID);
    if (!roblox_data) {
        interaction.editReply({
            content: "Maaf, akun Roblox anda tidak dapat diverifikasi."
        }).catch(() => { console.log(`[${server.name}]: Interaction failed [2]`) });
        return;
    }

    // Badge check
    const badgeResult = await doesUserHaveBadge(verification_data.robloxID, server.badgeId);
    if (badgeResult.rateLimited) {
        interaction.editReply({
            content: "Maaf, pengecekan badge sedang mengalami gangguan. Silakan coba lagi dalam beberapa menit."
        }).catch(() => { console.log(`[${server.name}]: Interaction failed [badge rate limit]`) });
        return;
    }
    if (!badgeResult.hasBadge) {
        interaction.editReply({
            content: "Maaf, kamu belum memiliki badge yang diperlukan untuk melakukan claim reward ini."
        }).catch(() => { console.log(`[${server.name}]: Interaction failed [badge check]`) });
        return;
    }

    // Use this server's separate claims collection
    const claims = await getServerUserClaims(server, Number(verification_data.robloxID));

    try {
        // If user has the badge but no claim yet, assign a code now
        if (claims.length === 0) {
            const serverAmounts = Object.keys(server.codeTypes).map(Number);
            if (serverAmounts.length === 0) {
                interaction.editReply({
                    content: "Maaf, kode reward belum tersedia. Silakan hubungi admin."
                }).catch(() => { console.log(`[${server.name}]: Interaction failed [no code types]`) });
                return;
            }

            const amount = serverAmounts[0]!;
            const code = await getServerRandomUnclaimedCode(server, amount);

            if (!code) {
                interaction.editReply({
                    content: "Maaf, kode reward sedang tidak tersedia. Silakan hubungi admin."
                }).catch(() => { console.log(`[${server.name}]: Interaction failed [assign code]`) });
                return;
            }

            await addServerClaimData(server, Number(verification_data.robloxID), amount, code);
            // Refresh claims after adding
            const updatedClaims = await getServerUserClaims(server, Number(verification_data.robloxID));
            claims.length = 0;
            claims.push(...updatedClaims);
        }

        const reward_type = claims.length > 0 ? getServerCodeLabel(server, claims[0]!.Amount) : "Reward";

        const redeemCode = claims.length >= 1 ? claims[0]!.CodeUsed : "";
        const redeemUrl = `https://gopay.co.id/app/myrewards?promo_code=${redeemCode}`;

        const lines = claims.length < 1 ? [
            "Maaf, terjadi kesalahan saat memproses claim anda.",
        ] : [
            "# 🎉 Selamat!",
            `## Kamu berhasil mendapatkan __${reward_type}__ dari event spesial ${server.eventTitle}! 🎊`,
            "",
            `🎟️ Kode Voucher: \`${redeemCode}\``,
            `📲 [Tukarkan langsung di aplikasi GoPay!](${redeemUrl})`,
            "",
            `⚠️ Perlu diingat kode voucher hanya dapat diclaim satu kali. Oleh karena itu, jangan berikan kode ini kesiapapun!`,
            "",
            "💡 Terima kasih sudah berpartisipasi!",
        ];

        const embed: APIEmbed = {
            title: server.eventTitle,
            color: 0xFFD700, // Gold color for reward servers
            description: lines.join('\n'),
        };

        if (claims.length >= 1) {
            embed.footer = {
                "text": `Kode akan hangus apabila tidak ditukarkan sebelum ${server.codesExpiry}.`
            }
        }

        const components: ActionRowBuilder<ButtonBuilder>[] = [];
        if (claims.length >= 1) {
            const redeemButton = new ButtonBuilder()
                .setLabel("Tukarkan di GoPay")
                .setStyle(ButtonStyle.Link)
                .setURL(redeemUrl)
                .setEmoji("📲");
            components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(redeemButton));
        }

        const payload: MessagePayload | MessageCreateOptions = {
            tts: false,
            embeds: [embed],
            components,
        };

        await interaction.user.send(payload)
            .then(() => {
                interaction.editReply({
                    content: "Success. Please check your Direct Messages.",
                }).catch(() => { console.log(`[${server.name}]: Interaction failed [3]`) });
            }).catch(() => {
                interaction.editReply({
                    content: "Failed to send direct-message, please allow direct messages from this server.",
                }).catch(() => { console.log(`[${server.name}]: Interaction failed [4]`) });
            });

    } catch {
        interaction.editReply({
            content: "Failed to send direct-message, please allow direct messages from this server.",
        }).catch(() => { console.log(`[${server.name}]: Interaction failed [5]`) });
    }
}

/**
 * Default /claim handler (eligibility-based, single verification provider).
 */
async function executeDefault(interaction: Interaction, preview = false) {
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Preview mode: skip all verification/db checks, use fake data
    if (preview) {
        if (!canUsePreview(interaction)) {
            interaction.editReply({ content: "Preview mode is restricted to administrators." }).catch(() => {});
            return;
        }

        const fakeCode = "TESTCODE-XXXX-0000";
        const reward_type = Object.values(config.CODE_TYPES)[0] ?? "Reward";

        const lines = [
            "# 🎉 Selamat!",
            `## Kamu berhasil mendapatkan __${reward_type}__ dari kolaborasi spesial ${config.EVENT_TITLE}! 🎊`,
            "",
            `🎟️ Kode Voucher: \`${fakeCode}\``,
            "📲 Tukarkan langsung di aplikasi GoPay!",
            "",
            `🔓 Cara Menukarkan Kode Voucher:\nStep 1: Buka aplikasi GoPay\nStep 2: Scroll ke bawah dan ketuk "Voucher Saya"\nStep 3: Pilih "Punya kode promo?"\nStep 4: Masukkan kode: \`${fakeCode}\` dan klik Tukar\nStep 5: Selesai! GoPay Coins kamu sudah masuk — cek di menu Riwayat Transaksi`,
            "",
            `⚠️ Perlu diingat kode voucher hanya dapat diclaim satu kali. Oleh karena itu, jangan berikan kode ini kesiapapun!`,
            "",
            "💡 Gunakan GoPay Coins kamu untuk transaksi lebih hemat dan seru di berbagai layanan!",
        ];

        const embed: APIEmbed = {
            title: `[PREVIEW] ${config.EVENT_TITLE}`,
            color: 3851227,
            description: lines.join('\n'),
            footer: { text: `Kode akan hangus apabila tidak ditukarkan sebelum ${config.CODES_EXPIRY}.` },
            image: { url: "https://i.ibb.co.com/MyKP3mQy/Cara-tuker-voucher-gopay-coins.jpg" },
        };

        const payload: MessagePayload | MessageCreateOptions = { tts: false, embeds: [embed] };

        await interaction.user.send(payload)
            .then(() => {
                interaction.editReply({ content: "Preview DM sent. Check your Direct Messages." }).catch(() => {});
            }).catch(() => {
                interaction.editReply({ content: "Failed to send DM. Please allow direct messages from this server." }).catch(() => {});
            });
        return;
    }

    const verification_data = await getRobloxFromDiscordId(interaction.guildId!, interaction.user.id);
    if (!verification_data || !verification_data.robloxID) {
        interaction.editReply({
            content: config.VERIFICATION_MESSAGE
        }).catch(() => { console.log("Interaction failed [1]") });
        return;
    }
    const roblox_data = await getRobloxUserFromUserId(verification_data.robloxID);
    if (!roblox_data) {
        interaction.editReply({
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

async function execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) return;

    const preview = interaction.options.getBoolean("preview") ?? false;

    // Check if this guild is a registered reward server
    const rewardServer = getRewardServerByGuild(interaction.guildId);
    if (rewardServer) {
        return executeRewardServer(interaction as Interaction & { guildId: string }, rewardServer, preview);
    }

    // Default flow
    return executeDefault(interaction, preview);
}

export { command, execute };
