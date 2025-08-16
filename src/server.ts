import z from "zod";
import config from "./config";
import express, {type Express} from "express";
import { StatusCodes } from 'http-status-codes';

import { getUserIdClaims, getUserIdEligibility, getUnclaimedCodesByAmount } from "./db";

import { readCodes } from "./codes";
const codesByAmount = readCodes();


//
export class Server {
    app: Express;

    constructor() {
        this.initialize();
    }

    async initialize() {
        const app = express();
        app.use(express.json());

        app.post('/set-eligibility', async (req, res, next) => {
            if (req.headers.authorization !== "Bearer ilovelilik") {
                return res.status(StatusCodes.UNAUTHORIZED).json({error: "Unauthorized"});
            }

            const body = req.body;
            if (!body)
                return res.status(StatusCodes.NOT_FOUND).json({error: "Missing body"});

            try {
                const userId = z.int({error: "Invalid UserId"}).positive({error: "UserId must be positive."}).parse(body.UserId);
                const amount = z.int({error: "Invalid Amount"}).positive({error: "Amount must be positive"}).parse(body.Amount);

                if (!codesByAmount.keys().toArray().includes(amount))
                    return res.status(StatusCodes.BAD_REQUEST).json({error: "Invalid Amount"});

                const eligibilities = await getUserIdEligibility(Number(userId));
                const assign_new_code = !eligibilities.includes(amount);

                if (!assign_new_code) {
                    return res.status(StatusCodes.OK).json({message: "This user already have the code for it."});
                }

                const unclaimed = (await getUnclaimedCodesByAmount()).get(amount)!;
                if (unclaimed.length <= 0) {
                    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: "Abis woy kodenya."});
                }

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