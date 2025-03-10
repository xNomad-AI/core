import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Connection, PublicKey } from '@solana/web3.js';
import { ObjectId } from 'mongodb';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { SwarmMintStage } from '../shared/mongo/types.js';
import { CreateSwarmParams, SwarmService } from './swarm.service.js';

@Controller('/launchpad/swarm')
export class SwarmController {
  constructor(
    private readonly swarmService: SwarmService,
    private readonly config: ConfigService,
    private readonly mongo: MongoService,
  ) {}

  @Post('create-swarm')
  async createSwarm(
    @Body()
    body: CreateSwarmParams,
  ) {
    const { swarmId } = await this.swarmService.createSwarm(body);

    const collectionMetadata = this.swarmService.constructCollectionMetadata({
      name: body.name,
      description: body.description,
      image: body.logo,
      imageMineType: 'image/png',
      externalUrl: body.socialMedia.website,
    });
    const collectionMetadataUri =
      await this.swarmService.uploadCollectionMetadata(
        swarmId,
        collectionMetadata,
      );

    await this.mongo.swarms.updateOne(
      { _id: new ObjectId(swarmId) },
      { $set: { collectionMetadataUri } },
    );

    return {
      swarmId,
    };
  }

  @Post('upload-nft-metadata')
  @UseInterceptors(FileInterceptor('file'))
  async uploadNftMetadata(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { swarmId: string },
  ) {
    const swarm = await this.swarmService.getSwarmById(body.swarmId);
    if (!swarm) {
      throw new Error('Swarm not found');
    }

    const { images, jsons } =
      await this.swarmService.processNftMetadataFile(file);

    const nftUris = await this.swarmService.uploadNftMetadata(
      body.swarmId,
      swarm,
      images,
      jsons,
    );

    this.mongo.swarms.updateOne(
      { _id: new ObjectId(body.swarmId) },
      {
        $set: {
          nftMetadataUploaded: true,
          maxSupply: nftUris.length,
        },
      },
    );
  }

  @Post('construct-create-collection-tx')
  async constructCreateCollectionTx(@Body() body: { swarmId: string }) {
    const swarm = await this.swarmService.getSwarmById(body.swarmId);
    if (!swarm) {
      throw new Error('Swarm not found');
    }

    const connection = new Connection(
      this.config.get<string>('SOLANA_RPC_URL')!,
    );
    const umi = createUmi(this.config.get<string>('SOLANA_RPC_URL')!, {
      commitment: 'confirmed',
    });

    if (swarm.collectionAddress) {
      const collectionAccount = await connection.getAccountInfo(
        new PublicKey(swarm.collectionAddress),
        'processed',
      );
      if (collectionAccount) {
        throw new Error(
          `collection already created: ${swarm.collectionAddress}`,
        );
      }
    }

    const launchpadConfig = this.swarmService.getSwarmLaunchpadConfig();

    const { collection, signers, instructions } =
      await this.swarmService.constructCreateCollectionTx({
        umi,
        name: swarm.name,
        uri: swarm.collectionMetadataUri,
        payer: swarm.creatorInfo.address,
        collectionAuthorityAddress:
          launchpadConfig.collectionAuthority.publicKey.toBase58(),
        royaltyBps: swarm.creatorInfo.royaltyBps,
        royaltyRecipient: swarm.creatorInfo.recipientAddress,
      });
    const tx = await this.swarmService.createSerializedTx(
      connection,
      swarm.creatorInfo.address,
      instructions,
      signers,
    );

    await this.mongo.swarms.updateOne(
      { _id: swarm._id },
      { $set: { collectionAddress: collection.publicKey.toBase58() } },
    );

    return {
      tx,
    };
  }

  @Post('construct-mint-tx')
  async constructMintTx(
    @Body() body: { swarmId: string; userAddress: string; stageIndex: number },
  ) {
    const { tx, fee } = await this.swarmService.mint({
      swarmId: body.swarmId,
      userAddress: body.userAddress,
      stageIndex: body.stageIndex,
    });

    return {
      tx,
      fee,
    };
  }

  @Get('get-user-mint')
  async getUserMint(
    @Query('swarmId') swarmId: string,
    @Query('userAddress') userAddress: string,
  ) {
    const swarm = await this.swarmService.getSwarmById(swarmId);
    if (!swarm) {
      throw new NotFoundException('Swarm not found');
    }

    return {
      mintCounts: await this.swarmService.getUserMintCounts(swarm, userAddress),
    };
  }

  @Get('get-swarms')
  async getSwarms(@Query('creatorAddress') creatorAddress?: string) {
    return {
      swarms: await this.mongo.swarms
        .find({
          ...(creatorAddress && { 'creatorInfo.address': creatorAddress }),
        })
        .toArray(),
    };
  }

  @Get('get-swarm')
  async getSwarm(@Query('swarmId') swarmId: string) {
    return {
      swarm: await this.swarmService.getSwarmById(swarmId),
    };
  }

  @UseGuards(AuthGuard)
  @Post('update-swarm')
  async updateSwarm(
    @Request() request,
    @Body()
    body: {
      swarmId: string;
      mintStages?: SwarmMintStage[];
      recipientAddress?: string;
      royaltyBps?: number;
    },
  ) {
    const swarm = await this.swarmService.getSwarmById(body.swarmId);
    if (!swarm) {
      throw new NotFoundException('Swarm not found');
    }

    if (swarm.creatorInfo.address !== request.user.address) {
      throw new UnauthorizedException('You are not the creator of this swarm');
    }

    await this.mongo.swarms.updateOne(
      { _id: new ObjectId(body.swarmId) },
      {
        $set: {
          ...(body.mintStages && { mintStages: body.mintStages }),
          ...(body.recipientAddress && {
            recipientAddress: body.recipientAddress,
          }),
          ...(body.royaltyBps && { royaltyBps: body.royaltyBps }),
        },
      },
    );

    return {
      swarm: await this.swarmService.getSwarmById(body.swarmId),
    };
  }
}
