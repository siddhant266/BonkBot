import { Telegraf } from "telegraf";
import { Keypair } from "@solana/web3.js";
import { USERS, AWAITING_IMPORT } from "./state";
import bs58 from "bs58";

export function import_wallet(bot: Telegraf, userId: number) {

    AWAITING_IMPORT[userId.toString()] = true;


    bot.on("text", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        // Handle cancel
        if (ctx.message.text === "/start") {
            delete AWAITING_IMPORT[userId.toString()];
            return; // the start command handler will pick this up too
        }

        if (AWAITING_IMPORT[userId.toString()]) {
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
        }
    });
}
