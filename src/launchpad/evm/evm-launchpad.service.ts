import * as DID from '@ipld/dag-ucan/did';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Client from '@web3-storage/w3up-client';
import { Signer } from '@web3-storage/w3up-client/principal/ed25519';
import * as Proof from '@web3-storage/w3up-client/proof';
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory';
import { ethers } from 'ethers';
import { ElizaManagerService } from '../../agent/eliza-manager.service.js';
import { MongoService } from '../../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../../shared/transient-logger.service.js';
import { CommonCollectionAbi } from './abi.js';

// create token on four.meme
// gas used ~ 1300000
// gas price 1.01 gwei
// gas fee 0.0013 bnb

@Injectable()
export class EvmLaunchpadService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: TransientLoggerService,
    private readonly mongo: MongoService,
    private readonly elizaManager: ElizaManagerService,
  ) {
    this.logger.setContext(EvmLaunchpadService.name);
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

    const { fee, feeAfterDiscount, discountPercentage } =
      await this.calculateMintFee();
    this.logger.log(
      JSON.stringify({
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

    const contractAddress = this.config
      .get<string>('BSC_COMMON_COLLECTION_ADDRESS')
      .toLowerCase();
    const tokenId = BigInt(
      '0x' + Buffer.from(ethers.randomBytes(8)).toString('hex'),
    );
    let agentAddress = ethers.ZeroAddress;
    let agentAddressValue = 0n;

    if (createToken) {
      const nftId = `${chain}:${contractAddress}:${tokenId}`;
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
        mintAddress: null as any,
        mintSecretKey: null as any,
        created: false,
        updatedAt: now,
        createdAt: now,
      });

      agentAddress = await this.elizaManager
        .getAgentAccountKeypair(chain, nftId)
        .then(({ evmPrivateKey }) => new ethers.Wallet(evmPrivateKey).address);
      agentAddressValue = ethers.parseEther(
        (createToken.buyAmountSol * 1.01 + 0.002).toString(),
      );
    }

    const tx = await this.constructMintTx({
      userAddress,
      tokenId,
      uri,
      fee,
      agentAddress,
      agentAddressValue,
    });

    return {
      tx,
      fee,
      feeAfterDiscount,
      discountPercentage,
    };
  }

  async constructMintTx({
    userAddress,
    tokenId,
    uri,
    fee,
    agentAddress,
    agentAddressValue,
  }: {
    userAddress: string;
    tokenId: bigint;
    uri: string;
    fee: number;
    agentAddress: string;
    agentAddressValue: bigint;
  }) {
    const authorityPrivateKey = this.config.get<string>(
      'BSC_COMMON_COLLECTION_AUTHORITY_PRIVATE_KEY',
    );
    const messageHash = ethers.solidityPackedKeccak256(
      ['address', 'uint256', 'string', 'uint256', 'address', 'uint256'],
      [
        userAddress,
        tokenId,
        uri,
        ethers.parseEther(fee.toString()),
        agentAddress,
        agentAddressValue,
      ],
    );
    const wallet = new ethers.Wallet(authorityPrivateKey);
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));

    const txData = new ethers.Interface(CommonCollectionAbi).encodeFunctionData(
      'safeMint',
      [
        userAddress,
        tokenId,
        uri,
        ethers.parseEther(fee.toString()),
        agentAddress,
        agentAddressValue,
        signature,
      ],
    );

    return {
      from: userAddress,
      to: this.config.get<string>('BSC_COMMON_COLLECTION_ADDRESS'),
      value: (ethers.parseEther(fee.toString()) + agentAddressValue).toString(),
      data: txData,
    };
  }

  async calculateMintFee() {
    let [fee, feeAfterDiscount, discountPercentage] =
      process.env.RUN_ENV === 'dev' ? [0.02, 0.02, 0] : [0.0001, 0.0001, 0];

    return { fee, feeAfterDiscount, discountPercentage };
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
