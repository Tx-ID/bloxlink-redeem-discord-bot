import { ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, ComponentType, InteractionContextType, MessageFlags, MessagePayload, PermissionFlagsBits, SlashCommandBuilder, type APIEmbed, type ChatInputCommandInteraction, type Interaction, type Message, type MessageCreateOptions } from "discord.js";

import config from "../../../config";
import { getUserIdClaims, getUserIdEligibility, getRandomUnclaimedCode, addClaimData, getServerUserClaims, getServerRandomUnclaimedCode, addServerClaimData, getDiscordUserClaims, getServerDiscordUserClaims, getServerUserEligibility } from '../../../database/db';
import { getRobloxFromDiscordId, getRobloxFromDiscordIdWithFallback } from "../../../api/verification";
import { getRobloxUserFromUserId } from "../../../api/roblox";
import { doesUserHaveBadge } from "../../../api/roblox-badge";
import { getCodeLabel, getServerCodeLabel } from "../../../utils/codes";
import { getRewardServerByGuild, type RewardServerConfig } from "../../../config/reward-servers";
import { encryptUserId, waitForHtmlOpened, tryStartConsent, finishConsent } from "../../../utils/consent";
import { ClaimReason, ConsentMessage, DmStatus, ClaimTemplate } from "../../messages";

function canUsePreview(interaction: Interaction): boolean {
    if (config.PREVIEW_ALLOWED_USER_IDS.includes(interaction.user.id)) return true;
    if (interaction.isChatInputCommand() && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
    return false;
}

/**
 * Build the reward DM (embed + redeem button) for a reward server claim.
 * Pulled out so the standard flow and the Lazada consent flow can share it.
 */
function buildRewardDmPayload(server: RewardServerConfig, redeemCode: string, rewardType: string, opts: { preview?: boolean } = {}): MessagePayload | MessageCreateOptions {
    const redeemUrl = `https://gopay.co.id/app/myrewards?promo_code=${redeemCode}`;
    const lines = [
        "# 🎉 Selamat!",
        `## Kamu berhasil mendapatkan __${rewardType}__ dari event spesial ${server.eventTitle}! 🎊`,
        "",
        `🎟️ Kode Voucher: \`${redeemCode}\``,
        `📲 [Tukarkan langsung di aplikasi GoPay!](${redeemUrl})`,
        "",
        `⚠️ Perlu diingat kode voucher hanya dapat diclaim satu kali. Oleh karena itu, jangan berikan kode ini kesiapapun!`,
        "",
        "💡 Terima kasih sudah berpartisipasi!",
    ];

    const embed: APIEmbed = {
        title: opts.preview ? `[PREVIEW] ${server.eventTitle}` : server.eventTitle,
        color: 0xFFD700,
        description: lines.join('\n'),
        footer: { text: `Kode akan hangus apabila tidak ditukarkan sebelum ${server.codesExpiry}.` },
    };

    const redeemButton = new ButtonBuilder()
        .setLabel("Tukarkan di GoPay")
        .setStyle(ButtonStyle.Link)
        .setURL(redeemUrl)
        .setEmoji("📲");

    return {
        tts: false,
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(redeemButton)],
    };
}

/**
 * Resolve (or assign) a Roblox/Discord claim for a reward server.
 * Returns the redeem info on success, or an error message string for the user.
 */
