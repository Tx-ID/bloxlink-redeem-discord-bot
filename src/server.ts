import z from "zod";
import config from "./config";
import express, {type Express} from "express";
import { StatusCodes } from 'http-status-codes';

import { getUserIdClaims, getUserIdEligibility, getUnclaimedCodesByAmount, setUserIdEligible, addClaimData, removeUserIdFromEligible, removeClaimData, getDB } from "./db";

import { readCodes } from "./codes";
const codesByAmount = readCodes();


//
function convertToCsv(arr: {}[]) {
  const header = Object.keys(arr[0]!).join(',') + '\n';
  const rows = arr.map(obj => Object.values(obj).join(',')).join('\n');
  return header + rows;
}


//
export class Server {
    private app: Express | undefined;

    constructor() {
        this.initialize();
    }

    async initialize() {
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

        app.get(`/claim-list`, async (req, res, next) => {
            if (!config.BEARER_KEY)
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized, the devs are missing something."});

            if (req.headers.authorization !== `Bearer ${config.BEARER_KEY}`) {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            try {
                const db = await getDB();
                const list = db.data.Claims.reduce((prev, curr, index) => {
                    const userId = curr.UserId;
                    const claimData = curr.ClaimList[0];
                    if (claimData) {
                        prev.push({
                            "Roblox UserId": userId,
                            "Date Obtained": new Date(claimData.Timestamp).toISOString(),
                            "Amount Get": claimData.Amount,
                            "Code Used": claimData.CodeUsed,
                        });
                    }
                    return prev;
                }, [] as {"Roblox UserId": number, "Date Obtained": string, "Amount Get": number, "Code Used": string}[]);

                if (list.length < 1) {
                    return res.status(StatusCodes.OK).json({message: "Nothing found!"});
                }

                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const filename = `USERS-${year}-${month}-${day}.csv`

                const csvData = convertToCsv(list);
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

                if (!codesByAmount.keys().toArray().includes(amount))
                    return res.status(StatusCodes.BAD_REQUEST).json({error: "Invalid Amount"});

                const eligibilities = await getUserIdEligibility(Number(userId));
                const assign_new_code = !eligibilities.includes(amount);

                if (eligibilities.length >= 1) {
                    return res.status(StatusCodes.BAD_REQUEST).json({message: "One use cannot have more than 1 redeem code."});
                }

                if (!assign_new_code) {
                    return res.status(StatusCodes.BAD_REQUEST).json({message: "This user already have the code for it."});
                }

                const unclaimed = (await getUnclaimedCodesByAmount()).get(amount)!;
                if (unclaimed.length <= 0) {
                    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: "Abis woy kodenya."});
                }

                if (dry === true) {
                    return res.status(StatusCodes.OK).json({message: "OK (dry-run)"});
                }

                const rand_code = unclaimed.at(
                    Math.floor(Math.random() * unclaimed.length)
                );

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
        app.listen(config.PORT, () => {
            console.log(`Server running on port ${config.PORT}`);
        });

        this.app = app;
    }
}