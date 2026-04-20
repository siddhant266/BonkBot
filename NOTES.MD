## 🚧 Future Updates

- [ ] **Multi-token support** — currently only one token is stored per user in the database (`token_mint`, `token_symbol`). Migrate to a separate `Token` table to support multiple SPL tokens per wallet.

- [ ] **Transaction history** — history currently shows raw Solana Explorer links. Update to display parsed details (amount, sender, receiver, token type, timestamp) in a readable format directly in the bot.

- [ ] **Token symbol resolution** — token symbol is hardcoded as `CHSI`. Integrate Metaplex metadata program to automatically resolve symbol and name for any SPL/Token-2022 mint.

