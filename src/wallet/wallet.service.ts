import { DeriveKeyProvider, TEEMode } from '@elizaos/plugin-tee';
import { Injectable } from '@nestjs/common';
import { Keypair, VersionedTransaction } from '@solana/web3.js';

@Injectable()
export class WalletService {
  async getWallet({
    walletSecretSalt,
    agentId,
    teeMode,
  }: {
    walletSecretSalt: string;
    agentId: string;
    teeMode: TEEMode;
  }) {
    const deriveKeyProvider = new DeriveKeyProvider(teeMode);
    const deriveKeyResult = await deriveKeyProvider.deriveEd25519Keypair(
      walletSecretSalt,
      'solana',
      agentId,
    );
    return {
      secretKey: deriveKeyResult.keypair.secretKey,
      publicKey: deriveKeyResult.keypair.publicKey,
    };
  }

  async getEvmWallet({
    walletSecretSalt,
    agentId,
    teeMode,
  }: {
    walletSecretSalt: string;
    agentId: string;
    teeMode: TEEMode;
  }) {
    const deriveKeyProvider = new DeriveKeyProvider(teeMode);
    const deriveKeyResult = await deriveKeyProvider.deriveEcdsaKeypair(
      walletSecretSalt,
      'evm',
      agentId,
    );
    return { address: deriveKeyResult.keypair.address };
  }

  async signSolanaTransaction({
    walletSecretSalt,
    agentId,
    teeMode,
    inputTransaction,
  }: {
    walletSecretSalt: string;
    agentId: string;
    teeMode: TEEMode;
    inputTransaction: string;
  }) {
    const wallet = await this.getWallet({
      walletSecretSalt,
      agentId,
      teeMode,
    });

    const transaction = VersionedTransaction.deserialize(
      Buffer.from(
        inputTransaction.startsWith('0x')
          ? inputTransaction.slice(2)
          : inputTransaction,
        'hex',
      ),
    );

    transaction.sign([Keypair.fromSecretKey(wallet.secretKey)]);

    return {
      publicKey: wallet.publicKey,
      transaction: Buffer.from(transaction.serialize()).toString('hex'),
    };
  }
}
