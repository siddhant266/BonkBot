import { Telegraf } from "telegraf";

export function transactionHandlers(bot: Telegraf) {

    bot.action("tx_history", (ctx) => {
        ctx.reply("No transactions yet");
    });

    bot.action("send_sol_menu", (ctx) => {
        ctx.reply("Enter address + amount");
    });

    bot.action("send_token_menu", (ctx) => {
        ctx.reply("Token send not implemented");
    });
}