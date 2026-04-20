import { Telegraf } from "telegraf";
import { sendSolCancelKeyboard, sendSolConfirmKeyboard } from "../keyboards";
import { connection } from "../config";
import { AWAITING_IMPORT, USERS } from "../state";
import {
    LAMPORTS_PER_SOL,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
} from "@solana/web3.js";
import prisma from "../prisma";

// ── Session Types ─────────────────────────────────────────────────────────────

interface SendSolSession {
    step: "awaiting_address" | "awaiting_amount" | "confirming";
    address?: string;
    amount?: number;
}

// ── Session Store ─────────────────────────────────────────────────────────────

const sessions = new Map<number, SendSolSession>();

function getSession(userId: number): SendSolSession | undefined {
    return sessions.get(userId);
}

function setSession(userId: number, data: SendSolSession) {
    sessions.set(userId, data);
}

function clearSession(userId: number) {
    sessions.delete(userId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidSolanaAddress(address: string): boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function isValidAmount(raw: string): number | null {
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return null;
    return parseFloat(n.toFixed(9));
}

function buildConfirmMessage(address: string, amount: number): string {
    return (
        `🔍 *Confirm Transaction*\n\n` +
        `*To:* \`${address}\`\n` +
        `*Amount:* \`${amount} SOL\`\n\n` +
        `⚠️ Double-check the address — transactions are irreversible.`
    );
}

// ── Handler Registration ──────────────────────────────────────────────────────

export function sendSolHandlers(bot: Telegraf) {

    // ── Entry point ───────────────────────────────────────────────────────────
    bot.action("send_sol_menu", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        setSession(userId, { step: "awaiting_address" });

        await ctx.answerCbQuery();
        await ctx.reply(
            "💸 *Send SOL*\n\nStep 1 of 2 — Enter the recipient's Solana wallet address:",
            {
                parse_mode: "Markdown",
                ...sendSolCancelKeyboard,
            }
        );
    });

    // ── Cancel ────────────────────────────────────────────────────────────────
    bot.action("send_sol_cancel", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        clearSession(userId);

        await ctx.answerCbQuery("Cancelled");
        await ctx.reply("❌ Transaction cancelled.", {
            parse_mode: "Markdown",
        });
    });

    // ── Confirm & Execute ─────────────────────────────────────────────────────
    bot.action("send_sol_confirm", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        const session = getSession(userId);
        if (!session || session.step !== "confirming") {
            await ctx.answerCbQuery("Session expired. Please start again.");
            return;
        }

        try {
            let keypair = USERS[userId];

            if (!keypair) {
                const dbUser = await prisma.user.findUnique({
                    where: { telegramId: BigInt(userId) },
                });
                if (!dbUser) {
                    await ctx.reply("No wallet found. Please generate a wallet first.");
                    return;
                }
                const { Keypair } = await import("@solana/web3.js");
                keypair = Keypair.fromSecretKey(Buffer.from(dbUser.privateKey, "base64"));
                USERS[userId] = keypair;
            }

            if (!session.amount || !session.address) {
                await ctx.reply("⚠️ Session data missing. Please start over.");
                return;
            }

            const lamports = Math.round(session.amount * LAMPORTS_PER_SOL);
            const toPubkey = new PublicKey(session.address);

            const balance = await connection.getBalance(keypair.publicKey);
            if (balance < lamports) {
                await ctx.reply("Insufficient balance");
                return;
            }

            const tx = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: keypair.publicKey,
                    toPubkey: toPubkey,
                    lamports: lamports,
                })
            );

            const sign = await sendAndConfirmTransaction(connection, tx, [keypair]);

            await prisma.transaction.create({
                data: {
                    from: keypair.publicKey.toBase58(),
                    to: session.address!,
                    amount: session.amount!,
                    status: "success",
                },
            });

            clearSession(userId);

            await ctx.reply(
                `✅ *Transaction Successful!*\n\n` +
                `💸 Sent \`${session.amount} SOL\`\n` +
                `📍 To: \`${session.address}\`\n\n` +
                `🔗 Tx: https://explorer.solana.com/tx/${sign}?cluster=devnet`,
                { parse_mode: "Markdown" }
            );

        } catch (err: any) {
            console.error(err);
            await ctx.reply(
                `❌ *Transaction Failed*\n\n${err.message}`,
                { parse_mode: "Markdown" }
            );
        }
    });

    // ── Text message router ───────────────────────────────────────────────────
    bot.on("text", async (ctx, next) => {
        const userId = ctx.from?.id;
        if (!userId) return next();

        if (AWAITING_IMPORT[userId.toString()]) return next();

        const session = getSession(userId);
        if (!session) return next();

        const text = ctx.message.text.trim();

        // Step 1: collect address
        if (session.step === "awaiting_address") {
            if (!isValidSolanaAddress(text)) {
                await ctx.reply(
                    "⚠️ That doesn't look like a valid Solana address.\n\nPlease enter a valid Base58 address, or cancel:",
                    { ...sendSolCancelKeyboard }
                );
                return;
            }

            setSession(userId, { step: "awaiting_amount", address: text });

            await ctx.reply(
                `✅ Address saved.\n\n` +
                `Step 2 of 2 — How much SOL do you want to send?\n` +
                `_(e.g. \`0.5\` or \`1.25\`)_`,
                {
                    parse_mode: "Markdown",
                    ...sendSolCancelKeyboard,
                }
            );
            return;
        }

        // Step 2: collect amount
        if (session.step === "awaiting_amount") {
            const amount = isValidAmount(text);

            if (amount === null) {
                await ctx.reply(
                    "⚠️ Invalid amount. Please enter a positive number (e.g. `0.5`):",
                    {
                        parse_mode: "Markdown",
                        ...sendSolCancelKeyboard,
                    }
                );
                return;
            }

            setSession(userId, {
                step: "confirming",
                address: session.address,
                amount,
            });

            await ctx.reply(buildConfirmMessage(session.address!, amount), {
                parse_mode: "Markdown",
                ...sendSolConfirmKeyboard,
            });
            return;
        }
    });
}