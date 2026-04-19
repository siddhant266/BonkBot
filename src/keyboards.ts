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