import crypto from "crypto";

// =============================================
// Encrypted-ID token (AES-256-GCM, base64url)
// =============================================
// Used to embed the Discord user ID in a public-facing URL (e.g.
// /docs/lazadaterms?us=<token>) without exposing the raw ID. The
// server decrypts the token on access and notifies the bridge below.

const ALGO = "aes-256-gcm";
const RAW_KEY = process.env.CONSENT_ENCRYPTION_KEY ?? "dev-only-default-change-me";
const KEY = crypto.scryptSync(RAW_KEY, "consent-token-v1", 32);

export function encryptUserId(userId: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, KEY, iv);
    const enc = Buffer.concat([cipher.update(userId, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptUserId(token: string): string | null {
    try {
        const buf = Buffer.from(token, "base64url");
        if (buf.length < 12 + 16 + 1) return null;
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const enc = buf.subarray(28);
        const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
        return dec;
    } catch {
        return null;
    }
}

// =============================================
// HTML-page-opened bridge
// =============================================
// The Express docs route calls notifyHtmlOpened(userId) when a /docs
// page is fetched with a valid `us` query token. The bot awaits
// waitForHtmlOpened(userId, ms) and resolves when that fires (or
// false on timeout). Single-process only — bot and server share memory.

type Resolver = (opened: boolean) => void;
const pendingHtmlOpens = new Map<string, Resolver>();

export function waitForHtmlOpened(userId: string, timeoutMs: number): Promise<boolean> {
    const safeTimeout = Math.max(timeoutMs, 0);

    return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
            if (pendingHtmlOpens.get(userId) === wrapped) {
                pendingHtmlOpens.delete(userId);
            }
            resolve(false);
        }, safeTimeout);

        const wrapped: Resolver = (opened) => {
            clearTimeout(timer);
            pendingHtmlOpens.delete(userId);
            resolve(opened);
        };
        pendingHtmlOpens.set(userId, wrapped);
    });
}

export function notifyHtmlOpened(userId: string): boolean {
    const resolver = pendingHtmlOpens.get(userId);
    if (!resolver) return false;
    resolver(true);
    return true;
}

// =============================================
// Per-user consent-flow lock
// =============================================
// Prevents a single user from stacking multiple in-flight consent
// flows. Acquire at the start of executeConsentServer and release in
// a `finally` block. If acquisition fails, tell the user to finish
// their existing prompt before retrying.

const activeConsentUsers = new Set<string>();

export function tryStartConsent(userId: string): boolean {
    if (activeConsentUsers.has(userId)) return false;
    activeConsentUsers.add(userId);
    return true;
}

export function finishConsent(userId: string): void {
    activeConsentUsers.delete(userId);
    // Also cancel any pending html-opened waiter so it resolves cleanly.
    const resolver = pendingHtmlOpens.get(userId);
    if (resolver) resolver(false);
}
