import { Telegraf } from "telegraf";
import { sendTokenCancelKeyboard, sendTokenConfirmKeyboard } from "../keyboards";
import { connection } from "../config";
import { AWAITING_IMPORT, USERS } from "../state";
import {
    PublicKey,
    sendAndConfirmTransaction,
    Transaction,
} from "@solana/web3.js";
import {
    createTransferInstruction,
    getAssociatedTokenAddress,
    getMint,
    TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import prisma from "../prisma";

// ── Session Types ─────────────────────────────────────────────────────────────

interface SendTokenSession {
    step: "awaiting_mint" | "awaiting_recipient" | "awaiting_token_amount" | "confirming_token";
    mint?: string;
    recipient?: string;
    amount?: number;
    decimals?: number;
}

// ── Session Store ─────────────────────────────────────────────────────────────

const tokenSessions = new Map<number, SendTokenSession>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidSolanaAddress(address: string): boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function isValidAmount(raw: string): number | null {
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return null;
    return parseFloat(n.toFixed(9));
}

function buildTokenConfirmMessage(mint: string, recipient: string, amount: number): string {
    return (
        `🔍 *Confirm Token Transfer*\n\n` +
        ` *Token:* \`CHSI\`\n` +
        `*Mint:* \`${mint}\`\n` +
        `*To:* \`${recipient}\`\n` +
        `*Amount:* \`${amount} tokens\`\n\n` +
        `⚠️ Double-check all details — token transfers are irreversible.`
    );
}

// ── Handler Registration ──────────────────────────────────────────────────────

export function sendTokenHandlers(bot: Telegraf) {

    // ── Entry point ───────────────────────────────────────────────────────────
    // ── Entry point ───────────────────────────────────────────────────────────
    bot.action("send_token_menu", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        const keypair = USERS[userId.toString()];
        if (!keypair) {
            await ctx.answerCbQuery();
            await ctx.reply("⚠️ No wallet found. Please import or generate one.");
            return;
        }

        // Fetch stored token from DB
        const user = await prisma.user.findUnique({
            where: { telegramId: BigInt(userId) },
        });

        if (!user || !user.token_mint) {
            await ctx.answerCbQuery();
            await ctx.reply("⚠️ No token found in your wallet. Please receive a token first.");
            return;
        }


        // Pre-fill mint from DB and skip straight to recipient step
        tokenSessions.set(userId, {
            step: "awaiting_recipient",
            mint: user.token_mint,
            decimals: undefined, // will be fetched below
        });

        // Fetch decimals from chain
        try {
            const mintInfo = await getMint(
                connection,
                new PublicKey(user.token_mint),
                "confirmed",
                TOKEN_2022_PROGRAM_ID  // ← add this
            );
            tokenSessions.set(userId, {
                step: "awaiting_recipient",
                mint: user.token_mint,
                decimals: mintInfo.decimals,
            });
        } catch {
            await ctx.answerCbQuery();
            await ctx.reply("⚠️ Could not fetch token info from chain. Please try again.");
            return;
        }

        await ctx.answerCbQuery();
        await ctx.reply(
            `🪙 *Send Token*\n\n` +
            `*Token:* \`${user.token_symbol || "Unknown"}\`\n` +
            `*Mint:* \`${user.token_mint}\`\n\n` +
            `Step 1 of 2 — Enter the *recipient's Solana wallet address*:`,
            {
                parse_mode: "Markdown",
                ...sendTokenCancelKeyboard,
            }
        );
    });

    // ── Cancel ────────────────────────────────────────────────────────────────
    bot.action("send_token_cancel", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        tokenSessions.delete(userId);

        await ctx.answerCbQuery("Cancelled");
        await ctx.reply("❌ Token transfer cancelled.");
    });

    // ── Confirm & Execute ─────────────────────────────────────────────────────
    bot.action("send_token_confirm", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        const session = tokenSessions.get(userId);
        if (!session || session.step !== "confirming_token") {
            await ctx.answerCbQuery("Session expired. Please start again.");
            return;
        }

        await ctx.answerCbQuery();

        try {
            let keypair = USERS[userId];

            if (!keypair) {
                const dbUser = await prisma.user.findUnique({
                    where: { telegramId: BigInt(userId) },
                });
                if (!dbUser) {
                    await ctx.reply("⚠️ No wallet found. Please generate a wallet first.");
                    return;
                }
                const { Keypair } = await import("@solana/web3.js");
                keypair = Keypair.fromSecretKey(Buffer.from(dbUser.privateKey, "base64"));
                USERS[userId] = keypair;
            }

            const { mint, recipient, amount, decimals } = session;
            if (!mint || !recipient || amount === undefined || decimals === undefined) {
                await ctx.reply("⚠️ Session data missing. Please start over.");
                return;
            }

            const mintPubkey = new PublicKey(mint);
            const recipientPubkey = new PublicKey(recipient);

            // Derive ATAs for sender and recipient
            const senderATA = await getAssociatedTokenAddress(
                mintPubkey,
                keypair.publicKey,
                false,
                TOKEN_2022_PROGRAM_ID  // ← add this
            );
            const recipientATA = await getAssociatedTokenAddress(
                mintPubkey,
                recipientPubkey,
                false,
                TOKEN_2022_PROGRAM_ID  // ← add this
            );
            // Verify sender has enough tokens
            const senderAccountInfo = await connection.getTokenAccountBalance(senderATA);
            const rawBalance = BigInt(senderAccountInfo.value.amount);
            const rawAmount = BigInt(Math.round(amount * 10 ** decimals));

            if (rawBalance < rawAmount) {
                await ctx.reply(
                    `❌ Insufficient token balance.\n` +
                    `Available: \`${senderAccountInfo.value.uiAmountString}\` tokens`,
                    { parse_mode: "Markdown" }
                );
                return;
            }

            const tx = new Transaction().add(
                createTransferInstruction(
                    senderATA,
                    recipientATA,
                    keypair.publicKey,
                    rawAmount,
                    [],
                    TOKEN_2022_PROGRAM_ID
                )
            );

            const sig = await sendAndConfirmTransaction(connection, tx, [keypair]);

            // Record in DB — prefix 'from' with mint for traceability
            await prisma.transaction.create({
                data: {
                    from: `[token:${mint}] ${keypair.publicKey.toBase58()}`,
                    to: recipient,
                    amount: amount,
                    status: "success",
                },
            });

            tokenSessions.delete(userId);

            await ctx.reply(
                `✅ *Token Transfer Successful!*\n\n` +
                ` Sent \`${amount} tokens\`\n` +
                `📍 To: \`${recipient}\`\n` +
                `\n🪙 *Token:* \`CHSI\`\n` +
                `🔑 Mint: \`${mint}\`\n\n` +
                `🔗 Tx: https://explorer.solana.com/tx/${sig}?cluster=devnet`,
                { parse_mode: "Markdown" }
            );

        } catch (err: any) {
            console.error(err);
            await ctx.reply(
                `❌ *Token Transfer Failed*\n\n${err.message}`,
                { parse_mode: "Markdown" }
            );
        }
    });

    // ── Text message router ───────────────────────────────────────────────────
    bot.on("text", async (ctx, next) => {
        const userId = ctx.from?.id;
        if (!userId) return next();

        if (AWAITING_IMPORT[userId.toString()]) return next();

        const tokenSession = tokenSessions.get(userId);
        if (!tokenSession) return next();

        const text = ctx.message.text.trim();

        // Step 1: collect recipient address
        if (tokenSession.step === "awaiting_recipient") {
            if (!isValidSolanaAddress(text)) {
                await ctx.reply(
                    "⚠️ That doesn't look like a valid Solana address. Please try again:",
                    { ...sendTokenCancelKeyboard }
                );
                return;
            }

            tokenSessions.set(userId, {
                ...tokenSession,
                step: "awaiting_token_amount",
                recipient: text,
            });

            await ctx.reply(
                `✅ Recipient saved.\n\nStep 2 of 2 — How many tokens do you want to send?\n_(e.g. \`10\` or \`0.5\`)_`,
                {
                    parse_mode: "Markdown",
                    ...sendTokenCancelKeyboard,
                }
            );
            return;
        }

        // Step 2: collect amount
        if (tokenSession.step === "awaiting_token_amount") {
            const amount = isValidAmount(text);
            if (amount === null) {
                await ctx.reply(
                    "⚠️ Invalid amount. Please enter a positive number (e.g. `10`):",
                    {
                        parse_mode: "Markdown",
                        ...sendTokenCancelKeyboard,
                    }
                );
                return;
            }

            tokenSessions.set(userId, {
                ...tokenSession,
                step: "confirming_token",
                amount,
            });

            await ctx.reply(
                buildTokenConfirmMessage(tokenSession.mint!, tokenSession.recipient!, amount),
                {
                    parse_mode: "Markdown",
                    ...sendTokenConfirmKeyboard,
                }
            );
            return;
        }

        // Unknown step — clear and bail
        tokenSessions.delete(userId);
    });
}