async function resolveServerClaim(
    server: RewardServerConfig,
    robloxId: number,
    discordUserId: string,
    options: { skipBadgeCheck?: boolean } = {},
): Promise<{ ok: true; code: string; rewardType: string } | { ok: false; reason: string }> {
    const claimsByRoblox = await getServerUserClaims(server, robloxId);
    const claimsByDiscord = await getServerDiscordUserClaims(server, discordUserId);
    const claims = claimsByRoblox.length > 0 ? claimsByRoblox : claimsByDiscord;

    if (claims.length === 0) {
        let amount: number;

        if (server.usesEligibility) {
            // Eligibility-gated server (e.g. LAZADA): admin must mark user eligible
            // via /server/:server/set-eligibility before they can claim.
            const eligibilities = await getServerUserEligibility(server, robloxId);
            if (eligibilities.length === 0) {
                return { ok: false, reason: ClaimReason.NotEligible };
            }
            amount = eligibilities[0]!;
        } else {
            if (!options.skipBadgeCheck) {
                const badgeResult = await doesUserHaveBadge(robloxId, server.badgeId);
                if (badgeResult.rateLimited) return { ok: false, reason: ClaimReason.BadgeRateLimited };
                if (badgeResult.privateInventory) return { ok: false, reason: ClaimReason.BadgePrivateInventory };
                if (!badgeResult.hasBadge) return { ok: false, reason: ClaimReason.BadgeMissing };
            }
            const serverAmounts = Object.keys(server.codeTypes).map(Number);
            if (serverAmounts.length === 0) return { ok: false, reason: ClaimReason.NoCodeTypes };
            amount = serverAmounts[0]!;
        }

        const code = await getServerRandomUnclaimedCode(server, amount);
        if (!code) return { ok: false, reason: ClaimReason.NoCodeAvailable };

        await addServerClaimData(server, robloxId, amount, code, discordUserId);
        return { ok: true, code, rewardType: getServerCodeLabel(server, amount) };
    }

    const claim = claims[0]!;
    return { ok: true, code: claim.CodeUsed, rewardType: getServerCodeLabel(server, claim.Amount) };
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
            interaction.editReply({ content: DmStatus.PreviewRestricted }).catch(() => {});
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
                interaction.editReply({ content: DmStatus.PreviewSuccess }).catch(() => {});
            }).catch(() => {
                interaction.editReply({ content: DmStatus.PreviewFailed }).catch(() => {});
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
            content: ClaimReason.RobloxNotVerifiable
        }).catch(() => { console.log(`[${server.name}]: Interaction failed [2]`) });
        return;
    }

    // Check existing claims by Roblox ID and Discord ID first — skip badge check if already claimed
    const claimsByRoblox = await getServerUserClaims(server, Number(verification_data.robloxID));
    const claimsByDiscord = await getServerDiscordUserClaims(server, interaction.user.id);

    // Use whichever has an existing claim (resend the already-assigned code)
    const claims = claimsByRoblox.length > 0 ? claimsByRoblox : claimsByDiscord;

    // Only check badge if user hasn't claimed yet — no need to hit the API for returning users
    if (claims.length === 0) {
        const badgeResult = await doesUserHaveBadge(verification_data.robloxID, server.badgeId);
        if (badgeResult.rateLimited) {
            interaction.editReply({
                content: ClaimReason.BadgeRateLimited
            }).catch(() => { console.log(`[${server.name}]: Interaction failed [badge rate limit]`) });
            return;
        }
        if (badgeResult.privateInventory) {
            interaction.editReply({
                content: ClaimReason.BadgePrivateInventory
            }).catch(() => { console.log(`[${server.name}]: Interaction failed [private inventory]`) });
            return;
        }
        if (!badgeResult.hasBadge) {
            interaction.editReply({
                content: ClaimReason.BadgeMissing
            }).catch(() => { console.log(`[${server.name}]: Interaction failed [badge check]`) });
            return;
        }
    }

    try {
        // If no existing claim from either Roblox or Discord ID, assign a new code
        if (claims.length === 0) {
            const serverAmounts = Object.keys(server.codeTypes).map(Number);
            if (serverAmounts.length === 0) {
                interaction.editReply({
                    content: ClaimReason.NoCodeTypes
                }).catch(() => { console.log(`[${server.name}]: Interaction failed [no code types]`) });
                return;
            }

            const amount = serverAmounts[0]!;
            const code = await getServerRandomUnclaimedCode(server, amount);

            if (!code) {
                interaction.editReply({
                    content: ClaimReason.NoCodeAvailable
                }).catch(() => { console.log(`[${server.name}]: Interaction failed [assign code]`) });
                return;
            }

            await addServerClaimData(server, Number(verification_data.robloxID), amount, code, interaction.user.id);
            // Refresh claims after adding
            const updatedClaims = await getServerUserClaims(server, Number(verification_data.robloxID));
            claims.length = 0;
            claims.push(...updatedClaims);
        }

        const reward_type = claims.length > 0 ? getServerCodeLabel(server, claims[0]!.Amount) : "Reward";

        const redeemCode = claims.length >= 1 ? claims[0]!.CodeUsed : "";
        const redeemUrl = `https://gopay.co.id/app/myrewards?promo_code=${redeemCode}`;

        const lines = claims.length < 1 ? [
            ClaimReason.ProcessError,
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
                    content: DmStatus.Success,
                }).catch(() => { console.log(`[${server.name}]: Interaction failed [3]`) });
            }).catch(() => {
                interaction.editReply({
                    content: DmStatus.Failed,
                }).catch(() => { console.log(`[${server.name}]: Interaction failed [4]`) });
            });

    } catch {
        interaction.editReply({
            content: DmStatus.Failed,
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
            interaction.editReply({ content: DmStatus.PreviewRestricted }).catch(() => {});
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
                interaction.editReply({ content: DmStatus.PreviewSuccess }).catch(() => {});
            }).catch(() => {
                interaction.editReply({ content: DmStatus.PreviewFailed }).catch(() => {});
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
            content: ClaimReason.DefaultRobloxNotVerifiable
        }).catch(() => { console.log("Interaction failed [2]") });
        return;
    }

    const claimsByRoblox = await getUserIdClaims(Number(verification_data.robloxID));
    const claimsByDiscord = await getDiscordUserClaims(interaction.user.id);
    const claims = claimsByRoblox.length > 0 ? claimsByRoblox : claimsByDiscord;
    const eligibilities = await getUserIdEligibility(Number(verification_data.robloxID));

    try {
        // If user is eligible but has no claim, assign a code now
        if (eligibilities.length > 0 && claims.length === 0) {
            const amount = eligibilities[0]!;
            const code = await getRandomUnclaimedCode(amount);

            if (!code) {
                interaction.editReply({
                    content: ClaimReason.DefaultNoVoucherCode
                }).catch(() => { console.log("Interaction failed [assign code]") });
                return;
            }

            await addClaimData(Number(verification_data.robloxID), amount, code, interaction.user.id);
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
            ClaimReason.DefaultIneligible,
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
                    content: DmStatus.Success,
                }).catch(() => { console.log(`Interaction failed [3]`) });

            }).catch(() => {
                interaction.editReply({
                    content: DmStatus.Failed,
                }).catch(() => { console.log(`Interaction failed [4]`) });

            });

    } catch {
        interaction.editReply({
            content: DmStatus.Failed,
        }).catch(() => { console.log(`Interaction failed [5]`) });

    }
}

