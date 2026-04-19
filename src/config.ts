import { Connection, clusterApiUrl } from "@solana/web3.js";

export const BOT_TOKEN = "YOUR_BOT_TOKEN";

export const connection = new Connection(
    clusterApiUrl("devnet"),
    "confirmed"
);