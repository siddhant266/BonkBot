import { Telegraf, Markup } from "telegraf";
import { USERS, AWAITING_IMPORT } from "../state";
import { Keypair } from "@solana/web3.js";
import { import_wallet } from "../import_wallet";
// @ts-ignore
import bs58 from "bs58";

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
        import_wallet(bot, userId);
    });


}