/**
 * /claim handler for reward servers that require a DM consent flow.
 * Flow: age check → T&C link (encrypted user id in `us` query) → Agree → claim.
 */
async function executeConsentServer(
    interaction: ChatInputCommandInteraction & { guildId: string },
    server: RewardServerConfig,
    preview = false,
) {
    // Preview is admin-only (matches the other flows).
    if (preview && !canUsePreview(interaction)) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        interaction.editReply({ content: DmStatus.PreviewRestricted }).catch(() => {});
        return;
    }

    // Per-user lock — only one consent flow in flight per Discord user.
    if (!tryStartConsent(interaction.user.id)) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        interaction.editReply({
            content: ConsentMessage.AlreadyInProgress,
        }).catch(() => {});
        return;
    }

    try {
        await executeConsentServerInner(interaction, server, preview);
    } finally {
        finishConsent(interaction.user.id);
    }
}

async function executeConsentServerInner(
    interaction: ChatInputCommandInteraction & { guildId: string },
    server: RewardServerConfig,
    preview: boolean,
) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // In preview, skip verification + returning-user short-circuit so admins
    // can repeatedly walk through the full age/T&C/agree flow.
    let robloxId = 0;
    if (!preview) {
        const verification_data = await getRobloxFromDiscordIdWithFallback(interaction.guildId, interaction.user.id);
        if (!verification_data || !verification_data.robloxID) {
            interaction.editReply({ content: server.verificationMessage }).catch(() => {});
            return;
        }
        robloxId = Number(verification_data.robloxID);

        const existingByRoblox = await getServerUserClaims(server, robloxId);
        const existingByDiscord = await getServerDiscordUserClaims(server, interaction.user.id);
        const alreadyClaimed = existingByRoblox.length > 0 || existingByDiscord.length > 0;

        if (alreadyClaimed) {
            const result = await resolveServerClaim(server, robloxId, interaction.user.id, { skipBadgeCheck: true });
            if (!result.ok) {
                interaction.editReply({ content: result.reason }).catch(() => {});
                return;
            }
            await interaction.user.send(buildRewardDmPayload(server, result.code, result.rewardType))
                .then(() => interaction.editReply({ content: DmStatus.Success }).catch(() => {}))
                .catch(() => interaction.editReply({ content: DmStatus.Failed }).catch(() => {}));
            return;
        }
    }

    // First-time claim: run the DM consent flow.
    let dmMessage: Message;
    try {
        dmMessage = await interaction.user.send({
            embeds: [{
                title: server.eventTitle,
                color: 0xFFD700,
                description: ConsentMessage.AgePrompt,
            }],
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId("consent:age:yes").setLabel("Ya, saya 16+").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("consent:age:no").setLabel("Tidak").setStyle(ButtonStyle.Secondary),
            )],
        });
    } catch {
        interaction.editReply({ content: DmStatus.Failed }).catch(() => {});
        return;
    }
    interaction.editReply({ content: DmStatus.CheckDms }).catch(() => {});

    // 1. Age gate
    let ageClick;
    try {
        ageClick = await dmMessage.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith("consent:age:"),
            time: config.CONSENT_TIMEOUT_MS,
        });
    } catch {
        dmMessage.edit({ components: [] }).catch(() => {});
        return;
    }
    if (ageClick.customId === "consent:age:no") {
        await ageClick.update({
            embeds: [{ title: server.eventTitle, color: 0xCC3333, description: ConsentMessage.AgeRejected }],
            components: [],
        });
        return;
    }

    // 2. Terms link — encrypt the Discord user ID into `us`
    const termsDoc = server.termsDocName ?? "terms";
    const baseUrl = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
    if (!baseUrl) {
        console.error(`[${server.name}]: PUBLIC_BASE_URL env var is not set; consent flow cannot build a valid terms URL.`);
        await ageClick.update({
            embeds: [{ title: server.eventTitle, color: 0xCC3333, description: ConsentMessage.ConfigError }],
            components: [],
        });
        return;
    }
    const usToken = encryptUserId(interaction.user.id);
    const termsUrl = `${baseUrl}/docs/${termsDoc}?us=${encodeURIComponent(usToken)}`;

    await ageClick.update({
        embeds: [{
            title: server.eventTitle,
            color: 0xFFD700,
            description: ConsentMessage.TermsPrompt,
        }],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel("Buka Syarat & Ketentuan").setStyle(ButtonStyle.Link).setURL(termsUrl).setEmoji("📄"),
        )],
    });

    // 3. Wait for the docs page to be opened (server notifies via the bridge).
    const opened = await waitForHtmlOpened(interaction.user.id, config.HTML_OPEN_WAIT_MS);
    if (!opened) {
        dmMessage.edit({
            embeds: [{ title: server.eventTitle, color: 0xCC3333, description: ConsentMessage.TermsTimeout }],
            components: [],
        }).catch(() => {});
        return;
    }

    // 4. Agree / Disagree
    const agreePrompt = await interaction.user.send({
        embeds: [{
            title: server.eventTitle,
            color: 0xFFD700,
            description: ConsentMessage.AgreePrompt,
        }],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("consent:terms:agree").setLabel("Setuju").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("consent:terms:disagree").setLabel("Tidak Setuju").setStyle(ButtonStyle.Secondary),
        )],
    }).catch(() => null);

    if (!agreePrompt) return;

    let agreeClick;
    try {
        agreeClick = await agreePrompt.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith("consent:terms:"),
            time: config.CONSENT_TIMEOUT_MS,
        });
    } catch {
        agreePrompt.edit({ components: [] }).catch(() => {});
        return;
    }
    if (agreeClick.customId === "consent:terms:disagree") {
        await agreeClick.update({
            embeds: [{ title: server.eventTitle, color: 0xCC3333, description: ConsentMessage.Disagreed }],
            components: [],
        });
        return;
    }

    // 5. Proceed with the standard reward-server claim logic (badge check + code assign).
    await agreeClick.update({
        embeds: [{ title: server.eventTitle, color: 0xFFD700, description: ConsentMessage.Processing }],
        components: [],
    });

    if (preview) {
        // Skip DB + eligibility + code-pool entirely; DM a [PREVIEW] reward.
        const reward_type = Object.values(server.codeTypes)[0] ?? "Reward";
        await interaction.user.send(
            buildRewardDmPayload(server, "TESTCODE-XXXX-0000", reward_type, { preview: true })
        ).catch(() => {});
        return;
    }

    const result = await resolveServerClaim(server, robloxId, interaction.user.id);
    if (!result.ok) {
        interaction.user.send({
            embeds: [{ title: server.eventTitle, color: 0xCC3333, description: result.reason }],
        }).catch(() => {});
        return;
    }

    await interaction.user.send(buildRewardDmPayload(server, result.code, result.rewardType)).catch(() => {});
}

async function execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) return;

    const preview = interaction.options.getBoolean("preview") ?? false;

    // Check if this guild is a registered reward server
    const rewardServer = getRewardServerByGuild(interaction.guildId);
    if (rewardServer) {
        // If the server pins a channel ID, enforce it.
        if (rewardServer.channelId && interaction.channelId !== rewardServer.channelId) {
            interaction.reply({
                content: ClaimTemplate.wrongChannel(rewardServer.channelId),
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
            return;
        }

        if (rewardServer.requiresConsent) {
            return executeConsentServer(interaction as ChatInputCommandInteraction & { guildId: string }, rewardServer, preview);
        }
        return executeRewardServer(interaction as Interaction & { guildId: string }, rewardServer, preview);
    }

    // Default flow
    return executeDefault(interaction, preview);
}

export { command, execute };
