import * as DiscordJs from "discord.js";
import * as Axios from "axios";
import moment from "moment-timezone";
import config from "./config";

import express from "express";

const app = express();
app.use(express.json());

app.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`);
});
