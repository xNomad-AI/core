import { mplCandyMachine } from '@metaplex-foundation/mpl-core-candy-machine';
import { keypairIdentity, publicKey, Umi } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { Swarm } from '../shared/mongo/types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { SwarmService } from './swarm.service.js';

@Injectable()
export class SetupSwarmService {
  private isProcessing = false;

  constructor(
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
    private readonly logger: TransientLoggerService,
    private readonly swarmService: SwarmService,
  ) {}

  @Interval(60 * 1000)
  async setupAllOnchainCollections() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      const swarms = await this.mongo.swarms
        .find({
          collectionAddress: { $ne: null },
          $expr: {
            $ne: ['$candyMachine.itemsLoaded', '$maxSupply'],
          },
        })
        .toArray();

      for (const swarm of swarms) {
        await this.setupOnchainCollection(swarm);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async setupOnchainCollection(swarm: Swarm) {
    this.logger.log(`setup onchain collection: ${swarm._id}`);

    const launchpadConfig = this.swarmService.getSwarmLaunchpadConfig();
    const connection = new Connection(
      this.config.get<string>('SOLANA_RPC_URL')!,
      'confirmed',
    );
    const umi = createUmi(this.config.get<string>('SOLANA_RPC_URL')!, {
      commitment: 'confirmed',
    })
      .use(mplCandyMachine())
      .use(
        keypairIdentity({
          secretKey: launchpadConfig.collectionAuthority.secretKey,
          publicKey: publicKey(launchpadConfig.collectionAuthority.publicKey),
        }),
      );

    // check if collection account exists
    const collectionAccount = await connection.getAccountInfo(
      new PublicKey(swarm.collectionAddress),
      'processed',
    );
    if (!collectionAccount) {
      this.logger.log(`collection not found: ${swarm.collectionAddress}`);
      return;
    }

    // create candy machine account if not exists
    let candyMachineAddress = swarm.candyMachine.address;
    const candyMachineAccount = swarm.candyMachine.address
      ? await connection.getAccountInfo(
          new PublicKey(swarm.candyMachine.address),
          'processed',
        )
      : null;
    if (!candyMachineAccount) {
      const candyMachine = await this.createCandyMachine(
        connection,
        umi,
        swarm,
      );
      candyMachineAddress = candyMachine.publicKey.toBase58();
    } else {
      this.logger.log('Candy machine already exists');
    }

    const itemsLoaded = await this.swarmService.addNftsToCandyMachine(
      umi,
      candyMachineAddress,
      swarm.maxSupply,
      50,
    );

    await this.mongo.swarms.updateOne(
      { _id: swarm._id },
      { $set: { 'candyMachine.itemsLoaded': itemsLoaded } },
    );

    this.logger.log(`setup onchain collection: ${swarm._id} done`);
  }

  async createCandyMachine(connection: Connection, umi: Umi, swarm: Swarm) {
    const launchpadConfig = this.swarmService.getSwarmLaunchpadConfig();
    const candyMachine = Keypair.generate();
    this.logger.log(
      `Create candy machine ${candyMachine.publicKey.toBase58()} for swarm ${swarm._id}`,
    );

    await this.mongo.swarms.updateOne(
      { _id: swarm._id },
      { $set: { 'candyMachine.address': candyMachine.publicKey.toBase58() } },
    );

    const { instructions, signers } =
      await this.swarmService.constructCreateCandyMachineTx({
        umi,
        collectionAddress: swarm.collectionAddress,
        candyMachine,
        collectionUpdateAuthority: launchpadConfig.collectionAuthority,
        maxSupply: swarm.maxSupply,
        prefixName: swarm.candyMachine.prefixName,
        prefixUri: swarm.candyMachine.prefixUri,
        mintStages: swarm.mintStages,
        mintFeeRecipient: swarm.creatorInfo.recipientAddress,
      });

    const latestBlockhash = await connection.getLatestBlockhash('processed');
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: launchpadConfig.collectionAuthority.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions,
      }).compileToV0Message(),
    );
    tx.sign(signers);

    this.logger.log('Sending transaction to create candy machine');
    const signature = await connection.sendTransaction(tx, {
      preflightCommitment: 'processed',
    });
    this.logger.log(`Transaction sent, txid: ${signature}`);
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      'confirmed',
    );
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }
    this.logger.log('Transaction confirmed');

    return candyMachine;
  }
}
