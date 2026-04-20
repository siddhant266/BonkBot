import "dotenv/config";
import { Connection, clusterApiUrl } from "@solana/web3.js";

if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not set in .env");
}

export const BOT_TOKEN = process.env.BOT_TOKEN as string;


export const connection = new Connection(
    "https://devnet.helius-rpc.com/?api-key=d400bf42-b09a-4c06-a7c1-9cd39c74d155",
    "confirmed"
);