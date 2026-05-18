import * as z from "zod";
import { createDocument } from "zod-openapi";
import { getAllRewardServers } from "../config/reward-servers";

// =============================================
// Reusable component schemas
// Schemas with .meta({ id }) are emitted under components/schemas
// =============================================

export const UserIdSchema = z
    .int({ error: "Invalid UserId" })
    .positive({ error: "UserId must be positive." })
    .meta({
        id: "UserId",
        description: "Roblox user ID (positive integer).",
        example: 1234567890,
    });

export const AmountSchema = z
    .int({ error: "Invalid Amount" })
    .positive({ error: "Amount must be positive" })
    .meta({
        id: "Amount",
        description: "Code denomination (e.g. 2000, 5000, 10000).",
        example: 2000,
    });

export const DryFlagSchema = z
    .coerce.boolean()
    .nullable()
    .meta({
        id: "DryFlag",
        description: "If true, simulate the operation without persisting changes.",
        example: false,
    });

// =============================================
// Request body schemas
// =============================================

export const DeleteEligibilityBody = z
    .object({ UserId: UserIdSchema })
    .meta({ id: "DeleteEligibilityBody" });

export const ResetBody = z
    .object({ dry: DryFlagSchema.optional() })
    .meta({ id: "ResetBody" });

export const SetEligibilityBody = z
    .object({
        UserId: UserIdSchema,
        Amount: AmountSchema,
        dry: DryFlagSchema.optional(),
    })
    .meta({ id: "SetEligibilityBody" });

export const DeleteClaimBody = z
    .object({ UserId: UserIdSchema })
    .meta({ id: "DeleteClaimBody" });

// =============================================
// Response schemas
// =============================================

const ErrorResponse = z
    .object({ error: z.string() })
    .meta({ id: "ErrorResponse" });

const MessageResponse = z
    .object({
        message: z.string(),
        data: z.unknown().optional(),
    })
    .meta({ id: "MessageResponse" });

const StatsResponse = z
    .object({
        server: z.string(),
        totalClaimedUsers: z.number().int(),
        codes: z.record(
            z.string(),
            z.object({
                total: z.number().int(),
                claimed: z.number().int(),
                remaining: z.number().int(),
            }),
        ),
    })
    .meta({ id: "StatsResponse" });

// =============================================
// Path parameter schemas
// =============================================

const rewardServerNames = getAllRewardServers().map((s) => s.name);
const ServerNameParam = z
    .string()
    .meta({
        description: "Reward server identifier (e.g. PELANGI).",
        example: rewardServerNames[0] ?? "PELANGI",
        ...(rewardServerNames.length > 0 ? { enum: rewardServerNames } : {}),
    });

// =============================================
// Shared response building blocks
// =============================================

const jsonError = (description: string) => ({
    description,
    content: { "application/json": { schema: ErrorResponse } },
});

const jsonMessage = (description: string) => ({
    description,
    content: { "application/json": { schema: MessageResponse } },
});

const csvDownload = (description: string) => ({
    description,
    content: {
        "text/csv": {
            schema: z.string().meta({ description: "CSV file body." }),
        },
    },
});

const commonAuthResponses = {
    "400": jsonError("Validation error or business-rule violation."),
    "401": jsonError("Missing or invalid Bearer token."),
    "500": jsonError("Internal server error."),
};

const bearerAuth = [{ bearerAuth: [] }];

// =============================================
// OpenAPI document
// =============================================

