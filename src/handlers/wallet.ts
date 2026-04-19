import { Telegraf } from "telegraf";
import { Keypair } from "@solana/web3.js";
import { USERS } from "../state";
import { connection } from "../config";
import { import_wallet } from "../import_wallet";

export function walletHandlers(bot: Telegraf) {

    bot.action("generate_wallet", (ctx) => {

        const userId = ctx.from?.id;
        if (!userId) return;

        if (USERS[userId]) {
            ctx.answerCbQuery("You already have a Wallet");
            const keypair = USERS[userId];
            const msg = `📁 Your Wallet:\n\n💳 Address: \`${keypair.publicKey.toBase58()}\`\n💰 Balance: 0.0000 SOL`;
            ctx.sendMessage(msg, { parse_mode: 'Markdown' });
            return;
        }
        ctx.answerCbQuery("Generating new wallet....");
        const keypair = Keypair.generate();
        USERS[userId] = keypair;

        const successMsg = `✅ **Wallet Generated Successfully!**\n\n💳 **Address:** \`${keypair.publicKey.toBase58()}\`\n`;
        ctx.sendMessage(successMsg, { parse_mode: 'Markdown' });
    })


    bot.action("your_wallet", async (ctx) => {
        ctx.answerCbQuery("Fetching your wallet....");
        const userId = ctx.from?.id;
        if (!userId) return;
        const keypair = USERS[userId];
        if (!keypair) {
            ctx.sendMessage("No wallet found. Please generate a wallet first.");
            return;
        }

        const balance = await connection.getBalance(keypair.publicKey)
        const msg = `📁 Your Wallet:\n\n💳 Address: \`${keypair.publicKey.toBase58()}\`\n💰 Balance: ${balance} SOL`;
        ctx.sendMessage(msg, { parse_mode: 'Markdown' });
    })

    bot.action("export_private_key", async (ctx) => {
        ctx.answerCbQuery("Exporting private key....");
        const userId = ctx.from?.id;
        if (!userId) return;
        const keypair = USERS[userId];
        if (!keypair) {
            ctx.reply("No wallet found. Please generate a wallet first.");
            return;
        }

        const msg = `\n\nYour Private Key: \`${Buffer.from(keypair.secretKey).toString('base64')}\`\n`;
        const sentMsg = await ctx.reply(msg, { parse_mode: 'Markdown' });

        // Delete after 5 seconds
        setTimeout(async () => {
            try {
                await ctx.deleteMessage(sentMsg.message_id);
            } catch (err) {
                console.error("Failed to delete message:", err);
            }
        }, 5000);
    });

    bot.action("replace_wallet", async (ctx) => {
        ctx.answerCbQuery("Replacing wallet...");
        const userId = ctx.from?.id;
        if (!userId) return;

        const keypair = USERS[userId];
        if (!keypair) {
            return ctx.sendMessage("You don't have a wallet to replace.");
        }

        // Delete the wallet from the database
        delete USERS[userId];
        const publicKey = keypair.publicKey.toBase58();
        const privateKey = Buffer.from(keypair.secretKey).toString('base64');

        const sentMsg = await ctx.sendMessage(
            `⚠️ **Wallet Deleted**\n\nWe no longer have this wallet in our database. Here is your old wallet information in case you need it:\n\n💳 **Public Key:** \`${publicKey}\`\n🔐 **Private Key:** \`${privateKey}\``,
            { parse_mode: 'Markdown' }
        );

        ctx.sendMessage("Now, please send your new private key to import.");

        // Delete after 10 seconds
        setTimeout(async () => {
            try {
                await ctx.deleteMessage(sentMsg.message_id);
            } catch (err) {
                console.error("Failed to delete message:", err);
            }
        }, 10000);

        import_wallet(bot, userId);
    });



}