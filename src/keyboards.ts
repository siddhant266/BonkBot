import { Markup } from "telegraf";

export const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("🔑 Generate Wallet", "generate_wallet")],
    [
        Markup.button.callback("📁 Your Wallet", "your_wallet"),
        Markup.button.callback("📊 Transaction History", "tx_history"),
    ],
    [
        Markup.button.callback("🔐 Export Private Key", "export_private_key"),
        Markup.button.callback("🔐 Import Wallet", "import_wallet"),
    ],
    [
        Markup.button.callback("💸 Send SOL", "send_sol_menu"),
        Markup.button.callback("🪙 Send Token", "send_token_menu"),
    ],
]);

export const sendSolCancelKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("❌ Cancel", "send_sol_cancel")],
]);

export const sendSolConfirmKeyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback("✅ Confirm Send", "send_sol_confirm"),
        Markup.button.callback("❌ Cancel", "send_sol_cancel"),
    ],
]);

export const sendTokenCancelKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("❌ Cancel", "send_token_cancel")],
]);

export const sendTokenConfirmKeyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback("✅ Confirm Send", "send_token_confirm"),
        Markup.button.callback("❌ Cancel", "send_token_cancel"),
    ],
]);
