import { createCollection, ruleSet } from '@metaplex-foundation/mpl-core';
import {
  addConfigLines,
  create as createCandyMachine,
  DefaultGuardSetMintArgs,
  fetchCandyGuard,
  fetchCandyMachine,
  getMerkleProof,
  getMerkleRoot,
  mintV1,
  route,
  safeFetchAllowListProofFromSeeds,
  safeFetchCandyMachine,
  safeFetchMintCounterFromSeeds,
} from '@metaplex-foundation/mpl-core-candy-machine';
import {
  createSignerFromKeypair,
  dateTime,
  isSome,
  publicKey,
  sol,
  some,
  TransactionBuilder,
  Umi,
} from '@metaplex-foundation/umi';
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
import bs58 from 'bs58';
import JSZip from 'jszip';
import { ObjectId } from 'mongodb';
import { AmazonS3 } from '../shared/amazon-s3.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { Swarm, SwarmMintStage } from '../shared/mongo/types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

export interface CreateSwarmParams {
  name: string;
  logo: string;
  description: string;
  creatorInfo: {
    address: string;
    email: string;
    recipientAddress: string;
    royaltyBps: number;
  };
  socialMedia: {
    website: string;
    discord: string;
    twitter: string;
  };
  aiAgentSettings: {
    background: string;
    style: string[];
  };
  mintStages: SwarmMintStage[];
  allowBindAgentToken: boolean;
}

@Injectable()
export class SwarmService {
  constructor(
    private readonly config: ConfigService,
    private readonly mongo: MongoService,
    private readonly logger: TransientLoggerService,
  ) {
    this.logger.setContext('SwarmService');
  }

