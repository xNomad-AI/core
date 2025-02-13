import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { Injectable } from '@nestjs/common';
import bs58 from 'bs58';

@Injectable()
export class SolanaService {
  /**
   * Verify signature
   * @param message
   * @param signature
   * @param publicKey
   * @returns true | false
   */
  static verifySignature(
    message: string,
    signature: string,
    publicKey: string,
  ): boolean {
    try {
      const pubKeyBuffer = new PublicKey(publicKey).toBuffer();
      return nacl.sign.detached.verify(
        new TextEncoder().encode(message),
        bs58.decode(signature),
        pubKeyBuffer,
      );
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  static signMessage(message: string, secretKey: string): string {
    const secretKeyBuffer = bs58.decode(secretKey);
    const keyPair = nacl.sign.keyPair.fromSecretKey(secretKeyBuffer);
    const signature = nacl.sign.detached(
      new TextEncoder().encode(message),
      keyPair.secretKey,
    );
    return bs58.encode(signature);
  }
}
