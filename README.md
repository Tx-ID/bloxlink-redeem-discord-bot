# Bloxlink Redeem Discord Bot

A Discord bot for distributing voucher/reward codes to verified Roblox users. Supports Bloxlink and Chitose as verification providers, with per-server reward configurations for badge-gated code distribution.

## Setup

```bash
npm install
```

Copy `.env` and fill in the required values (see Configuration below), then:

```bash
# Development
npm run dev

# Production
npm run build
npm start

# Register slash commands
npm run refresh

# Migrate from legacy lowdb to MongoDB
npm run migrate
```

## Configuration

### Core Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `DISCORD_BOT_CLIENT_ID` | Yes | Discord bot application/client ID |
| `MONGO_CONNECTION_URL` | Yes | MongoDB connection string (default: `mongodb://127.0.0.1:27017/akri`) |
| `BEARER_KEY` | Yes | Bearer token for admin REST API authentication |
| `CODES_FOLDERNAME` | No | Directory containing code CSV files (default: `testcodes`) |
| `CODE_TYPES` | No | JSON mapping amounts to labels, e.g. `{"2000":"Voucher Rp 2.000"}` |
| `CODES_EXPIRY` | No | Expiry date text shown in DM embeds |
| `EVENT_TITLE` | No | Title shown in Discord embed for the default server |
| `VERIFICATION_PROVIDER` | No | `BLOXLINK` or `CHITOSE` (default: `BLOXLINK`) |
| `VERIFICATION_MESSAGE` | No | Error message when user is not verified |
| `BLOXLINK_API_KEY` | If using Bloxlink | Bloxlink API key |
| `CHITOSE_API_KEY` | If using Chitose | Chitose API key |
| `PORT` | No | REST API server port (default: `5478`) |

### Code Files

Codes are stored as CSV files with one code per line, placed in the folder specified by `CODES_FOLDERNAME`. The filename must match the amount key defined in `CODE_TYPES`.

For example, with `CODE_TYPES={"2000":"Voucher Rp 2.000","10000":"Cashback Rp 10.000"}`:

```
codes/
  2000.csv
  10000.csv
```

## How `/claim` Works

When a user runs `/claim` in a Discord server:

1. The bot verifies their Roblox identity via Bloxlink or Chitose
2. Checks if the user is eligible for a reward (via the eligibility database)
3. If eligible and unclaimed, assigns a random code from the CSV pool
4. Sends the code as a private DM embed with redemption instructions

## Reward Servers

Reward servers are Discord servers with special `/claim` behavior: instead of eligibility-based distribution, the bot checks whether the user owns a specific Roblox badge and uses a separate code pool.

Reward servers use a Bloxlink-first, Chitose-fallback verification flow (independent of the global `VERIFICATION_PROVIDER` setting).

### PELANGI (Hardcoded)

PELANGI is a built-in reward server. Configure it with `PELANGI_*` env vars:

| Variable | Required | Description |
|---|---|---|
| `PELANGI_GUILD_ID` | Yes | Discord server ID |
| `PELANGI_BADGE_ID` | Yes | Roblox badge ID the user must own |
| `PELANGI_CODES_FOLDERNAME` | No | Code CSV folder (default: `pelangi_codes`) |
| `PELANGI_CODE_TYPES` | No | JSON amount→label mapping |
| `PELANGI_CODES_EXPIRY` | No | Expiry text for the DM embed |
| `PELANGI_EVENT_TITLE` | No | Embed title (default: `PELANGI Event`) |
| `PELANGI_VERIFICATION_MESSAGE` | No | Error message when user is not verified |

Place PELANGI's code CSVs in the folder specified by `PELANGI_CODES_FOLDERNAME`:

```
pelangi_codes/
  2000.csv
```

### Adding Dynamic Reward Servers

To add more reward servers without code changes, list them in `REWARD_SERVERS` (comma-separated) and define their `{NAME}_*` env vars.

Example — adding two new servers called AURORA and BINTANG:

```env
REWARD_SERVERS=AURORA,BINTANG

AURORA_GUILD_ID=111111111111111111
AURORA_BADGE_ID=123456789
AURORA_CODES_FOLDERNAME=aurora_codes
AURORA_CODE_TYPES={"5000":"Aurora Reward Rp 5.000"}
AURORA_CODES_EXPIRY=30 Juni 2026
AURORA_EVENT_TITLE=Aurora Badge Event
AURORA_VERIFICATION_MESSAGE=Harap hubungkan akun Roblox anda terlebih dahulu.

BINTANG_GUILD_ID=222222222222222222
BINTANG_BADGE_ID=987654321
BINTANG_CODES_FOLDERNAME=bintang_codes
BINTANG_CODE_TYPES={"2000":"Bintang Voucher Rp 2.000"}
BINTANG_CODES_EXPIRY=31 Desember 2026
BINTANG_EVENT_TITLE=Bintang Event
```

Then place each server's code CSVs in their respective folders:

```
aurora_codes/
  5000.csv
bintang_codes/
  2000.csv
```

Each dynamic reward server gets its own MongoDB collection (`{Name}Claim`) for claim tracking, so data is fully isolated.

### Reward Server Env Var Reference

Every reward server (hardcoded or dynamic) uses the same set of prefixed variables:

| Suffix | Required | Default | Description |
|---|---|---|---|
| `_GUILD_ID` | Yes | — | Discord server ID to match |
| `_BADGE_ID` | Yes | — | Roblox badge ID the user must own |
| `_CODES_FOLDERNAME` | No | `{name}_codes` | Directory for code CSV files |
| `_CODE_TYPES` | No | `{}` | JSON amount→label mapping |
| `_CODES_EXPIRY` | No | `TBD` | Expiry text shown in embed footer |
| `_EVENT_TITLE` | No | `{NAME} Event` | Embed title |
| `_VERIFICATION_MESSAGE` | No | Generic message | Error when user is not verified |

## Admin REST API

All endpoints require `Authorization: Bearer {BEARER_KEY}`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/set-eligibility` | Set user eligible + auto-assign code (v1) |
| `POST` | `/v2/set-eligibility` | Set user eligible without auto-assign (v2) |
| `DELETE` | `/delete-eligibility` | Remove a user's eligibility and claims |
| `DELETE` | `/reset-claimed` | Clear all claims (keeps eligibility) |
| `DELETE` | `/reset-all-database` | Full database reset |
| `GET` | `/claim-list` | Download CSV of all claims |
| `GET` | `/unclaimed-list` | Download CSV of unclaimed codes |
| `GET` | `/eligibility-report` | Download CSV joining eligibility with claims |

The `set-eligibility`, `reset-claimed`, and `reset-all-database` endpoints support a `dry` body parameter for previewing what would change.

## Project Structure

```
src/
  config.ts                         Global config (env vars)
  config/
    reward-servers.ts               Reward server registry (hardcoded + dynamic)
  index.ts                          Entry point
  api/
    bloxlink.ts                     Bloxlink API client
    chitose.ts                      Chitose API client
    roblox.ts                       Roblox user API client
    roblox-badge.ts                 Roblox badge ownership check
    verification.ts                 Verification provider router + fallback
  bot/
    bot.ts                          Discord bot setup
    commands/
      roblox/
        claim-rewards.ts            /claim command (default + reward server)
      utility/
        ping.ts                     /ping command
  database/
    db.ts                           MongoDB models + per-server dynamic models
    migrations/
      mongo.ts                      lowdb → MongoDB migration
  server/
    server.ts                       Express admin API
  utils/
    cache.ts                        Simple in-memory TTL cache
    codes.ts                        CSV code loader (default + per-server)
```
