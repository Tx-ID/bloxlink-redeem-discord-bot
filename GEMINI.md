# Project Overview

This project is a Discord bot for redeeming codes, built with TypeScript, Node.js, and the `discord.js` library. It uses `bun` as the runtime and package manager. The bot interacts with the Bloxlink API to verify users' Roblox accounts and uses MongoDB for database storage. The bot is designed to handle airdrops and reward claims.

## Key Technologies

*   **Runtime:** Bun
*   **Language:** TypeScript
*   **Frameworks:** Node.js, Express
*   **Libraries:**
    *   `discord.js`: For interacting with the Discord API.
    *   `mongoose`: As a MongoDB object modeling tool.
    *   `axios`: For making HTTP requests to the Bloxlink API.
    *   `dotenv`: For managing environment variables.
    *   `zod`: for schema validation.

## Architecture

The project follows a modular structure:

*   **`src/index.ts`**: The main entry point of the application. It initializes the Discord bot and an Express server.
*   **`src/bot/bot.ts`**: Contains the core bot logic, including command handling and event listeners.
*   **`src/config.ts`**: Manages configuration using environment variables with validation.
*   **`src/server/server.ts`**: An express server.
*   **`src/database/db.ts`**: Handles database interactions with MongoDB.
*   **`src/bot/commands`**: Contains the slash commands for the bot, organized into subdirectories by category.
*   **`src/database/migrations`**: Contains database migration scripts.

# Building and Running

## Prerequisites

*   Bun
*   Node.js
*   MongoDB

## Installation

1.  Install dependencies:

    ```bash
    bun install
    ```

## Running the Bot

1.  Create a `.env` file in the root of the project and add the following environment variables:

    ```
    DISCORD_BOT_TOKEN=
    DISCORD_BOT_CLIENT_ID=
    BLOXLINK_API_KEY=
    MONGO_CONNECTION_URL=
    ```

2.  Start the bot:

    ```bash
    bun run src
    ```

## Registering Slash Commands

To register or update the slash commands for all guilds the bot is in, run the following command:

```bash
bun run src --gen-commands
```

# Development Conventions

## Command Structure

Slash commands are located in the `src/bot/commands` directory. Each command file must export a `command` object (a `SlashCommandBuilder` instance) and an `execute` function.

## Database

The project uses MongoDB for its database. `mongoose` is used as the ODM. Database-related functions are in `src/database/db.ts`.

## Environment Variables

The project uses a `.env` file for environment variables. `src/config.ts` loads and validates these variables using `dotenv` and `zod`.