export const openApiDocument = createDocument({
    openapi: "3.1.0",
    info: {
        title: "Bloxlink Redeem Bot — Admin API",
        version: "1.0.0",
        description:
            "Internal administrative endpoints for managing redeem-code eligibility, claims, and reward-server state. All endpoints require a Bearer token (`BEARER_KEY`).",
    },
    servers: [
        { url: "/", description: "This server" },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                description: "Static admin key configured via `BEARER_KEY`.",
            },
        },
    },
    security: bearerAuth,
    tags: [
        { name: "Eligibility", description: "User eligibility management." },
        { name: "Claims", description: "Code claim reporting and reset." },
        { name: "Reports", description: "CSV exports." },
        { name: "Reward Servers", description: "Per-reward-server endpoints (e.g. PELANGI)." },
    ],
    paths: {
        "/delete-eligibility": {
            delete: {
                tags: ["Eligibility"],
                summary: "Remove a user's eligibility and claim data",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: DeleteEligibilityBody } },
                },
                responses: {
                    "200": jsonMessage("Eligibility removed."),
                    ...commonAuthResponses,
                },
            },
        },
        "/reset-all-database": {
            delete: {
                tags: ["Claims"],
                summary: "Wipe the entire claim + eligibility database",
                description: "Destructive. Pass `dry: true` to preview row counts without deleting.",
                requestBody: {
                    required: false,
                    content: { "application/json": { schema: ResetBody } },
                },
                responses: {
                    "200": jsonMessage("Database reset (or dry-run preview)."),
                    ...commonAuthResponses,
                },
            },
        },
        "/reset-claimed": {
            delete: {
                tags: ["Claims"],
                summary: "Reset claimed codes only (keep eligibility records)",
                requestBody: {
                    required: false,
                    content: { "application/json": { schema: ResetBody } },
                },
                responses: {
                    "200": jsonMessage("Claimed codes reset (or dry-run preview)."),
                    ...commonAuthResponses,
                },
            },
        },
        "/unclaimed-list": {
            get: {
                tags: ["Reports"],
                summary: "Download unclaimed codes as CSV",
                responses: {
                    "200": csvDownload("CSV file of unclaimed codes grouped by amount."),
                    ...commonAuthResponses,
                },
            },
        },
        "/claim-list": {
            get: {
                tags: ["Reports"],
                summary: "Download the user claim list as CSV",
                responses: {
                    "200": csvDownload("CSV file of users with their claimed codes."),
                    ...commonAuthResponses,
                },
            },
        },
        "/eligibility-report": {
            get: {
                tags: ["Reports"],
                summary: "Download an eligibility-vs-claim report as CSV",
                responses: {
                    "200": csvDownload("CSV file joining eligibility with claim status."),
                    ...commonAuthResponses,
                },
            },
        },
        "/set-eligibility": {
            post: {
                tags: ["Eligibility"],
                summary: "Mark a user as eligible and assign a code (legacy)",
                description:
                    "Legacy endpoint. Assigns a random unclaimed code to the user. Use `/v2/set-eligibility` for new integrations.",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: SetEligibilityBody } },
                },
                responses: {
                    "200": jsonMessage("Eligibility set (or dry-run preview)."),
                    ...commonAuthResponses,
                },
            },
        },
        "/v2/set-eligibility": {
            post: {
                tags: ["Eligibility"],
                summary: "Mark a user as eligible (v2 — defers code assignment)",
                description:
                    "Rejects the request if there are not enough codes available for all eligible users. Does not assign a code at this time.",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: SetEligibilityBody } },
                },
                responses: {
                    "200": jsonMessage("Eligibility set (or dry-run preview)."),
                    ...commonAuthResponses,
                },
            },
        },
        "/server/{server}/set-eligibility": {
            post: {
                tags: ["Reward Servers"],
                summary: "Mark a user as eligible on a specific reward server",
                description:
                    "Server-scoped variant of `/v2/set-eligibility`. Writes to the reward server's own eligibility collection (e.g. `LAZADAEligibility`) and validates against that server's code pool. Use this for servers with `usesEligibility: true` (e.g. LAZADA).",
                requestParams: { path: z.object({ server: ServerNameParam }) },
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: SetEligibilityBody } },
                },
                responses: {
                    "200": jsonMessage("Eligibility set (or dry-run preview)."),
                    "404": jsonError("Unknown reward server."),
                    ...commonAuthResponses,
                },
            },
        },
        "/server/{server}/claim-list": {
            get: {
                tags: ["Reward Servers"],
                summary: "Download per-server claim list as CSV",
                requestParams: { path: z.object({ server: ServerNameParam }) },
                responses: {
                    "200": csvDownload("CSV of claims for the given reward server."),
                    "404": jsonError("Unknown reward server."),
                    ...commonAuthResponses,
                },
            },
        },
        "/server/{server}/unclaimed-list": {
            get: {
                tags: ["Reward Servers"],
                summary: "Download per-server unclaimed codes as CSV",
                requestParams: { path: z.object({ server: ServerNameParam }) },
                responses: {
                    "200": csvDownload("CSV of unclaimed codes for the given reward server."),
                    "404": jsonError("Unknown reward server."),
                    ...commonAuthResponses,
                },
            },
        },
        "/server/{server}/reset-claims": {
            delete: {
                tags: ["Reward Servers"],
                summary: "Reset claims for a specific reward server",
                requestParams: { path: z.object({ server: ServerNameParam }) },
                requestBody: {
                    required: false,
                    content: { "application/json": { schema: ResetBody } },
                },
                responses: {
                    "200": jsonMessage("Per-server claims reset (or dry-run preview)."),
                    "404": jsonError("Unknown reward server."),
                    ...commonAuthResponses,
                },
            },
        },
        "/server/{server}/delete-claim": {
            delete: {
                tags: ["Reward Servers"],
                summary: "Remove a single user's claim on a reward server",
                requestParams: { path: z.object({ server: ServerNameParam }) },
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: DeleteClaimBody } },
                },
                responses: {
                    "200": jsonMessage("Claim removed (or no-op if none existed)."),
                    "404": jsonError("Unknown reward server."),
                    ...commonAuthResponses,
                },
            },
        },
        "/server/{server}/stats": {
            get: {
                tags: ["Reward Servers"],
                summary: "Per-server claim and code stats",
                requestParams: { path: z.object({ server: ServerNameParam }) },
                responses: {
                    "200": {
                        description: "Stats payload.",
                        content: { "application/json": { schema: StatsResponse } },
                    },
                    "404": jsonError("Unknown reward server."),
                    ...commonAuthResponses,
                },
            },
        },
    },
});
