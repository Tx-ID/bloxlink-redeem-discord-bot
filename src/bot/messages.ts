/**
 * User-facing strings for the /claim flow. Grouped as `as const` objects so
 * each behaves like a string-valued enum (typed, autocompletable, and
 * narrow-typed where it matters).
 *
 * Keep Bahasa Indonesia wording consistent across entries — this is the
 * single place to edit any of these reasons.
 */

/** Reasons a /claim attempt was refused. Surfaced verbatim to the user. */
export const ClaimReason = {
    BadgeRateLimited:
        "Maaf, pengecekan badge sedang mengalami gangguan. Silakan coba lagi dalam beberapa menit.",
    BadgePrivateInventory:
        "Maaf, inventory Roblox kamu sedang di-private. Silakan ubah pengaturan inventory kamu menjadi publik terlebih dahulu, lalu coba lagi.",
    BadgeMissing:
        "Maaf, kamu belum memiliki badge yang diperlukan untuk melakukan claim reward ini.",
    NoCodeTypes:
        "Maaf, kode reward belum tersedia. Silakan hubungi admin.",
    NoCodeAvailable:
        "Maaf, kode reward sedang tidak tersedia. Silakan hubungi admin.",
    NotEligible:
        "Maaf, kamu belum terdaftar sebagai eligible untuk claim reward ini. Silakan hubungi admin.",
    NothingToClaim:
        "Nothing to claim!",
    RobloxNotVerifiable:
        "Maaf, akun Roblox anda tidak dapat diverifikasi.",
    ProcessError:
        "Maaf, terjadi kesalahan saat memproses claim anda.",
    // Default (non-reward-server) flow uses slightly different phrasing.
    DefaultRobloxNotVerifiable:
        "Maaf anda belum memenuhi syarat untuk melakukan claim airdrop. Akun Roblox anda tidak dapat diverifikasi.",
    DefaultNoVoucherCode:
        "Maaf, kode voucher sedang tidak tersedia. Silakan hubungi admin.",
    DefaultIneligible:
        "Maaf anda belum bisa melakukan claim.",
} as const;

/** Multi-step DM consent flow prompts and outcomes. */
export const ConsentMessage = {
    AlreadyInProgress:
        "Kamu masih memiliki prompt yang belum selesai. Mohon selesaikan prompt sebelumnya di DM sebelum mencoba lagi.",
    AgePrompt:
        "Sebelum melanjutkan, apakah kamu berusia 16 tahun atau lebih?",
    AgeRejected:
        "Maaf, kamu harus berusia 16 tahun atau lebih untuk melanjutkan.",
    TermsPrompt:
        "Silakan baca **Syarat & Ketentuan** terlebih dahulu sebelum melanjutkan. Klik tombol di bawah untuk membukanya.",
    TermsTimeout:
        "Waktu habis. Jalankan kembali `/claim` jika kamu masih ingin melanjutkan.",
    AgreePrompt:
        "Apakah kamu menyetujui Syarat & Ketentuan yang telah dibaca?",
    Disagreed:
        "Kamu tidak menyetujui Syarat & Ketentuan. Claim dibatalkan.",
    Processing:
        "Memproses claim kamu...",
    ConfigError:
        "Maaf, terjadi kesalahan konfigurasi. Silakan hubungi admin.",
} as const;

/** Interaction-reply boilerplate (mostly DM-related status messages). */
export const DmStatus = {
    Success:
        "Success. Please check your Direct Messages.",
    Failed:
        "Failed to send direct-message, please allow direct messages from this server.",
    CheckDms:
        "Please check your Direct Messages to continue.",
    PreviewSuccess:
        "Preview DM sent. Check your Direct Messages.",
    PreviewFailed:
        "Failed to send DM. Please allow direct messages from this server.",
    PreviewRestricted:
        "Preview mode is restricted to administrators.",
} as const;

/** Templates that need runtime values. */
export const ClaimTemplate = {
    wrongChannel: (channelId: string): string =>
        `Silakan gunakan \`/claim\` di channel <#${channelId}>.`,
} as const;
