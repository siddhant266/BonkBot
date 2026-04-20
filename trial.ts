import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const owner = new PublicKey("GbdgNXD3eaFnhJPN9U7fEv78NmSwNQRFvvG8nkqS1bQv");

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function getAllTokens() {
    const [res1, res2] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM }),
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM }),
    ]);

    const all = [...res1.value, ...res2.value];

    return all.map((acc) => {
        const info = acc.account.data.parsed.info;
        return {
            mint: info.mint,
            amount: info.tokenAmount.uiAmount,
        };
    });
}

getAllTokens().then(console.log);