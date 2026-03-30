import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export interface RewardServerConfig {
    /** Internal name, e.g. "PELANGI" */
    name: string;
    /** Discord guild ID this config applies to */
    guildId: string;
    /** Roblox badge ID the user must own to claim */
    badgeId: number;
    /** Folder containing the CSV code files for this server */
    codesFoldername: string;
    /** Map of amount → label, e.g. { 2000: "Voucher Rp 2.000" } */
    codeTypes: Record<number, string>;
    /** Human-readable expiry string shown in the embed footer */
    codesExpiry: string;
    /** Title shown in the Discord embed */
    eventTitle: string;
    /** Message shown when verification fails */
    verificationMessage: string;
}

/** Map of guildId → RewardServerConfig (for fast lookup in commands) */
const rewardServersByGuild = new Map<string, RewardServerConfig>();

/** Map of name → RewardServerConfig (for admin / debugging) */
const rewardServersByName = new Map<string, RewardServerConfig>();

// =============================================
// Hardcoded reward servers
// =============================================

/**
 * Hardcoded server names that are always loaded from their
 * own {NAME}_* env vars, independent of REWARD_SERVERS.
 */
const HARDCODED_SERVERS = ["PELANGI"] as const;

// =============================================
// Shared loader
// =============================================

function tryRegisterServer(name: string, source: "hardcoded" | "dynamic"): void {
    const prefix = `${name}_`;
    const guildId = process.env[`${prefix}GUILD_ID`];
    const badgeIdStr = process.env[`${prefix}BADGE_ID`];
    const codesFoldername = process.env[`${prefix}CODES_FOLDERNAME`] || `${name.toLowerCase()}_codes`;
    const codeTypesStr = process.env[`${prefix}CODE_TYPES`];
    const codesExpiry = process.env[`${prefix}CODES_EXPIRY`] ?? "TBD";
    const eventTitle = process.env[`${prefix}EVENT_TITLE`] ?? `${name} Event`;
    const verificationMessage = process.env[`${prefix}VERIFICATION_MESSAGE`]
        ?? "Maaf anda belum memenuhi syarat. Harap hubungkan akun Roblox anda ke Bloxlink atau Chitose untuk verifikasi.";

    if (!guildId) {
        if (source === "dynamic") {
            console.warn(`[RewardServers]: Skipping "${name}" — missing ${prefix}GUILD_ID`);
        }
        // Silently skip hardcoded servers with no guild ID (not configured yet)
        return;
    }
    if (!badgeIdStr) {
        console.warn(`[RewardServers]: Skipping "${name}" — missing ${prefix}BADGE_ID`);
        return;
    }

    const badgeId = Number(badgeIdStr);
    if (isNaN(badgeId)) {
        console.warn(`[RewardServers]: Skipping "${name}" — invalid ${prefix}BADGE_ID`);
        return;
    }

    let codeTypes: Record<number, string> = {};
    if (codeTypesStr) {
        try {
            codeTypes = JSON.parse(codeTypesStr);
        } catch {
            console.warn(`[RewardServers]: "${name}" has invalid ${prefix}CODE_TYPES JSON, using empty`);
        }
    }

    const config: RewardServerConfig = {
        name,
        guildId,
        badgeId,
        codesFoldername,
        codeTypes,
        codesExpiry,
        eventTitle,
        verificationMessage,
    };

    rewardServersByGuild.set(guildId, config);
    rewardServersByName.set(name, config);
    console.log(`[RewardServers]: Loaded ${source} reward server "${name}" for guild ${guildId}`);
}

function loadAllRewardServers(): void {
    // 1. Always load hardcoded servers (PELANGI, etc.)
    for (const name of HARDCODED_SERVERS) {
        tryRegisterServer(name, "hardcoded");
    }

    // 2. Load dynamic servers from REWARD_SERVERS env var
    const raw = process.env.REWARD_SERVERS ?? "";
    const dynamicNames = raw.split(",").map(s => s.trim()).filter(Boolean);

    for (const name of dynamicNames) {
        // Skip if already registered as a hardcoded server
        if (rewardServersByName.has(name)) {
            console.warn(`[RewardServers]: "${name}" is already registered (hardcoded), skipping dynamic entry`);
            continue;
        }
        tryRegisterServer(name, "dynamic");
    }
}

// Load on import
loadAllRewardServers();

// =============================================
// Public API
// =============================================

/**
 * Look up a reward server config by Discord guild ID.
 * Returns undefined if the guild is not a reward server.
 */
export function getRewardServerByGuild(guildId: string): RewardServerConfig | undefined {
    return rewardServersByGuild.get(guildId);
}

/**
 * Look up a reward server config by name (e.g. "PELANGI").
 */
export function getRewardServerByName(name: string): RewardServerConfig | undefined {
    return rewardServersByName.get(name);
}

/**
 * Get all registered reward server configs.
 */
export function getAllRewardServers(): RewardServerConfig[] {
    return Array.from(rewardServersByName.values());
}
