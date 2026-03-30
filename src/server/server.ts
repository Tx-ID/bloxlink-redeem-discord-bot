import z from "zod";
import config from "../config";
import { getUserIdEligibility, getUnclaimedCodesByAmount, getRandomUnclaimedCode, setUserIdEligible, addClaimData, removeUserIdFromEligible, removeClaimData, initializeDatabase, ClaimModel, EligibilityModel, resetDatabase, countEligibleUsersByAmount, resetClaimedCodes, resetServerClaims, removeServerClaimData, getServerClaimModelPublic, getServerClaimedCodesPublic } from "../database/db";
import { getRewardServerByName, getAllRewardServers } from "../config/reward-servers";
import { readServerCodes } from "../utils/codes";

import express from "express";
import type { Express } from "express";

import { StatusCodes } from "http-status-codes";

import { readCodes } from "../utils/codes";
const codesByAmount = readCodes();


//
function escapeCsvValue(value: any): string {
  const str = String(value);
  // Check if escaping is needed
  if (/[",\n]/.test(str)) {
    // Enclose in double quotes and double any existing quotes
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function convertUserDataToCsv(arr: {}[]) {
  const header = Object.keys(arr[0]!).join(',') + '\n';
  const rows = arr.map(obj => Object.values(obj).join(',')).join('\n');
  return header + rows;
}

function convertArrayToCsv<T>(data: Map<any, Array<T>> | { [key: string | number]: Array<T> }): string {
  const dataMap = data instanceof Map ? data : new Map(Object.entries(data));

  if (dataMap.size === 0) {
    return '';
  }

  const headers = Array.from(dataMap.keys(), String);
  const columns = Array.from(dataMap.values());

  const numRows = columns.length > 0 ? Math.max(...columns.map(col => col.length)) : 0;
  const headerRow = headers.map(escapeCsvValue).join(',');

  const dataRows: string[] = [];
  for (let i = 0; i < numRows; i++) {
    const row = columns.map(col => {
      const value = col[i] !== undefined && col[i] !== null ? col[i] : '';
      return escapeCsvValue(value);
    });
    dataRows.push(row.join(','));
  }

  return [headerRow, ...dataRows].join('\n');
}


//
export class Server {
    private app: Express | undefined;

    constructor() {
        this.initialize();
    }

    async initialize() {
        await initializeDatabase();

        const app = express();
        app.use(express.json());

        app.delete('/delete-eligibility', async (req, res, next) => { // dev only
            if (!config.BEARER_KEY)
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized, the devs are missing something."});

            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`) {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            const body = req.body;
            if (!body)
                return res.status(StatusCodes.NOT_FOUND).json({error: "Missing body"});

            try {
                const userId = z.int({error: "Invalid UserId"}).positive({error: "UserId must be positive."}).parse(body.UserId);
                // const amount = z.int({error: "Invalid Amount"}).positive({error: "Amount must be positive"}).nullable().parse(body.Amount ?? null);
                // const dry = z.coerce.boolean().nullable().parse(body.dry ?? null);

                const removedFromEligible = await removeUserIdFromEligible(userId, null);
                const removedFromClaimData = await removeClaimData(userId, null);

                return res.status(StatusCodes.OK).json({message: "OK", data: {removedFromClaimData, removedFromEligible}});

            } catch(err: any) {
                if (err instanceof z.ZodError) {
                    return res.status(StatusCodes.BAD_REQUEST).json({ error: err.issues.map(issue => issue.message).join(' | ') });
                }
                return res.status(StatusCodes.BAD_REQUEST).json({ error: err ? err?.message : String(err) });
            }
        });

        app.delete('/reset-all-database', async (req, res, next) => {
            if (!config.BEARER_KEY)
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized, the devs are missing something."});

            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`) {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            const body = req.body;
            const dry = body ? z.coerce.boolean().nullable().parse(body.dry ?? null) : null;

            try {
                if (dry === true) {
                    const claimCount = await ClaimModel.countDocuments({});
                    const eligibilityCount = await EligibilityModel.countDocuments({});
                    return res.status(StatusCodes.OK).json({
                        message: "Dry-run: Would reset entire database",
                        data: {
                            wouldDeleteClaims: claimCount,
                            wouldDeleteEligibility: eligibilityCount
                        }
                    });
                }

                await resetDatabase();
                return res.status(StatusCodes.OK).json({message: "Database reset successfully."});
            } catch(err: any) {
                if (err instanceof z.ZodError) {
                    return res.status(StatusCodes.BAD_REQUEST).json({ error: err.issues.map(issue => issue.message).join(' | ') });
                }
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: err ? err?.message : String(err) });
            }
        });

        app.delete('/reset-claimed', async (req, res, next) => {
            if (!config.BEARER_KEY)
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized, the devs are missing something."});

            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`) {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            const body = req.body;
            const dry = body ? z.coerce.boolean().nullable().parse(body.dry ?? null) : null;

            try {
                if (dry === true) {
                    const claimCount = await ClaimModel.countDocuments({});
                    return res.status(StatusCodes.OK).json({
                        message: "Dry-run: Would reset claimed codes only",
                        data: {
                            wouldDeleteClaims: claimCount,
                            note: "Eligibility records would remain intact"
                        }
                    });
                }

                const deletedCount = await resetClaimedCodes();
                return res.status(StatusCodes.OK).json({
                    message: "Claimed codes reset successfully.",
                    data: {
                        deletedClaims: deletedCount,
                        note: "Eligibility records remain intact - eligible users can re-claim to get new codes"
                    }
                });
            } catch(err: any) {
                if (err instanceof z.ZodError) {
                    return res.status(StatusCodes.BAD_REQUEST).json({ error: err.issues.map(issue => issue.message).join(' | ') });
                }
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: err ? err?.message : String(err) });
            }
        });

        app.get("/unclaimed-list", async (req, res, next) => {
            if (!config.BEARER_KEY)
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized, the devs are missing something."});

            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`) {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            try {
                const unclaimed = await getUnclaimedCodesByAmount();

                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const filename = `UNCLAIMED-${year}-${month}-${day}.csv`

                const csvData = convertArrayToCsv(unclaimed);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(csvData);

            } catch(err: any) {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: err ? err?.message : String(err) });
            }
        });

        app.get(`/claim-list`, async (req, res, next) => {
            if (!config.BEARER_KEY)
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized, the devs are missing something."});

            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`) {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            try {
                // const db = getDB();
                // const list = db.data.Claims.reduce((prev, curr, index) => {
                //     const userId = curr.UserId;
                //     const claimData = curr.ClaimList[0];
                //     if (claimData) {
                //         prev.push({
                //             "Roblox UserId": userId,
                //             "Date Obtained": new Date(claimData.Timestamp).toISOString(),
                //             "Amount Get": claimData.Amount,
                //             "Code Used": claimData.CodeUsed,
                //         });
                //     }
                //     return prev;
                // }, [] as {"Roblox UserId": number, "Date Obtained": string, "Amount Get": number, "Code Used": string}[]);

                const pipeline = [
                    {
                        $project: {
                            _id: 0,
                            UserId: 1,
                            firstClaim: { $arrayElemAt: ["$ClaimList", 0] }
                        }
                    },
                    {
                        $match: {
                            firstClaim: { $ne: null }
                        }
                    },
                    {
                        $project: {
                            "Roblox UserId": "$UserId",
                            "Date Obtained": {
                                $dateToString: {
                                    format: "%Y-%m-%dT%H:%M:%SZ",
                                    date: { $toDate: "$firstClaim.Timestamp" } 
                                }
                            },
                            "Amount Get": "$firstClaim.Amount",
                            "Code Used": "$firstClaim.CodeUsed"
                        }
                    }
                ];
                
                const list = await ClaimModel.aggregate<{
                    "Roblox UserId": number, 
                    "Date Obtained": string, 
                    "Amount Get": number, 
                    "Code Used": string
                }>(pipeline);

                if (list.length < 1) {
                    return res.status(StatusCodes.OK).json({message: "Nothing found!"});
                }

                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const filename = `USERS-${year}-${month}-${day}.csv`

                const csvData = convertUserDataToCsv(list);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(csvData);

            } catch(err: any) {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: err ? err?.message : String(err) });
            }
        });

        app.get(`/eligibility-report`, async (req, res, next) => {
            if (!config.BEARER_KEY)
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized, the devs are missing something."});

            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`) {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            try {
                // Aggregate pipeline on EligibilityModel, joining Claim collection
                const pipeline = [
                    {
                        $lookup: {
                            from: "claims",
                            localField: "UserId",
                            foreignField: "UserId",
                            as: "claimInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$claimInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $unwind: {
                            path: "$EligibleList",
                            preserveNullAndEmptyArrays: false
                        }
                    },
                    {
                        $addFields: {
                            matchingClaim: {
                                $filter: {
                                    input: { $ifNull: ["$claimInfo.ClaimList", []] },
                                    as: "claim",
                                    cond: { $eq: ["$$claim.Amount", "$EligibleList"] }
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            hasClaim: { $gt: [{ $size: "$matchingClaim" }, 0] },
                            claimData: { $arrayElemAt: ["$matchingClaim", 0] }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            "Roblox UserId": "$UserId",
                            "Eligible Amount": "$EligibleList",
                            "Claimed": {
                                $cond: { if: "$hasClaim", then: "Yes", else: "No" }
                            },
                            "Date Claimed": {
                                $cond: {
                                    if: "$hasClaim",
                                    then: {
                                        $dateToString: {
                                            format: "%Y-%m-%dT%H:%M:%SZ",
                                            date: { $toDate: "$claimData.Timestamp" }
                                        }
                                    },
                                    else: ""
                                }
                            },
                            "Code Used": {
                                $cond: { if: "$hasClaim", then: "$claimData.CodeUsed", else: "" }
                            }
                        }
                    },
                    {
                        $sort: { "Roblox UserId": 1, "Eligible Amount": 1 }
                    }
                ];

                const list = await EligibilityModel.aggregate<{
                    "Roblox UserId": number,
                    "Eligible Amount": number,
                    "Claimed": string,
                    "Date Claimed": string,
                    "Code Used": string
                }>(pipeline as any[]);

                if (list.length < 1) {
                    return res.status(StatusCodes.OK).json({message: "No eligible users found!"});
                }

                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const filename = `ELIGIBILITY-REPORT-${year}-${month}-${day}.csv`;

                const csvData = convertUserDataToCsv(list);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(csvData);

            } catch(err: any) {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: err ? err?.message : String(err) });
            }
        });

        app.post('/set-eligibility', async (req, res, next) => {
            if (!config.BEARER_KEY)
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized, the devs are missing something."});

            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`) {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            const body = req.body;
            if (!body)
                return res.status(StatusCodes.NOT_FOUND).json({error: "Missing body"});

            try {
                const userId = z.int({error: "Invalid UserId"}).positive({error: "UserId must be positive."}).parse(body.UserId);
                const amount = z.int({error: "Invalid Amount"}).positive({error: "Amount must be positive"}).parse(body.Amount);
                const dry = z.coerce.boolean().nullable().parse(body.dry ?? null);

                if (!Array.from((await codesByAmount).keys()).includes(amount)) {
                    console.log(`[Eligibility]: ${req.headers.authorization} tried to set_eligible but invalid amount ${amount}.`);
                    return res.status(StatusCodes.BAD_REQUEST).json({error: "Invalid Amount"});
                }

                const eligibilities = await getUserIdEligibility(Number(userId));
                const assign_new_code = !eligibilities.includes(amount);

                if (eligibilities.length >= 1) {
                    console.log(`[Eligibility]: ${req.headers.authorization} Roblox user ${userId} already claimed one code.`);
                    return res.status(StatusCodes.BAD_REQUEST).json({message: "One use cannot have more than 1 redeem code."});
                }

                if (!assign_new_code) {
                    console.log(`[Eligibility]: ${req.headers.authorization} Roblox user ${userId} already has eligibility for amount ${amount}.`);
                    return res.status(StatusCodes.BAD_REQUEST).json({message: "This user already have the code for it."});
                }

                const rand_code = await getRandomUnclaimedCode(amount);
                if (!rand_code) {
                    console.log(`[Eligibility]: ${req.headers.authorization} tried to set_eligible but no code available for amount ${amount}.`);
                    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: "Abis woy kodenya."});
                }

                if (dry === true) {
                    return res.status(StatusCodes.OK).json({message: "OK (dry-run)"});
                }

                await setUserIdEligible(userId, amount);
                await addClaimData(userId, amount, rand_code!)

                return res.status(StatusCodes.OK).json({message: "OK"});

            } catch(err: any) {
                if (err instanceof z.ZodError) {
                    return res.status(StatusCodes.BAD_REQUEST).json({ error: err.issues.map(issue => issue.message).join(' | ') });
                }
                return res.status(StatusCodes.BAD_REQUEST).json({ error: err ? err?.message : String(err) });
            }
        });
        app.post('/v2/set-eligibility', async (req, res, next) => {
            if (!config.BEARER_KEY)
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized, the devs are missing something."});

            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`) {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            const body = req.body;
            if (!body)
                return res.status(StatusCodes.NOT_FOUND).json({error: "Missing body"});

            try {
                const userId = z.int({error: "Invalid UserId"}).positive({error: "UserId must be positive."}).parse(body.UserId);
                const amount = z.int({error: "Invalid Amount"}).positive({error: "Amount must be positive"}).parse(body.Amount);
                const dry = z.coerce.boolean().nullable().parse(body.dry ?? null);

                if (!Array.from((await codesByAmount).keys()).includes(amount)) {
                    console.log(`[Eligibility]: ${req.headers.authorization} tried to set_eligible but invalid amount ${amount}.`);
                    return res.status(StatusCodes.BAD_REQUEST).json({error: "Invalid Amount"});
                }

                const eligibilities = await getUserIdEligibility(Number(userId));
                const assign_new_code = !eligibilities.includes(amount);

                if (eligibilities.length >= 1) {
                    console.log(`[Eligibility]: ${req.headers.authorization} Roblox user ${userId} already claimed one code.`);
                    return res.status(StatusCodes.BAD_REQUEST).json({message: "One user cannot have more than 1 redeem code."});
                }

                if (!assign_new_code) {
                    console.log(`[Eligibility]: ${req.headers.authorization} Roblox user ${userId} already has eligibility for amount ${amount}.`);
                    return res.status(StatusCodes.BAD_REQUEST).json({message: "This user already have the code for it."});
                }

                // Check if there are enough codes for all eligible users (including this new one)
                const eligibleCount = await countEligibleUsersByAmount(amount);
                const allCodesMap = await codesByAmount;
                const totalCodes = allCodesMap.get(amount)?.length || 0;
                
                // If adding this user would exceed available codes, reject
                if (eligibleCount + 1 > totalCodes) {
                    console.log(`[Eligibility]: ${req.headers.authorization} tried to set_eligible but no code available for amount ${amount}.`);
                    return res.status(StatusCodes.BAD_REQUEST).json({
                        message: `Cannot set eligibility: Not enough codes available. There are ${totalCodes} total codes and ${eligibleCount} eligible users already.`
                    });
                }

                const rand_code = await getRandomUnclaimedCode(amount);
                if (!rand_code) {
                    console.log(`[Eligibility]: ${req.headers.authorization} tried to set_eligible but no code available for amount ${amount}.`);
                    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: "Abis woy kodenya."});
                }

                if (dry === true) {
                    return res.status(StatusCodes.OK).json({message: "OK (dry-run)"});
                }

                await setUserIdEligible(userId, amount);

                return res.status(StatusCodes.OK).json({message: "OK"});

            } catch(err: any) {
                if (err instanceof z.ZodError) {
                    return res.status(StatusCodes.BAD_REQUEST).json({ error: err.issues.map(issue => issue.message).join(' | ') });
                }
                return res.status(StatusCodes.BAD_REQUEST).json({ error: err ? err?.message : String(err) });
            }
        });

        // =============================================
        // Reward Server (e.g. PELANGI) Debug Endpoints
        // =============================================

        /** Middleware: resolve :server param to a RewardServerConfig */
        const resolveRewardServer = (req: express.Request, res: express.Response): ReturnType<typeof getRewardServerByName> => {
            const serverName = (req.params as any).server?.toUpperCase();
            if (!serverName) {
                res.status(StatusCodes.BAD_REQUEST).json({ error: "Missing server name" });
                return undefined;
            }
            const server = getRewardServerByName(serverName);
            if (!server) {
                res.status(StatusCodes.NOT_FOUND).json({ error: `Reward server "${serverName}" not found`, available: getAllRewardServers().map(s => s.name) });
                return undefined;
            }
            return server;
        };

        app.get('/server/:server/claim-list', async (req, res, next) => {
            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`)
                return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Unauthorized" });

            const server = resolveRewardServer(req, res);
            if (!server) return;

            try {
                const ServerClaimModel = getServerClaimModelPublic(server.name);

                const pipeline = [
                    {
                        $project: {
                            _id: 0,
                            UserId: 1,
                            firstClaim: { $arrayElemAt: ["$ClaimList", 0] }
                        }
                    },
                    { $match: { firstClaim: { $ne: null } } },
                    {
                        $project: {
                            "Roblox UserId": "$UserId",
                            "Date Obtained": {
                                $dateToString: {
                                    format: "%Y-%m-%dT%H:%M:%SZ",
                                    date: { $toDate: "$firstClaim.Timestamp" }
                                }
                            },
                            "Amount Get": "$firstClaim.Amount",
                            "Code Used": "$firstClaim.CodeUsed"
                        }
                    }
                ];

                const list = await ServerClaimModel.aggregate(pipeline);

                if (list.length < 1) {
                    return res.status(StatusCodes.OK).json({ message: `No claims found for ${server.name}` });
                }

                const now = new Date();
                const filename = `${server.name}-CLAIMS-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;

                const csvData = convertUserDataToCsv(list);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(csvData);
            } catch (err: any) {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: err?.message ?? String(err) });
            }
        });

        app.get('/server/:server/unclaimed-list', async (req, res, next) => {
            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`)
                return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Unauthorized" });

            const server = resolveRewardServer(req, res);
            if (!server) return;

            try {
                const allCodesMap = await readServerCodes(server);
                const claimedSet = await getServerClaimedCodesPublic(server);

                const unclaimed = new Map<number, string[]>();
                allCodesMap.forEach((list, amount) => {
                    unclaimed.set(amount, list.filter(code => !claimedSet.has(code)));
                });

                const now = new Date();
                const filename = `${server.name}-UNCLAIMED-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;

                const csvData = convertArrayToCsv(unclaimed);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(csvData);
            } catch (err: any) {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: err?.message ?? String(err) });
            }
        });

        app.delete('/server/:server/reset-claims', async (req, res, next) => {
            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`)
                return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Unauthorized" });

            const server = resolveRewardServer(req, res);
            if (!server) return;

            try {
                const dry = req.body ? z.coerce.boolean().nullable().parse(req.body.dry ?? null) : null;

                if (dry === true) {
                    const ServerClaimModel = getServerClaimModelPublic(server.name);
                    const count = await ServerClaimModel.countDocuments({});
                    return res.status(StatusCodes.OK).json({
                        message: `Dry-run: Would reset all ${server.name} claims`,
                        data: { wouldDeleteClaims: count }
                    });
                }

                const deletedCount = await resetServerClaims(server);
                return res.status(StatusCodes.OK).json({
                    message: `${server.name} claims reset successfully.`,
                    data: { deletedClaims: deletedCount }
                });
            } catch (err: any) {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: err?.message ?? String(err) });
            }
        });

        app.delete('/server/:server/delete-claim', async (req, res, next) => {
            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`)
                return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Unauthorized" });

            const server = resolveRewardServer(req, res);
            if (!server) return;

            try {
                const userId = z.int({ error: "Invalid UserId" }).positive({ error: "UserId must be positive." }).parse(req.body?.UserId);
                const removed = await removeServerClaimData(server, userId);

                return res.status(StatusCodes.OK).json({
                    message: removed ? `Claim removed for user ${userId} in ${server.name}` : `No claim found for user ${userId} in ${server.name}`,
                    data: { removed }
                });
            } catch (err: any) {
                if (err instanceof z.ZodError) {
                    return res.status(StatusCodes.BAD_REQUEST).json({ error: err.issues.map(i => i.message).join(' | ') });
                }
                return res.status(StatusCodes.BAD_REQUEST).json({ error: err?.message ?? String(err) });
            }
        });

        app.get('/server/:server/stats', async (req, res, next) => {
            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`)
                return res.status(StatusCodes.UNAUTHORIZED).json({ error: "Unauthorized" });

            const server = resolveRewardServer(req, res);
            if (!server) return;

            try {
                const ServerClaimModel = getServerClaimModelPublic(server.name);
                const totalClaims = await ServerClaimModel.countDocuments({});

                const allCodesMap = await readServerCodes(server);
                const claimedSet = await getServerClaimedCodesPublic(server);

                const codeStats: Record<string, { total: number; claimed: number; remaining: number }> = {};
                allCodesMap.forEach((list, amount) => {
                    const claimed = list.filter(code => claimedSet.has(code)).length;
                    codeStats[String(amount)] = {
                        total: list.length,
                        claimed,
                        remaining: list.length - claimed
                    };
                });

                return res.status(StatusCodes.OK).json({
                    server: server.name,
                    totalClaimedUsers: totalClaims,
                    codes: codeStats
                });
            } catch (err: any) {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: err?.message ?? String(err) });
            }
        });

        app.listen(config.PORT, () => {
            console.log(`Server running on port ${config.PORT}`);
        });

        this.app = app;
    }
}