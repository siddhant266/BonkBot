import { Keypair } from "@solana/web3.js";

export const USERS: Record<string, Keypair> = {};
export const AWAITING_IMPORT: Record<string, boolean> = {};