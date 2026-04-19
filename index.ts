import { Telegraf } from "telegraf";
import { BOT_TOKEN } from "./src/config";
import { mainKeyboard } from "./src/keyboards";

import { walletHandlers } from "./src/handlers/wallet";
import { importHandlers } from "./src/handlers/import";
import { transactionHandlers } from "./src/handlers/transactions";

const bot = new Telegraf("8547372652:AAEVQzHcV0YL94BwIb3pmGNT0eG3fOfSkyA");

bot.start((ctx) => {
    ctx.reply("🤖 Welcome to Solana Wallet Bot!", mainKeyboard);
});

// Register handlers
walletHandlers(bot);
importHandlers(bot);
transactionHandlers(bot);

bot.launch();
console.log("🚀 Bot running...");