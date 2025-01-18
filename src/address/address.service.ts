import { BadRequestException, Injectable } from '@nestjs/common';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { AddressNonce, NonceType } from '../shared/mongo/types.js';
import { SolanaService } from '../shared/solana.service.js';

@Injectable()
export class AddressService {
  constructor(private readonly mongo: MongoService) {}

  async getNonce(chain: string, address: string, nonceType: NonceType) {
    const prompt = nonceType === 'login' ? 'sign in' : 'claim funds';
    const now = new Date();
    const expiration = new Date(now.getTime() + 60 * 1000);
    const message = `xNomad-core wants to ${prompt} with your account: ${address}, ${now.toISOString()}`;
    const nonce: AddressNonce = {
      chain,
      address,
      nonceType,
      message,
      expiration,
      updatedAt: now,
    };
    await this.mongo.addressNonces.updateOne(
      { chain, address, nonceType },
      { $set: nonce },
      { upsert: true },
    );
    return message;
  }

  async verifySignature(
    chain: string,
    address: string,
    nonceType: NonceType,
    signature: string,
  ) {
    const nonce = await this.mongo.addressNonces.findOne({
      chain,
      address,
      nonceType,
    });
    if (!nonce || nonce.expiration.getTime() < Date.now()) {
      throw new BadRequestException('Nonce expired');
    }
    return SolanaService.verifySignature(address, nonce.message, signature);
  }
}
