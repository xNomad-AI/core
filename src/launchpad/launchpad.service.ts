import * as DID from '@ipld/dag-ucan/did';
import { create, fetchCollection } from '@metaplex-foundation/mpl-core';
import { createSignerFromKeypair, publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
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
import { ElizaManagerService } from '../agent/eliza-manager.service.js';
import { AmazonS3 } from '../shared/amazon-s3.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

const MIN_BALANCE_FOR_RENT_EXEMPTION = 0.003;
/**
 * 0.02 SOL for creating a token on pump.fun
 */
const CREATE_TOKEN_COST = 0.02;

@Injectable()
export class LaunchpadService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: TransientLoggerService,
    private readonly mongo: MongoService,
    private readonly elizaManager: ElizaManagerService,
  ) {
    this.logger.setContext(LaunchpadService.name);
  }

  async createCommonCollectionNft({
    chain,
    userAddress,
    nft,
    createToken,
  }: {
    chain: string;
    userAddress: string;
    nft: {
      name: string;
      image: string;
      description: string;
      knowledge: string[];
      personality?: string[];
      greeting?: string;
      lore?: string[];
      style?: string[];
      adjectives?: string[];
    };
    createToken?: {
      tokenInfo: {
        name: string;
        symbol: string;
        image: string;
        description: string;
        twitter?: string;
        telegram?: string;
        website?: string;
      };
      buyAmountSol: number;
    };
  }) {
    this.logger.log(
      `Creating common collection NFT for ${userAddress}, NFT: ${JSON.stringify(
        nft,
      )}`,
    );

    const { fee, feeAfterDiscount, discountPercentage, isXnomadOwner } =
      await this.calculateMintFee(userAddress);

    this.logger.log(
      JSON.stringify({
        isXnomadOwner,
        fee,
        feeAfterDiscount,
        discountPercentage,
      }),
    );

    const metadata = this.constructNftMetadata(nft);
    const uri = await this.uploadMetadataToWeb3Storage(
      metadata,
      `metadata.json`,
    );
    this.logger.log(`Uploaded metadata to Web3Storage: ${uri}`);

    const { asset, signers, instructions } =
      await this.constructMintCommonCollectionNftTx({
        userAddress,
        name: nft.name,
        uri,
        feeInSol: feeAfterDiscount,
      });

    if (createToken) {
      const mintKeypair = Keypair.generate();
      const nftId = `${chain}:${asset.publicKey.toBase58()}:${asset.publicKey.toBase58()}`;
      const now = new Date();

      await this.mongo.nftPrimaryCoins.insertOne({
        chain,
        nftId,
        coinInfo: {
          name: createToken.tokenInfo.name,
          symbol: createToken.tokenInfo.symbol,
          image: createToken.tokenInfo.image,
          description: createToken.tokenInfo.description,
          twitter: createToken.tokenInfo.twitter,
          telegram: createToken.tokenInfo.telegram,
          website: createToken.tokenInfo.website,
        },
        metadataUri: null,
        initialBuyAmountSol: createToken.buyAmountSol,
        mintAddress: mintKeypair.publicKey.toBase58(),
        mintSecretKey: bs58.encode(mintKeypair.secretKey),
        created: false,
        updatedAt: now,
        createdAt: now,
      });

      const { solanaKeypair: agentKeypair } =
        await this.elizaManager.getAgentAccountKeypair(chain, nftId);

      instructions.push(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(userAddress),
          toPubkey: agentKeypair.publicKey,
          lamports:
            (createToken.buyAmountSol +
              CREATE_TOKEN_COST +
              MIN_BALANCE_FOR_RENT_EXEMPTION) *
            LAMPORTS_PER_SOL,
        }),
      );
    }

    // construct tx
    const connection = new Connection(
      this.config.get<string>('SOLANA_RPC_URL')!,
    );
    const latestBlockhash = await connection.getLatestBlockhash();
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: new PublicKey(userAddress),
        recentBlockhash: latestBlockhash.blockhash,
        instructions,
      }).compileToV0Message(),
    );
    tx.sign(signers);
    const serializedTx = tx.serialize();

    return {
      tx: Buffer.from(serializedTx).toString('hex'),
      fee,
      feeAfterDiscount,
      discountPercentage,
    };
  }

  async calculateMintFee(userAddress: string) {
    const isXnomadOwner = await this.isXnomadOwner(userAddress);

    let [fee, feeAfterDiscount, discountPercentage] =
      process.env.RUN_ENV === 'dev'
        ? isXnomadOwner
          ? [0.001, 0.0003, 70]
          : [0.001, 0.001, 0]
        : isXnomadOwner
          ? [0.1, 0.03, 70]
          : [0.1, 0.1, 0];

    return { fee, feeAfterDiscount, discountPercentage, isXnomadOwner };
  }

  private constructNftMetadata(nft: {
    name: string;
    image: string;
    description: string;
    knowledge: string[];
    personality?: string[];
    greeting?: string;
    lore?: string[];
    style?: string[];
    adjectives?: string[];
  }) {
    return {
      name: nft.name,
      description: nft.description,
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
          bio: [nft.description],
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

    return {
      asset,
      signers: [asset, authority],
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
    };
  }

  async isXnomadOwner(userAddress: string) {
    const doc = await this.mongo.nftOwners.findOne({
      chain: 'solana',
      collectionId: this.config.get<string>('XNOMAD_COLLECTION_ID'),
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

  async createTokenMetadata(
    chain: string,
    address: string,
    metadata: {
      name: string;
      symbol: string;
      description: string;
      image: string;
      twitter?: string;
      telegram?: string;
      website?: string;
    },
  ): Promise<string> {
    const s3 = new AmazonS3(
      this.config.get('S3_BUCKET'),
      this.config.get('S3_ACCESS_KEY'),
      this.config.get('S3_SECRET_KEY'),
      this.config.get('S3_REGION'),
    );

    const metadataJson = {
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      image: metadata.image,
      showName: true,
      createdOn: 'https://pump.fun',
      ...(metadata.twitter && { twitter: metadata.twitter }),
      ...(metadata.telegram && { telegram: metadata.telegram }),
      ...(metadata.website && { website: metadata.website }),
    };

    const path = `metadata/${chain}/${address}.json`;

    await s3.addFileFromBuffer(
      Buffer.from(JSON.stringify(metadataJson, null, 2), 'utf-8'),
      path,
      'application/json',
    );

    let s3Url = this.config.get<string>('S3_URL');
    if (s3Url.endsWith('/')) s3Url = s3Url.slice(0, -1);
    return s3Url + '/' + path;
  }
}
