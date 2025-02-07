import * as DID from '@ipld/dag-ucan/did';
import { create, fetchCollection } from '@metaplex-foundation/mpl-core';
import { createSignerFromKeypair, publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import * as Client from '@web3-storage/w3up-client';
import { Signer } from '@web3-storage/w3up-client/principal/ed25519';
import * as Proof from '@web3-storage/w3up-client/proof';
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory';
import bs58 from 'bs58';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

@Injectable()
export class LaunchpadService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: TransientLoggerService,
    private readonly mongo: MongoService,
  ) {
    this.logger.setContext(LaunchpadService.name);
  }

  async createCommonCollectionNft(
    userAddress: string,
    nft: {
      name: string;
      image: string;
      description: string[];
      knowledge: string[];
      personality?: string[];
      greeting?: string;
      lore?: string[];
      style?: string[];
      adjectives?: string[];
    },
  ) {
    this.logger.log(
      `Creating common collection NFT for ${userAddress}, NFT: ${JSON.stringify(
        nft,
      )}`,
    );

    const isXnomadOwner = await this.isXnomadOwner(userAddress);

    const [fee, feeAfterDiscount, discountPercentage] = isXnomadOwner
      ? [0.1, 0.03, 70]
      : [0.1, 0.1, 0];

    this.logger.log(
      JSON.stringify({
        isXnomadOwner,
        fee,
        feeAfterDiscount,
        discountPercentage,
      }),
    );

    // construct metadata
    const metadata = {
      name: nft.name,
      description: nft.description.join('\n'),
      image: nft.image,
      attributes: [],
      properties: {
        files: [
          {
            uri: nft.image,
            type: 'image/png',
          },
        ],
        category: 'image',
      },
      ai_agent: {
        engine: 'eliza',
        character: {
          name: nft.name,
          plugins: [],
          bio: nft.description,
          lore: nft.lore || [],
          knowledge: nft.knowledge || [],
          messageExamples: [],
          postExamples: nft.greeting || [],
          topics: [],
          style: {
            all: nft.style || [],
            chat: [],
            post: [],
          },
          adjectives: [].concat(nft.adjectives || [], nft.personality || []),
        },
      },
    };

    const uri = await this.uploadMetadataToWeb3Storage(
      metadata,
      `metadata.json`,
    );
    this.logger.log(`Uploaded metadata to Web3Storage: ${uri}`);

    const serializedTx = await this.constructMintCommonCollectionNftTx({
      userAddress,
      name: nft.name,
      uri,
      feeInSol: fee,
    });

    return {
      tx: serializedTx,
      fee,
      feeAfterDiscount,
      discountPercentage,
    };
  }

  async uploadMetadataToWeb3Storage(metadata: any, filename: string) {
    const client = await this.createWeb3StorageClient({
      privateKey: this.config.get('WEB3_STORAGE_PRIVATE_KEY'),
      proof: this.config.get('WEB3_STORAGE_PROOF'),
    });

    const cid = await client.uploadDirectory([
      new File([JSON.stringify(metadata, null, 2)], filename, {
        type: 'application/json',
      }),
    ]);

    return `https://${cid}.ipfs.w3s.link/${filename}`;
  }

  async constructMintCommonCollectionNftTx({
    userAddress,
    name,
    uri,
    feeInSol,
  }: {
    userAddress: string;
    name: string;
    uri: string;
    feeInSol: number;
  }) {
    const keypairToSigner = (keypair: Keypair) =>
      createSignerFromKeypair(umi, {
        publicKey: publicKey(keypair.publicKey),
        secretKey: keypair.secretKey,
      });

    const umi = createUmi(this.config.get<string>('SOLANA_RPC_URL')!, {
      commitment: 'confirmed',
    });
    const authority = Keypair.fromSecretKey(
      bs58.decode(
        this.config.get<string>(
          'SOLANA_COMMON_COLLECTION_AUTHORITY_PRIVATE_KEY',
        ),
      ),
    );

    const collection = await fetchCollection(
      umi,
      this.config.get<string>('SOLANA_COMMON_COLLECTION_ADDRESS'),
    );
    const asset = Keypair.generate();

    const txBuilder = create(umi, {
      asset: keypairToSigner(asset),
      name,
      uri,
      collection,
      authority: keypairToSigner(authority),
      payer: {
        publicKey: publicKey(userAddress),
      } as any,
      owner: publicKey(userAddress),
    });

    const latestBlockhash = await umi.rpc.getLatestBlockhash();

    let versionedTransaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: new PublicKey(userAddress),
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          ...txBuilder.getInstructions().map(
            (i) =>
              new TransactionInstruction({
                programId: new PublicKey(i.programId),
                keys: i.keys.map((k) => ({
                  pubkey: new PublicKey(k.pubkey),
                  isSigner: k.isSigner,
                  isWritable: k.isWritable,
                })),
                data: Buffer.from(i.data),
              }),
          ),
          // launchpad fee
          SystemProgram.transfer({
            fromPubkey: new PublicKey(userAddress),
            toPubkey: new PublicKey(
              this.config.get<string>('SOLANA_LAUNCHPAD_FEE_RECIPIENT_ADDRESS'),
            ),
            lamports: feeInSol * LAMPORTS_PER_SOL,
          }),
        ],
      }).compileToV0Message(),
    );

    versionedTransaction.sign([asset, authority]);
    return versionedTransaction.serialize();
  }

  async isXnomadOwner(userAddress: string) {
    const doc = await this.mongo.nftOwners.findOne({
      chain: 'solana',
      contractAddress: this.config.get<string>(
        'SOLANA_COMMON_COLLECTION_ADDRESS',
      ),
      ownerAddress: userAddress,
    });
    return doc !== null;
  }

  async createWeb3StorageDelegation(did: string): Promise<Uint8Array> {
    const audience = DID.parse(did);
    const expiration = Math.floor(Date.now() / 1000) + 60 * 30; // 30 minutes

    const client = await this.createWeb3StorageClient({
      privateKey: this.config.get('WEB3_STORAGE_PRIVATE_KEY'),
      proof: this.config.get('WEB3_STORAGE_PROOF'),
    });

    const delegation = await client.createDelegation(
      audience,
      ['space/blob/add', 'space/index/add', 'upload/add', 'filecoin/offer'],
      {
        expiration,
      },
    );
    const archive = await delegation.archive();
    return archive.ok;
  }

  async createWeb3StorageClient(web3StorageConfig: {
    privateKey: string;
    proof: string;
  }) {
    const principal = Signer.parse(web3StorageConfig.privateKey);
    const proof = await Proof.parse(web3StorageConfig.proof);

    const store = new StoreMemory();
    const client = await Client.create({
      principal,
      store,
    });
    const space = await client.addSpace(proof);
    await client.setCurrentSpace(space.did());

    return client;
  }
}
