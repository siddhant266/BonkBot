import { Telegraf } from "telegraf";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { AWAITING_IMPORT, USERS } from "../state";
import { connection } from "../config";
import bs58 from "bs58";
import prisma from "../prisma";
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";



const CHSI_MINT = "AanZ2cNBWZnnm7F5ZXwCXawuvLJUCaWoiEeG5RSTKcRb";
async function syncUserTokens(userId: number, keypair: Keypair) {
    if (!keypair) return;

    // Query both token programs
    const [legacyAccounts, token2022Accounts] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(
            keypair.publicKey,
            { programId: TOKEN_PROGRAM_ID }
        ),
        connection.getParsedTokenAccountsByOwner(
            keypair.publicKey,
            { programId: TOKEN_2022_PROGRAM_ID }
        ),
    ]);

    // Merge both results
    const allAccounts = [
        ...legacyAccounts.value,
        ...token2022Accounts.value,
    ];

    // Find CHSI specifically
    const chsiAccount = allAccounts.find(
        (account) => account.account.data.parsed.info.mint === CHSI_MINT
    );

    if (!chsiAccount) {
        console.log("CHSI token account not found.");
        return;
    }

    const mint = CHSI_MINT;
    const symbol = "CHSI";

    await prisma.user.update({
        where: { telegramId: BigInt(userId) },
        data: { token_mint: mint, token_symbol: symbol },
    });

    return { mint, symbol };
}

export function walletHandlers(bot: Telegraf) {

    bot.action("generate_wallet", async (ctx) => {

        const userId = ctx.from?.id;
        if (!userId) return;

        // Check DB first
        const existingUser = await prisma.user.findUnique({
            where: { telegramId: BigInt(userId) },
        });

        if (existingUser) {
            // Restore keypair into memory cache from DB
            const secretKey = Buffer.from(existingUser.privateKey, "base64");
            USERS[userId] = Keypair.fromSecretKey(secretKey);
            ctx.answerCbQuery();
            ctx.sendMessage("You already have a wallet linked to your account.", { parse_mode: "Markdown" });
            return;
        }

        ctx.answerCbQuery("Generating new wallet....");
        const keypair = Keypair.generate();
        USERS[userId] = keypair;

        // Persist to database
        // In generate_wallet
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

        const successMsg = `✅ **Wallet Generated Successfully!**\n\n💳 **Address:** \`${keypair.publicKey.toBase58()}\`\n`;
        ctx.sendMessage(successMsg, { parse_mode: "Markdown" });
    });


    bot.action("your_wallet", async (ctx) => {
        ctx.answerCbQuery("Fetching your wallet....");
        const userId = ctx.from?.id;
        if (!userId) return;

        let keypair = USERS[userId.toString()]; // ← fix
        if (!keypair) {
            const dbUser = await prisma.user.findUnique({
                where: { telegramId: BigInt(userId) },
            });
            if (!dbUser) {
                ctx.sendMessage("No wallet found. Please generate or import a wallet first.");
                return;
            }
            keypair = Keypair.fromSecretKey(Buffer.from(dbUser.privateKey, "base64"));
            USERS[userId.toString()] = keypair; // ← fix
        }

        const token = await syncUserTokens(userId, keypair);

        const user = await prisma.user.findUnique({
            where: { telegramId: BigInt(userId) },
        });

        const balance = await connection.getBalance(keypair.publicKey);
        const solBalance = (balance / LAMPORTS_PER_SOL).toFixed(4);

        let msg =
            `📁 *Your Wallet*\n\n` +
            `💳 *Address:* \`${keypair.publicKey.toBase58()}\`\n` +
            `💰 *SOL Balance:* \`${solBalance} SOL\`\n`;

        const mint = token?.mint ?? (user?.token_mint || null);
        if (mint) {
            try {
                const ata = await getAssociatedTokenAddress(
                    new PublicKey(mint),
                    keypair.publicKey,
                    false,
                    TOKEN_2022_PROGRAM_ID  // ← CHSI is a Token-2022 token
                );
                const tokenBal = await connection.getTokenAccountBalance(ata);

                msg += `\n🪙 *Token:* \`CHSI\`\n`;
                msg += `💎 *Balance:* \`${tokenBal.value.uiAmountString} CHSI\`\n`;
            } catch {
                msg += `\n🪙 *Token:* CHSI\n`;
                msg += `💎 *Balance:* unavailable\n`;
            }
        }
        ctx.sendMessage(msg, { parse_mode: "Markdown" });
    });
    bot.action("export_private_key", async (ctx) => {
        ctx.answerCbQuery("Exporting private key....");
        const userId = ctx.from?.id;
        if (!userId) return;

        let keypair = USERS[userId.toString()];
        if (!keypair) {
            const dbUser = await prisma.user.findUnique({
                where: { telegramId: BigInt(userId) },
            });
            if (!dbUser) {
                ctx.reply("No wallet found. Please generate or import a wallet first.");
                return;
            }
            keypair = Keypair.fromSecretKey(Buffer.from(dbUser.privateKey, "base64"));
            USERS[userId] = keypair;
        }

        const msg = `\n\nYour Private Key: \`${Buffer.from(keypair.secretKey).toString("base64")}\`\n`;
        const sentMsg = await ctx.reply(msg, { parse_mode: "Markdown" });

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

        let keypair = USERS[userId.toString()];
        if (!keypair) {
            const dbUser = await prisma.user.findUnique({
                where: { telegramId: BigInt(userId) },
            });
            if (!dbUser) {
                return ctx.sendMessage("You don't have a wallet to replace.");
            }
            keypair = Keypair.fromSecretKey(Buffer.from(dbUser.privateKey, "base64"));
        }

        // Remove from memory and DB
        delete USERS[userId];
        await prisma.user.delete({ where: { telegramId: BigInt(userId) } });

        const publicKey = keypair.publicKey.toBase58();
        const privateKey = Buffer.from(keypair.secretKey).toString("base64");

        const sentMsg = await ctx.sendMessage(
            `⚠️ **Wallet Deleted**\n\nWe no longer have this wallet in our database. Here is your old wallet information in case you need it:\n\n💳 **Public Key:** \`${publicKey}\`\n🔐 **Private Key:** \`${privateKey}\``,
            { parse_mode: "Markdown" }
        );

        ctx.sendMessage("Now, please send your new private key to import.");
        AWAITING_IMPORT[userId.toString()] = true;

        // Delete after 10 seconds
        setTimeout(async () => {
            try {
                await ctx.deleteMessage(sentMsg.message_id);
            } catch (err) {
                console.error("Failed to delete message:", err);
            }
        }, 10000);


    });
    bot.on("text", async (ctx, next) => {
        const userId = ctx.from?.id;

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

            ctx.reply(`✅ **Wallet Replaced Successfully!**\n\n💳 **Address:** \`${keypair.publicKey.toBase58()}\`\n\n_Your wallet is now securely linked!_`, { parse_mode: 'Markdown' });

            // Delete the message containing the private key for security
            ctx.deleteMessage().catch(() => { });
        } catch (e) {
            delete AWAITING_IMPORT[userId.toString()]; // ✅ IMPORTANT
            ctx.reply("❌ Invalid Private Key format. Ensure you pasted it correctly.\nTry again or type /start to cancel the import.");
        }
    });



}

