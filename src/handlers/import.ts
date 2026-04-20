import { Telegraf, Markup } from "telegraf";
import { USERS, AWAITING_IMPORT } from "../state";
import { Keypair } from "@solana/web3.js";

// @ts-ignore
import bs58 from "bs58";
import prisma from "../prisma";

export function importHandlers(bot: Telegraf) {



    bot.action("import_wallet", (ctx) => {
        ctx.answerCbQuery();
        const userId = ctx.from?.id;
        if (!userId) return;

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

        ctx.sendMessage("Please send your private key to import your wallet.");

        AWAITING_IMPORT[userId.toString()] = true;

    });

    bot.action("cancel_import", (ctx) => {
        ctx.answerCbQuery();
        const userId = ctx.from?.id;
        if (!userId) return;

        delete AWAITING_IMPORT[userId.toString()];
        ctx.sendMessage("❌ Cancelled.");
    });


    bot.on("text", async (ctx, next) => {
        const userId = ctx.from?.id;
        console.log(userId, "import")
        if (!AWAITING_IMPORT[userId.toString()]) return next();

        if (!userId) return next();



        // Handle cancel
        if (ctx.message.text === "/start") {
            delete AWAITING_IMPORT[userId.toString()];
            return; // the start command handler will pick this up too
        }

        if (!AWAITING_IMPORT[userId.toString()]) {
            return next()
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
            AWAITING_IMPORT[userId.toString()] = false;

            // Persist imported wallet to DB
            // In the import/replace text handler — same fix
            await prisma.user.upsert({
                where: { telegramId: BigInt(userId) },
                update: {
                    publicKey: keypair.publicKey.toBase58(),
                    privateKey: Buffer.from(keypair.secretKey).toString("base64"),
                },
                create: {
                    telegramId: BigInt(userId),
                    publicKey: keypair.publicKey.toBase58(),
                    privateKey: Buffer.from(keypair.secretKey).toString("base64"),
                    token_mint: "",   // ← required default
                    token_symbol: "",   // ← required default
                },
            });

            ctx.reply(`✅ **Wallet Imported Successfully!**\n\n💳 **Address:** \`${keypair.publicKey.toBase58()}\`\n\n_Your wallet is now securely linked!_`, { parse_mode: 'Markdown' });

            // Delete the message containing the private key for security
            ctx.deleteMessage().catch(() => { });
        } catch (e) {
            delete AWAITING_IMPORT[userId.toString()]; // ✅ IMPORTANT
            ctx.reply("❌ Invalid Private Key format. Ensure you pasted it correctly.\nTry again or type /start to cancel the import.");
        }
    });
}


