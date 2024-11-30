"use client";
import {
  LightSystemProgram,
  Rpc,
  bn,
  buildTx,
  confirmTx,
  createRpc,
  defaultTestStateTreeAccounts,
  selectMinCompressedSolAccountsForTransfer,
} from "@lightprotocol/stateless.js";
import {
  ComputeBudgetProgram,
  Keypair, PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import React, { FC, useCallback, useMemo } from "react";
import { createMint, mintTo, transfer } from "@lightprotocol/compressed-token";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { UnsafeBurnerWalletAdapter } from "@solana/wallet-adapter-unsafe-burner";
import {
  WalletModalProvider,
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";

// Default styles that can be overridden by your app
require("@solana/wallet-adapter-react-ui/styles.css");
//创建本地连接
let connectionForTest:Rpc = createRpc();
// 定义全局的payer和tokenRecipient，这里简单示例，实际可能需要根据具体情况处理
const payer = Keypair.generate();
const tokenRecipient = Keypair.generate();
export default function Home() {
  /// Testnet:
  // const endpoint = useMemo(() => "http://zk-testnet.helius.dev:8899", []);
  const endpoint = useMemo(() => "http://127.0.0.1:8899", []);
  const wallets = useMemo(() => [new UnsafeBurnerWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletMultiButton/>
          <WalletDisconnectButton/>
          <div>
            <label style={{fontSize: "1.5rem"}}>
              Welcome to this very simple example using Compression in a browser
              :)
            </label>
          </div>
          <div>
            <label>Check the terminal for tx signatures!</label>
          </div>
          <SendButton/>
          <br/>
          {/*加入测试按钮*/}
          <TestConnectionButton/>
          <br/>
          <PerformTokenOperationsButton />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

const SendButton: FC = () => {
  const { publicKey, sendTransaction } = useWallet();

  const onClick = useCallback(async () => {
    /// Get Connection with compatibility to Compression API
    const connection: Rpc = createRpc();

    if (!publicKey) throw new WalletNotConnectedError();

    /// airdrop
    await confirmTx(
      connection,
      await connection.requestAirdrop(publicKey, 1e9)
    );

    /// compress to self
    const compressInstruction = await LightSystemProgram.compress({
      payer: publicKey,
      toAddress: publicKey,
      lamports: 1e8,
      outputStateTree: defaultTestStateTreeAccounts().merkleTree,
    });

    const compressInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      compressInstruction,
    ];

    const {
      context: { slot: minContextSlot },
      value: blockhashCtx,
    } = await connection.getLatestBlockhashAndContext();

    const tx = buildTx(compressInstructions, publicKey, blockhashCtx.blockhash);

    const signature = await sendTransaction(tx, connection, {
      minContextSlot,
    });

    await connection.confirmTransaction({
      blockhash: blockhashCtx.blockhash,
      lastValidBlockHeight: blockhashCtx.lastValidBlockHeight,
      signature,
    });

    console.log(
      `Compressed ${1e8} lamports! txId: https://explorer.solana.com/tx/${signature}?cluster=custom`
    );

    /// Send compressed SOL to a random address
    const recipient = Keypair.generate().publicKey;

    /// 1. We need to fetch our sol balance
    const accounts = await connection.getCompressedAccountsByOwner(publicKey);

    console.log("accounts", accounts.items);
    const [selectedAccounts, _] = selectMinCompressedSolAccountsForTransfer(
      accounts.items,
      1e7
    );

    console.log("selectedAccounts", selectedAccounts);
    /// 2. Retrieve validity proof for our selected balance
    const { compressedProof, rootIndices } = await connection.getValidityProof(
      selectedAccounts.map((account) => bn(account.hash))
    );

    /// 3. Create and send compressed transfer
    const sendInstruction = await LightSystemProgram.transfer({
      payer: publicKey,
      toAddress: recipient,
      lamports: 1e7,
      inputCompressedAccounts: selectedAccounts,
      outputStateTrees: [defaultTestStateTreeAccounts().merkleTree],
      recentValidityProof: compressedProof,
      recentInputStateRootIndices: rootIndices,
    });
    const sendInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      sendInstruction,
    ];

    const {
      context: { slot: minContextSlotSend },
      value: {
        blockhash: blockhashSend,
        lastValidBlockHeight: lastValidBlockHeightSend,
      },
    } = await connection.getLatestBlockhashAndContext();

    const messageV0Send = new TransactionMessage({
      payerKey: publicKey,
      recentBlockhash: blockhashSend,
      instructions: sendInstructions,
    }).compileToV0Message();

    const transactionSend = new VersionedTransaction(messageV0Send);

    const signatureSend = await sendTransaction(transactionSend, connection, {
      minContextSlot: minContextSlotSend,
    });

    await connection.confirmTransaction({
      blockhash: blockhashSend,
      lastValidBlockHeight: lastValidBlockHeightSend,
      signature: signatureSend,
    });

    console.log(
      `Sent ${1e7} lamports to ${recipient.toBase58()} ! txId: https://explorer.solana.com/tx/${signatureSend}?cluster=custom`
    );
  }, [publicKey, sendTransaction]);

  return (
    <button
      style={{
        fontSize: "1rem",
        padding: "1rem",
        backgroundColor: "#0066ff",
        cursor: "pointer",
      }}
      onClick={onClick}
      disabled={!publicKey}
    >
      Get airdrop, compress and send SOL to a random address!
    </button>
  );
};


const TestConnectionButton: FC = () => {
  const onClick = useCallback(async () => {
    try {
      let slot = await connectionForTest.getSlot();
      console.log("=====" + slot);

      let health = await connectionForTest.getIndexerHealth(slot);
      console.log("+++++"+health);
      // "Ok"
    } catch (error) {
      console.error("Error testing the connection:", error);
    }
  }, []);

  return (
      <button
          style={{
            fontSize: "1rem",
            padding: "1rem",
            backgroundColor: "#ff0000",
            cursor: "pointer",
          }}
          onClick={onClick}
          disabled={!connectionForTest}
      >
        测试连接
      </button>

  );
}

const TestCompressedTokenButton: FC = () => {
  const onClick = useCallback(async () => {
    try {
      const publicKey = new PublicKey('CLEuMG7pzJX9xAuKCFzBP154uiG1GaNo4Fq7x6KAcAfG');
      (async () => {
        // Returns balance for owner per mint
        // Can optionally apply filter: {mint, limit, cursor}
        const balances =
            await connectionForTest.getCompressedTokenBalancesByOwner(publicKey);
        console.log(balances);
      })();
    } catch (error) {
      console.error("Error testing the connection:", error);
    }
  }, []);

  return (
      <button
          style={{
            fontSize: "1rem",
            padding: "1rem",
            backgroundColor: "#ff0000",
            cursor: "pointer",
          }}
          onClick={onClick}
          disabled={!connectionForTest}
      >
        测试显示压缩token余额
      </button>
  );
}

const PerformTokenOperationsButton: FC = () => {
  const { publicKey, sendTransaction } = useWallet();

  const onClick = useCallback(async () => {
    if (!publicKey) throw new WalletNotConnectedError();

    try {
      // Airdrop lamports to pay fees
      await confirmTx(
          connectionForTest,
          await connectionForTest.requestAirdrop(payer.publicKey, 10e9)
      );

      await confirmTx(
          connectionForTest,
          await connectionForTest.requestAirdrop(tokenRecipient.publicKey, 1e6)
      );

      // Create a compressed token mint
      const { mint, transactionSignature } = await createMint(
          connectionForTest,
          payer,
          payer.publicKey,
          9 // Number of decimals
      );

      console.log(`create-mint  success! txId: ${transactionSignature}`);

      // Mint compressed tokens to the payer's account
      const mintToTxId = await mintTo(
          connectionForTest,
          payer,
          mint,
          payer.publicKey, // Destination
          payer,
          1e9 // Amount
      );

      console.log(`Minted 1e9 tokens to ${payer.publicKey} was a success!`);
      console.log(`txId: ${mintToTxId}`);

      // Transfer compressed tokens
      // @ts-ignore
      const transferTxId = await transfer(
          connectionForTest,
          payer,
          mint,
          7e8, // Amount
          payer, // Owner
          tokenRecipient.publicKey // To address
      );

      console.log(`Transfer of 7e8 ${mint} to ${tokenRecipient.publicKey} was a success!`);
      console.log(`txId: ${transferTxId}`);
    } catch (error) {
      console.error("Error performing token operations:", error);
    }
  }, [publicKey, sendTransaction]);

  return (
      <button
          style={{
            fontSize: "1rem",
            padding: "1rem",
            backgroundColor: "#0066ff",
            cursor: "pointer",
          }}
          onClick={onClick}
          disabled={!publicKey}
      >
        交易操作
      </button>
  );
}