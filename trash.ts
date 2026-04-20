import { Telegraf, Markup } from "telegraf";
import { USERS, AWAITING_IMPORT } from "../state";
import { Keypair } from "@solana/web3.js";
// @ts-ignore
import bs58 from "bs58";

let listenerRegistered = false;

export function importHandlers(bot: Telegraf) {

    bot.action("import_wallet", (ctx) => {
        ctx.answerCbQuery();
        const userId = ctx.from?.id;
        if (!userId) return;

        // ✅ YOUR CODE (unchanged)
        if (USERS[userId]) {
            ctx.sendMessage("⚠️ You already have a wallet linked.\n\nChoose:", {
                reply_markup: {
                    inline_keyboard: [
                        [
                            Markup.button.callback('🔄 Replace Wallet', 'replace_wallet'),
                            Markup.button.callback('❌ Cancel', 'cancel_import')
                        ]
                    ]
                }
            });
            return;
        }

        // ✅ Only change: set state
        AWAITING_IMPORT[userId.toString()] = true;

        ctx.sendMessage("Please send your private key to import your wallet.");
    });

    // ✅ Handle replace
    bot.action("replace_wallet", (ctx) => {
        ctx.answerCbQuery();
        const userId = ctx.from?.id;
        if (!userId) return;

        AWAITING_IMPORT[userId.toString()] = true;
        ctx.sendMessage("🔄 Send your new private key.");
    });

    // ✅ Handle cancel
    bot.action("cancel_import", (ctx) => {
        ctx.answerCbQuery();
        const userId = ctx.from?.id;
        if (!userId) return;

        delete AWAITING_IMPORT[userId.toString()];
        ctx.sendMessage("❌ Cancelled.");
    });

    // ✅ Register ONLY once
    if (listenerRegistered) return;
    listenerRegistered = true;

    bot.on("text", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        // ✅ Only act if importing
        if (!AWAITING_IMPORT[userId.toString()]) return;

        const message = ctx.message.text;

        // Cancel via command
        if (message === "/start") {
            delete AWAITING_IMPORT[userId.toString()];
            return;
        }

        let text = message.trim();

        if (text.startsWith('"') && text.endsWith('"')) {
            text = text.slice(1, -1);
        }

        try {
            let secretKey: Uint8Array;

            if (text.startsWith("[") && text.endsWith("]")) {
                secretKey = Uint8Array.from(JSON.parse(text));
            } else if (
                text.length >= 87 &&
                text.length <= 88 &&
                !text.includes("+") &&
                !text.includes("/")
            ) {
                secretKey = bs58.decode(text);
            } else {
                secretKey = Buffer.from(text, "base64");
            }

            if (secretKey.length !== 64) {
                throw new Error("Invalid format");
            }

            const keypair = Keypair.fromSecretKey(secretKey);

            USERS[userId.toString()] = keypair;
            delete AWAITING_IMPORT[userId.toString()];

            await ctx.reply(
                `✅ Wallet Imported Successfully!\n\n💳 Address:\n\`${keypair.publicKey.toBase58()}\``,
                { parse_mode: "Markdown" }
            );

            await ctx.deleteMessage().catch(() => { });

        } catch (e) {
            ctx.reply("❌ Invalid Private Key. Try again or /start to cancel.");
        }
    });
}













//import_wallet
import { Telegraf } from "telegraf";
import { Keypair } from "@solana/web3.js";
import { USERS, AWAITING_IMPORT } from "./state";
import bs58 from "bs58";

// Just sets the flag. The single bot.on("text") in transactions.ts handles the rest.
export function import_wallet(bot: Telegraf, userId: number) {
    bot.on("text", async (ctx) => {
        const userId = ctx.from?.id;

        if (!userId) return;



        // Handle cancel
        if (ctx.message.text === "/start") {
            delete AWAITING_IMPORT[userId.toString()];
            return; // the start command handler will pick this up too
        }

        if (!AWAITING_IMPORT[userId.toString()]) {
            return;
        }

        let text = ctx.message.text.trim();


        // Remove conversational quotes if present
        if (text.startsWith('"') && text.endsWith('"')) {
            text = text.slice(1, -1);
        }

        try {
            let secretKey: Uint8Array;

            // Handle array strings [1, 2, 3...]
            if (text.startsWith("[") && text.endsWith("]")) {
                secretKey = Uint8Array.from(JSON.parse(text));
            } else if (text.length >= 87 && text.length <= 88 && !text.includes("+") && !text.includes("/")) {
                // Base58 encoded 64-byte keypair string (Phantom format)
                secretKey = bs58.decode(text);
            } else {
                // Otherwise assume it's base64, which is how we export it
                secretKey = Buffer.from(text, 'base64');
            }

            if (secretKey.length !== 64) {
                throw new Error("Invalid format");
            }

            const keypair = Keypair.fromSecretKey(secretKey);
            USERS[userId.toString()] = keypair;
            delete AWAITING_IMPORT[userId.toString()];

            ctx.reply(`✅ **Wallet Imported Successfully!**\n\n💳 **Address:** \`${keypair.publicKey.toBase58()}\`\n\n_Your wallet is now securely linked!_`, { parse_mode: 'Markdown' });

            // Delete the message containing the private key for security
            ctx.deleteMessage().catch(() => { });
        } catch (e) {
            ctx.reply("❌ Invalid Private Key format. Ensure you pasted it correctly.\nTry again or type /start to cancel the import.");
        }
    });
}