import mongoose from 'mongoose';
import { JSONFilePreset } from 'lowdb/node';
import type { Low } from 'lowdb';
import fs from 'fs';
import path from 'path';

// --- Import your NEW Mongoose models and connection function ---
// (Make sure the path is correct)
import { 
    initializeDatabase as connectToMongo, 
    EligibilityModel, 
    ClaimModel 
} from '../db'; // This is your new Mongoose 'db.ts' file

// --- Import your OLD config to find the db file ---
// (Make sure the path is correct)
import config from '../../config';

// ===================================================================
// !! IMPORTANT !!
// This script assumes your OLD config.ts file has the DB_FILENAME
// and your NEW config.ts has the DB_CONNECTION_STRING.
//
// If you've already deleted the old config, just set the path manually:
// const OLD_DB_FILE_PATH = 'dbs/your-old-db-name.json';
// ===================================================================
const OLD_DB_FILE_PATH = path.join('dbs', config.DB_FILENAME);


// --- Old Type Definitions (Copied from original code) ---
// We need these to correctly read the old JSON file.

type OldClaimData = {
    UserId: number,
    Timestamp: number,
    Amount: number,
    CodeUsed: string,
};

type OldElibilityUserData = {
    UserId: number,
    EligibleList: number[],
};

type OldClaimUserData = {
    UserId: number,
    ClaimList: OldClaimData[],
}

type OldData = {
    Eligibilities: OldElibilityUserData[],
    Claims: OldClaimUserData[],
};

// --- Migration Logic ---

/**
 * Loads the old lowdb JSON file from disk.
 */
async function loadOldDb(filePath: string): Promise<OldData> {
    console.log(`Attempting to load old database from: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
        console.error(`--- ❌ ERROR ---`);
        console.error(`Old database file not found at: ${filePath}`);
        console.error(`Please make sure the path is correct in migrate.ts`);
        throw new Error(`File not found: ${filePath}`);
    }
    
    // Default data is just a fallback for types, won't be used if file exists
    const defaultData: OldData = { Eligibilities: [], Claims: [] };
    const db: Low<OldData> = await JSONFilePreset<OldData>(filePath, defaultData);
    
    // We only need the data snapshot
    return db.data;
}

/**
 * The main migration script
 */
async function runMigration() {
    console.log('--- 🚀 Starting Data Migration ---');

    try {
        // --- Step 1: Load Old Data from JSON File ---
        const oldData = await loadOldDb(OLD_DB_FILE_PATH);
        console.log(`[LOAD] ✔️ Loaded ${oldData.Eligibilities.length} eligibility records.`);
        console.log(`[LOAD] ✔️ Loaded ${oldData.Claims.length} user claim records.`);

        // --- Step 2: Connect to New MongoDB ---
        await connectToMongo();
        console.log('[CONNECT] ✔️ Connected to MongoDB.');

        // --- Step 3: Clear Target Collections (for idempotency) ---
        // This ensures you can re-run the script without creating duplicates.
        console.log('[CLEAN] ⚪ Wiping target collections...');
        await EligibilityModel.deleteMany({});
        await ClaimModel.deleteMany({});
        console.log('[CLEAN] ✔️ Collections Eligibility and Claim are empty.');

        // --- Step 4: Migrate Eligibilities ---
        if (oldData.Eligibilities && oldData.Eligibilities.length > 0) {
            console.log(`[MIGRATE] ⚪ Migrating ${oldData.Eligibilities.length} eligibility records...`);
            // The structure is identical, so we can insert directly
            await EligibilityModel.insertMany(oldData.Eligibilities);
            console.log('[MIGRATE] ✔️ Eligibility migration successful.');
        } else {
            console.log('[MIGRATE] ⚪ No eligibility records to migrate.');
        }

        // --- Step 5: Migrate Claims ---
        if (oldData.Claims && oldData.Claims.length > 0) {
            console.log(`[MIGRATE] ⚪ Transforming and migrating ${oldData.Claims.length} user claim records...`);
            
            // !! Transformation is needed here !!
            // The new schema nests ClaimData *without* the UserId,
            // as the parent doc already has it.
            
            const newClaimsData = oldData.Claims.map(userClaim => {
                // Map the subdocuments to the new, leaner format
                const newClaimList = userClaim.ClaimList.map(claim => ({
                    Timestamp: claim.Timestamp,
                    Amount: claim.Amount,
                    CodeUsed: claim.CodeUsed,
                    // The old 'UserId' field inside ClaimData is intentionally dropped
                }));
                
                // This is the new document for the 'Claim' collection
                return {
                    UserId: userClaim.UserId,
                    ClaimList: newClaimList,
                };
            });
            
            await ClaimModel.insertMany(newClaimsData);
            console.log('[MIGRATE] ✔️ Claims migration successful.');
        } else {
            console.log('[MIGRATE] ⚪ No claim records to migrate.');
        }

        console.log('--- 🎉 Migration Complete! ---');

    } catch (error) {
        console.error('--- ❌ Migration Failed ---');
        console.error(error);
        process.exit(1); // Exit with error
    } finally {
        // --- Step 6: Disconnect ---
        await mongoose.disconnect();
        console.log('[DISCONNECT] ✔️ Disconnected from MongoDB.');
    }
}

// --- Run the Script ---
runMigration();