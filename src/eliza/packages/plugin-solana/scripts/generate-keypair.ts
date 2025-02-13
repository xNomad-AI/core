import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const keypair = Keypair.generate();
console.log('keypair:');

console.log('address:', keypair.publicKey.toBase58());
// base58
console.log('private key:', bs58.encode(keypair.secretKey));
