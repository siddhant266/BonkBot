import { Telegraf } from "telegraf";
import { BOT_TOKEN } from "./src/config";
import { mainKeyboard } from "./src/keyboards";

import { walletHandlers } from "./src/handlers/wallet";
import { importHandlers } from "./src/handlers/import";
import { sendSolHandlers } from "./src/handlers/send_sol_transaction";
import { sendTokenHandlers } from "./src/handlers/send_token_transaction";

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply("🤖 Welcome to Solana Wallet Bot!", mainKeyboard);
});

// Register handlers
walletHandlers(bot);
importHandlers(bot);
sendSolHandlers(bot);
sendTokenHandlers(bot);

bot.launch();
console.log("🚀 Bot running...");