  async createSwarm(params: CreateSwarmParams) {
    this.validateCreateSwarmParams(params);

    const id = new ObjectId();
    await this.mongo.swarms.insertOne({
      _id: id as any,
      chain: 'solana',
      name: params.name,
      logo: params.logo,
      description: params.description,
      creatorInfo: params.creatorInfo,
      socialMedia: params.socialMedia,
      aiAgentSettings: params.aiAgentSettings,
      mintStages: params.mintStages,
      allowBindAgentToken: params.allowBindAgentToken,

      collectionAddress: null as any,
      candyMachine: {
        address: null as any,
        itemsLoaded: 0,
        prefixName: `${params.name} #`,
        prefixUri: `${this.config.get('S3_URL')}/metadata/solana/collection/${id}/`,
      },
      maxSupply: null as any,
      collectionMetadataUri: null as any,
      nftMetadataUploaded: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.logger.log(`Swarm created, id: ${id.toString()}`);

    return {
      swarmId: id.toString(),
    };
  }

  validateCreateSwarmParams(params: CreateSwarmParams) {
    if (
      typeof params.name !== 'string' ||
      !params.name ||
      params.name.length > 20
    ) {
      throw new Error('Invalid name');
    }
    if (typeof params.logo !== 'string' || !params.logo) {
      throw new Error('Invalid logo');
    }
    if (
      typeof params.description !== 'string' ||
      !params.description ||
      params.description.length > 500
    ) {
      throw new Error('Invalid description');
    }
    if (typeof params.creatorInfo !== 'object' || !params.creatorInfo) {
      throw new Error('Invalid creator info');
    }
    if (
      typeof params.creatorInfo.address !== 'string' ||
      !params.creatorInfo.address
    ) {
      throw new Error('Invalid creator address');
    }
    try {
      new PublicKey(params.creatorInfo.address);
    } catch (e) {
      throw new Error('Invalid creator address');
    }
    if (
      typeof params.creatorInfo.email !== 'string' ||
      !params.creatorInfo.email
    ) {
      throw new Error('Invalid email');
    }
    if (
      typeof params.creatorInfo.recipientAddress !== 'string' ||
      !params.creatorInfo.recipientAddress
    ) {
      throw new Error('Invalid recipient address');
    }
    try {
      new PublicKey(params.creatorInfo.recipientAddress);
    } catch (e) {
      throw new Error('Invalid recipient address');
    }
    if (
      !Number.isInteger(params.creatorInfo.royaltyBps) ||
      params.creatorInfo.royaltyBps < 0 ||
      params.creatorInfo.royaltyBps > 10000
    ) {
      throw new Error('Invalid royalty');
    }
    if (!Array.isArray(params.mintStages) || !params.mintStages.length) {
      throw new Error('Invalid mint stages');
    }
    params.mintStages.forEach((stage) => {
      if (stage.price < 0) {
        throw new Error('Invalid mint stage price');
      }
      if (stage.startTime >= stage.endTime) {
        throw new Error('Invalid mint stage time');
      }
    });
  }

  async processNftMetadataFile(file: Express.Multer.File) {
    const launchpadConfig = this.getSwarmLaunchpadConfig();

    const zip = await new JSZip().loadAsync(file.buffer);
    const entries = Object.entries(zip.files).filter(([, file]) => !file.dir);

    const sortEntries = (entries: [string, JSZip.JSZipObject][]) => {
      return entries.sort((a, b) => {
        const aNum = parseInt(a[0].split('.')[0]);
        const bNum = parseInt(b[0].split('.')[0]);
        return aNum - bNum;
      });
    };
    const jsonEntries = sortEntries(
      entries.filter(([name]) => name.endsWith('.json')),
    );
    const imageEntries = sortEntries(
      entries.filter(([name]) => !name.endsWith('.json')),
    );

    if (jsonEntries.length !== imageEntries.length) {
      throw new Error('json and image count mismatch');
    }
    if (jsonEntries.length >= launchpadConfig.nftMaxSupply) {
      throw new Error('nft supply limit reached');
    }

    const checkNameInEntries = (entries: [string, any][]) => {
      for (let i = 0; i < entries.length; i++) {
        const [name] = entries[i];
        const prefix = parseInt(name.split('.')[0]);
        if (prefix !== i) {
          throw new Error(`Invalid file name: ${name}`);
        }
      }
    };
    checkNameInEntries(jsonEntries);
    checkNameInEntries(imageEntries);

    const images = await Promise.all(
      imageEntries.map(async ([, file]) => {
        const content = await file.async('nodebuffer');
        return content;
      }),
    );
    const jsons = await Promise.all(
      jsonEntries.map(async ([, file]) => {
        const content = await file.async('nodebuffer');
        return JSON.parse(content.toString('utf-8'));
      }),
    );

    return {
      images,
      jsons,
    };
  }

  // TODO: add instruction to transfer some funds to the collection authority from the payer
  async constructCreateCollectionTx({
    umi,
    name,
    uri,
    payer,
    collection,
    collectionAuthorityAddress,
    royaltyBps,
    royaltyRecipient,
  }: {
    umi: Umi;
    name: string;
    uri: string;
    payer: string;
    collection?: Keypair;
    collectionAuthorityAddress: string;
    royaltyBps: number;
    royaltyRecipient: string;
  }) {
    collection = collection ?? Keypair.generate();
    const collectionSigner = createSignerFromKeypair(umi, {
      secretKey: collection.secretKey,
      publicKey: publicKey(collection.publicKey),
    });

    const txBuilder = createCollection(umi, {
      payer: {
        publicKey: publicKey(payer),
      } as any,
      collection: collectionSigner,
      name,
      uri,
      updateAuthority: publicKey(collectionAuthorityAddress),
      plugins: royaltyBps
        ? [
            {
              type: 'Royalties',
              basisPoints: royaltyBps,
              creators: [
                {
                  address: publicKey(royaltyRecipient),
                  percentage: 100,
                },
              ],
              ruleSet: ruleSet('None'),
            },
          ]
        : undefined,
    });

    return {
      collection,
      signers: [collection],
      instructions: this.extractUmiTxBuilderInstructions(txBuilder),
    };
  }

  async constructCreateCandyMachineTx({
    umi,
    collectionAddress,
    candyMachine,
    collectionUpdateAuthority,
    maxSupply,
    prefixName,
    prefixUri,
    mintStages,
    mintFeeRecipient,
  }: {
    umi: Umi;
    collectionAddress: string;
    candyMachine?: Keypair;
    collectionUpdateAuthority: Keypair;
    maxSupply: number;
    prefixName: string;
    prefixUri: string;
    mintStages: SwarmMintStage[];
    mintFeeRecipient: string;
  }) {
    candyMachine = candyMachine ?? Keypair.generate();
    const candyMachineSigner = createSignerFromKeypair(umi, {
      secretKey: candyMachine.secretKey,
      publicKey: publicKey(candyMachine.publicKey),
    });
    const collectionUpdateAuthoritySigner = createSignerFromKeypair(umi, {
      secretKey: collectionUpdateAuthority.secretKey,
      publicKey: publicKey(collectionUpdateAuthority.publicKey),
    });

    const txBuilder = await createCandyMachine(umi, {
      candyMachine: candyMachineSigner,
      collection: publicKey(collectionAddress),
      collectionUpdateAuthority: collectionUpdateAuthoritySigner,
      itemsAvailable: maxSupply,
      configLineSettings: some({
        prefixName,
        nameLength: 5,
        prefixUri,
        uriLength: 12,
        isSequential: false,
      }),
      groups:
        mintStages.length > 0
          ? mintStages.map((stage, index) => ({
              label: String(index),
              guards: {
                startDate: some({ date: dateTime(new Date(stage.startTime)) }),
                endDate: some({ date: dateTime(new Date(stage.endTime)) }),
                solPayment:
                  stage.price > 0
                    ? some({
                        lamports: sol(stage.price * LAMPORTS_PER_SOL),
                        destination: publicKey(mintFeeRecipient),
                      })
                    : undefined,
                mintLimit: some({
                  id: index,
                  limit: stage.maxMintsPerAddress,
                }),
                allowList: stage.whitelistAddresses?.length
                  ? some({
                      merkleRoot: getMerkleRoot(stage.whitelistAddresses),
                    })
                  : undefined,
              },
            }))
          : undefined,
    });

    return {
      candyMachine,
      signers: [candyMachine, collectionUpdateAuthority],
      instructions: this.extractUmiTxBuilderInstructions(txBuilder),
    };
  }

  async addNftsToCandyMachine(
    umi: Umi,
    candyMachineAddress: string,
    maxSupply: number,
    batchSize: number,
    fromBeginning = false,
  ) {
    const startIndex = fromBeginning
      ? 0
      : await fetchCandyMachine(umi, publicKey(candyMachineAddress)).then(
          (candyMachine) => candyMachine.itemsLoaded,
        );

    for (let i = startIndex; i < maxSupply; i += batchSize) {
      this.logger.log(
        `add config lines, index: ${i}~${Math.min(batchSize, maxSupply - i)}`,
      );
      await addConfigLines(umi, {
        candyMachine: publicKey(candyMachineAddress),
        index: i,
        configLines: Array.from(
          { length: Math.min(batchSize, maxSupply - i) },
          (_, j) => ({
            name: String(i + j),
            uri: `${String(i + j)}.json`,
          }),
        ),
      }).sendAndConfirm(umi);
    }

    return fetchCandyMachine(umi, publicKey(candyMachineAddress)).then(
      (candyMachine) => candyMachine.itemsLoaded,
    );
  }

  async uploadNftMetadata(
    swarmId: string,
    swarm: Swarm,
    images: Buffer[],
    jsons: any[],
  ) {
    const s3 = new AmazonS3(
      this.config.get('S3_BUCKET'),
      this.config.get('S3_ACCESS_KEY'),
      this.config.get('S3_SECRET_KEY'),
      this.config.get('S3_REGION'),
    );

    this.logger.log(`uploading images, swarmId: ${swarmId}`);
    const imageUrls = await Promise.all(
      images.map(async (image, index) => {
        const path = this.getNftImagePath(swarmId, index);
        await s3.addFileFromBuffer(image, path);
        return this.config.get('S3_URL') + '/' + path;
      }),
    );

    // construct AI-NFT metadata
    jsons = jsons.map((json, index) => {
      json.image = imageUrls[index];
      json = this.constructAiNftMetadata({
        name: json.name,
        json,
        background: swarm.aiAgentSettings.background,
        style: swarm.aiAgentSettings.style,
      });
      return json;
    });

    this.logger.log(`uploading metadata, swarmId: ${swarmId}`);
    const nftUris = await Promise.all(
      jsons.map(async (json, index) => {
        const path = this.getNftMetadataPath(swarmId, index);
        await s3.addFileFromBuffer(
          Buffer.from(JSON.stringify(json, null, 2)),
          path,
          'application/json',
        );
        return this.config.get('S3_URL') + '/' + path;
      }),
    );

    return nftUris;
  }

  constructCollectionMetadata({
    name,
    description,
    image,
    imageMineType,
    externalUrl,
  }: {
    name: string;
    description: string;
    image: string;
    imageMineType: string;
    externalUrl: string;
  }) {
    return {
      name,
      description,
      image,
      external_url: externalUrl,
      attributes: [],
      properties: {
        files: [
          {
            uri: image,
            type: imageMineType,
          },
        ],
        category: 'image',
      },
    };
  }

  constructAiNftMetadata({
    name,
    json,
    background,
    style,
  }: {
    name: string;
    json: {
      attributes: {
        trait_type: string;
        value: string;
      }[];
    };
    background: string;
    style: string[];
  }) {
    return {
      ...json,
      ai_agent: {
        engine: 'eliza',
        character: {
          name,
          bio: (json.attributes || []).map(
            (attr) => `${attr.trait_type}: ${attr.value}`,
          ),
          lore: [background],
          knowledge: [],
          messageExamples: [],
          postExamples: [],
          topics: [],
          style: {
            all: style,
            chat: [],
            post: [],
          },
          adjectives: [],
        },
      },
    };
  }

  /**
   * get user mint count for each mint stage
   */
  async getUserMintCounts(swarm: Swarm, userAddress: string) {
    const umi = createUmi(this.config.get<string>('SOLANA_RPC_URL')!, {
      commitment: 'processed',
    });

    const candyMachineAddress = swarm.candyMachine.address;
    const candyMachine = await safeFetchCandyMachine(
      umi,
      publicKey(candyMachineAddress),
    );
    if (!candyMachine) {
      this.logger.warn(`Candy machine not found: ${candyMachineAddress}`);
      return 0;
    }

    const mintCounts = [];

    for (let i = 0; i < swarm.mintStages.length; i++) {
      let mintCount = 0;
      if (swarm.mintStages[i].maxMintsPerAddress > 0) {
        const mintCounter = await safeFetchMintCounterFromSeeds(umi, {
          id: i,
          user: publicKey(userAddress),
          candyGuard: publicKey(candyMachine.mintAuthority),
          candyMachine: publicKey(candyMachineAddress),
        });
        if (mintCounter) {
          mintCount = mintCounter.count;
        }
      }
      mintCounts.push(mintCount);
    }

    return mintCounts;
  }

  async mint({
    swarmId,
    userAddress,
    stageIndex,
  }: {
    swarmId: string;
    userAddress: string;
    stageIndex: number;
  }) {
    const swarm = await this.getSwarmById(swarmId);
    if (!swarm) {
      throw new Error('Swarm not found');
    }

    const mintStage = swarm.mintStages[stageIndex];
    if (!mintStage) {
      throw new Error('Invalid stage index');
    }

    const umi = createUmi(this.config.get<string>('SOLANA_RPC_URL')!, {
      commitment: 'processed',
    });
    const connection = new Connection(
      this.config.get<string>('SOLANA_RPC_URL')!,
      'processed',
    );

    const launchpadConfig = this.getSwarmLaunchpadConfig();

    const merkleProof = mintStage.whitelistAddresses
      ? getMerkleProof(mintStage.whitelistAddresses, userAddress)
      : undefined;

    const fee =
      mintStage.price > 0
        ? {
            recipient: launchpadConfig.launchpadFeeRecipient,
            amount:
              ((mintStage.price * launchpadConfig.mintFeeBps) / 10000) *
              LAMPORTS_PER_SOL,
          }
        : undefined;

    const { signers, instructions } = await this.constructMintTx({
      userAddress,
      stageIndex,
      fee,
      umi,
      collection: swarm.collectionAddress,
      candyMachine: swarm.candyMachine.address,
      merkleProof,
    });

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
    };
  }

  async constructMintTx({
    userAddress,
    stageIndex,
    fee,
    umi,
    asset = Keypair.generate(),
    collection,
    candyMachine,
    merkleProof,
  }: {
    userAddress: string;
    stageIndex: number;
    fee?: {
      recipient: string;
      amount: number;
    };
    umi: Umi;
    asset?: Keypair;
    collection: string;
    candyMachine: string;
    merkleProof?: Uint8Array[];
  }) {
    const instructions: TransactionInstruction[] = [];

    const candyMachineInfo = await fetchCandyMachine(
      umi,
      publicKey(candyMachine),
    );

    const candyGuard = await fetchCandyGuard(
      umi,
      candyMachineInfo.mintAuthority,
    );

    const mergedGuards = {
      ...candyGuard.guards,
      ...candyGuard.groups[stageIndex].guards,
    };
    const label = candyGuard.groups[stageIndex].label;

    let mintArgs: Partial<DefaultGuardSetMintArgs> = {};
    if (isSome(mergedGuards.solPayment)) {
      mintArgs.solPayment = some({
        destination: mergedGuards.solPayment.value.destination,
      });
    }
    if (isSome(mergedGuards.mintLimit)) {
      mintArgs.mintLimit = some({
        id: mergedGuards.mintLimit.value.id,
      });
    }
    if (isSome(mergedGuards.allowList)) {
      mintArgs.allowList = some({
        merkleRoot: mergedGuards.allowList.value.merkleRoot,
      });

      const merkleRoot = mergedGuards.allowList.value.merkleRoot;

      const allowListProof = await safeFetchAllowListProofFromSeeds(umi, {
        candyMachine: publicKey(candyMachine),
        candyGuard: candyMachineInfo.mintAuthority,
        merkleRoot,
        user: umi.identity.publicKey,
      });
      if (!allowListProof) {
        if (!merkleProof) {
          throw new Error('Merkle proof is required');
        }
        instructions.push(
          ...this.extractUmiTxBuilderInstructions(
            route(umi, {
              candyMachine: publicKey(candyMachine),
              group: label ? some(label) : undefined,
              guard: 'allowList',
              routeArgs: {
                path: 'proof',
                merkleRoot,
                merkleProof,
              },
            }),
          ),
        );
      }
    }

    const assetSigner = createSignerFromKeypair(umi, {
      secretKey: asset.secretKey,
      publicKey: publicKey(asset.publicKey),
    });

    instructions.push(
      ...this.extractUmiTxBuilderInstructions(
        mintV1(umi, {
          candyMachine: publicKey(candyMachine),
          asset: assetSigner,
          collection: publicKey(collection),
          group: label ? some(label) : undefined,
          mintArgs,
        }),
      ),
    );

    if (fee && fee.amount > 0) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(userAddress),
          toPubkey: new PublicKey(fee.recipient),
          lamports: fee.amount,
        }),
      );
    }

    return {
      asset,
      signers: [asset],
      instructions,
    };
  }

  async uploadCollectionMetadata(swarmId: string, metadata: any) {
    const s3 = new AmazonS3(
      this.config.get('S3_BUCKET'),
      this.config.get('S3_ACCESS_KEY'),
      this.config.get('S3_SECRET_KEY'),
      this.config.get('S3_REGION'),
    );
    const buffer = Buffer.from(JSON.stringify(metadata, null, 2));
    const path = this.getCollectionMetadataPath(swarmId);
    await s3.addFileFromBuffer(buffer, path, 'application/json');
    return this.config.get('S3_URL') + '/' + path;
  }

  getCollectionMetadataPath(swarmId: string) {
    return `metadata/solana/collection/${swarmId}/collection.json`;
  }

  getNftImagePath(swarmId: string, index: number) {
    return `metadata/solana/collection/${swarmId}/images/${index}`;
  }

  getNftMetadataPath(swarmId: string, index: number) {
    return `metadata/solana/collection/${swarmId}/${index}.json`;
  }

  private extractUmiTxBuilderInstructions(
    txBuilder: TransactionBuilder,
  ): TransactionInstruction[] {
    return txBuilder.getInstructions().map((i) => ({
      programId: new PublicKey(i.programId),
      keys: i.keys.map((k) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(i.data),
    }));
  }

  async createSerializedTx(
    connection: Connection,
    payer: string,
    instructions: TransactionInstruction[],
    signers: Keypair[],
  ) {
    const latestBlockhash = await connection.getLatestBlockhash('processed');
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: new PublicKey(payer),
        recentBlockhash: latestBlockhash.blockhash,
        instructions,
      }).compileToV0Message(),
    );
    tx.sign(signers);
    const serializedTx = tx.serialize();
    return Buffer.from(serializedTx).toString('hex');
  }

  async getSwarmById(id: string) {
    const swarm = await this.mongo.swarms.findOne({ _id: new ObjectId(id) });
    return swarm;
  }

  getSwarmLaunchpadConfig() {
    return {
      mintFeeBps: 100,
      nftMaxSupply: 10000,
      launchpadFeeRecipient: this.config.get<string>(
        'SOLANA_LAUNCHPAD_FEE_RECIPIENT_ADDRESS',
      ),
      collectionAuthority: Keypair.fromSecretKey(
        bs58.decode(
          this.config.get<string>(
            'SOLANA_COMMON_COLLECTION_AUTHORITY_PRIVATE_KEY',
          ),
        ),
      ),
    };
  }
}
