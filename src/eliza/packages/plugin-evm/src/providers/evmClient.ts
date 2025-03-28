import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  Hex,
  http,
  parseUnits,
  formatUnits,
  Chain,
  ethAddress,
} from 'viem';
import { mainnet, base, bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export const nativeTokenAddress = ethAddress;
export class EVMClient {
  private publicClient;
  private chain: Chain;
  private rpcUrl: string;

  constructor({
    rpcUrl,
    chainName,
  }: {
    rpcUrl: string;
    chainName: string;
  }) {
    this.chain = this.getChainConfig(chainName);
    this.rpcUrl = rpcUrl;
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl),
    });
  }

  private getChainConfig(chainName: string): Chain {
    switch (chainName) {
      case 'ethereum':
        return mainnet;
      case 'base':
        return base;
      case 'bsc':
        return bsc;
      default:
        throw new Error('Invalid chain');
    }
  }

  isNativeToken(tokenSymbol: string) {
    return this.chain.nativeCurrency.symbol === tokenSymbol?.toUpperCase() || this.chain.nativeCurrency.name === tokenSymbol?.toUpperCase();
  }

  /**
   * Get token decimals
   * @param tokenAddress ERC20 token address
   * @returns number of decimals
   */
  async getTokenDecimals(tokenAddress: string): Promise<number> {
    // For native currency (ETH, BNB etc), get decimals directly
    if (tokenAddress.toLowerCase() === nativeTokenAddress) {
      return this.chain.nativeCurrency.decimals;
    }
    const decimals = await this.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'decimals',
      });
      return Number(decimals);
  }

  /**
   * Get token balance for an address
   * @param tokenAddress ERC20 token address
   * @param walletAddress Address to check balance for
   * @returns Token balance (raw bigint)
   */
  async getTokenBalance(
    tokenAddress: string, 
    walletAddress: string,
  ): Promise<bigint> {
    // For native currency (ETH, BNB etc), get balance directly
    if (tokenAddress.toLowerCase() === nativeTokenAddress) {
      return await this.publicClient.getBalance({
        address: walletAddress,
      });
    }
    // For ERC20 tokens
    return await this.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [walletAddress],
    }) as bigint;
  }

  async getTokenUIBalance(tokenAddress: string, walletAddress: string): Promise<string> {
    const balance = await this.getTokenBalance(tokenAddress, walletAddress);
    const decimals = await this.getTokenDecimals(tokenAddress);
    return formatUnits(balance, decimals);
  }

  async checkAndApproveTokenTransfer({
    walletAddress,
    walletPrivateKey,
    tokenAddress,
    dexRouterAddress,
    rawAmount,
  }: {
    tokenAddress: string;
    dexRouterAddress: string;
    walletPrivateKey: string;
    walletAddress: string;
    rawAmount: string;
  }): Promise<string> {
    if (tokenAddress.toLowerCase() === nativeTokenAddress) {
      return '0x';
    }

    // read current allowance
    const currentAllowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [walletAddress, dexRouterAddress],
    });

    if (currentAllowance >= rawAmount) {
      return '0x';
    }
    console.log(`approve token transfer, address: ${walletAddress}, amount: ${rawAmount}`);
    const walletClient = createWalletClient({
      chain: this.chain,
      transport: http(this.rpcUrl),
      account: privateKeyToAccount(walletPrivateKey as Hex),
    });
    // set max amount?
    const txHash = await walletClient.writeContract({
      chain: this.chain,
      address: tokenAddress as Hex,
      abi: erc20Abi,
      functionName: 'approve',
      args: [dexRouterAddress as Hex, BigInt(rawAmount)],
      account: privateKeyToAccount(walletPrivateKey as Hex),
    });
    // wait for tx to be mined
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log(`approved token transfer, address: ${walletAddress}, amount: ${rawAmount}, txHash: ${txHash}`);
    return txHash;
  }

  /**
   * Transfer tokens to another address
   * @param tokenAddress ERC20 token address
   * @param recipient Recipient address
   * @param amount Amount to transfer (as string)
   * @param privateKey Private key for transaction signing
   * @returns Transaction hash
   */
  async transferToken(
    tokenAddress: `0x${string}`,
    recipient: `0x${string}`,
    amount: string,
    privateKey: string
  ): Promise<`0x${string}`> {
    if (!privateKey) {
      throw new Error('Private key is required for transfers');
    }

    // Create account and wallet client from privateKey
    const account = privateKeyToAccount(privateKey as Hex);
    const walletClient = createWalletClient({
      chain: this.chain,
      transport: http((this.publicClient.transport as any).url),
      account,
    });

    // Get token decimals for proper amount conversion
    const decimals = await this.getTokenDecimals(tokenAddress);
    
    // Check balance
    const balance = await this.getTokenBalance(tokenAddress, account.address) as bigint;
    const amountInWei = parseUnits(amount, decimals);
    
    if (balance < amountInWei) {
      throw new Error('Insufficient balance');
    }

    // Send transaction
    const txHash = await walletClient.writeContract({
      chain: this.chain,
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, amountInWei],
      account,
    });

    return txHash;
  }

  /**
   * Read contract
   * @param address contract address
   * @param abi contract abi
   * @param functionName call function name
   * @param args call function args
   * @returns call contract result
   */
  async readContract(address: string, abi: any, functionName: string, args: any[]) {
    return await this.publicClient.readContract({
      address,
      abi,
      functionName,
      args,
    });
  }
}