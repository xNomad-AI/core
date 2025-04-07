import {
  createTraderAPIMemoInstruction,
  HttpProvider,
} from '@bloxroute/solana-trader-client-ts';
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { JitoResponse } from './type.js';

abstract class ValidatorNodeService {
  abstract makeTransferInstruction(
    fromPubkey: PublicKey,
    lamports: number,
  ): Promise<TransactionInstruction[]>;
  abstract postSubmit(content: string): Promise<string>;
}

class JitoValidatorNodeService extends ValidatorNodeService {
  private readonly jitoApiUrl =
    'https://mainnet.block-engine.jito.wtf/api/v1/bundles';

  async makeTransferInstruction(
    fromPubkey: PublicKey,
    lamports: number,
  ): Promise<TransactionInstruction[]> {
    const response = await fetch(this.jitoApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTipAccounts',
        params: [],
      }),
    });

    const data = (await response.json()) as JitoResponse<string[]>;
    const tipWallet = data.result[0];

    if (!tipWallet) {
      throw new Error('Cannot get tip account from Jito');
    }

    const toPubkey = new PublicKey(tipWallet);
    const instruction = SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    });

    return [instruction];
  }

  async postSubmit(content: string): Promise<string> {
    const body = {
      id: 1,
      jsonrpc: '2.0',
      method: 'sendTransaction',
      params: [
        content,
        {
          encoding: 'base64',
        },
      ],
    };

    const response = await fetch(
      'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const responseData = (await response.json()) as JitoResponse<string>;
    return responseData.result;
  }
}

class BloxValidatorNodeService extends ValidatorNodeService {
  private readonly apikey = process.env.BLOX_API_KEY;
  private readonly provider: HttpProvider;
  private readonly TRADER_API_TIP_WALLET =
    'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY';

  constructor() {
    super();
    this.provider = new HttpProvider(this.apikey);
  }

  async makeTransferInstruction(
    fromPubkey: PublicKey,
    lamports: number,
  ): Promise<TransactionInstruction[]> {
    const toPubkey = new PublicKey(this.TRADER_API_TIP_WALLET);
    const transferInstruction = SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    });

    const memoInstruction = createTraderAPIMemoInstruction('');

    return [transferInstruction, memoInstruction];
  }

  async postSubmit(content: string): Promise<string> {
    const { signature } = await this.provider.postSubmit({
      transaction: {
        content,
        isCleanup: true,
      },
      skipPreFlight: true,
      frontRunningProtection: false,
      useStakedRPCs: true,
    });
    return signature;
  }
}

class DefaultRPCNodeService extends ValidatorNodeService {
  private readonly rpcUrl = process.env.SOLANA_RPC_URL;

  constructor() {
    super();
  }

  async makeTransferInstruction(
    fromPubkey: PublicKey,
    lamports: number,
  ): Promise<TransactionInstruction[]> {
    return [];
  }

  async postSubmit(content: string): Promise<string> {
    const body = {
      id: 1,
      jsonrpc: '2.0',
      method: 'sendTransaction',
      params: [
        content,
        {
          encoding: 'base64',
        },
      ],
    };

    const response = await fetch(
      this.rpcUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      throw new Error(`RPC Error, ${response.statusText}, ${await response.text()}`);
    }
    const responseData = (await response.json()) as JitoResponse<string>;
    return responseData.result;
  }
}

const bloxValidatorNodeService = new BloxValidatorNodeService();
const jitoValidatorNodeService = new JitoValidatorNodeService();
const defaultRPCNodeService = new DefaultRPCNodeService();
export { bloxValidatorNodeService, jitoValidatorNodeService, defaultRPCNodeService };
