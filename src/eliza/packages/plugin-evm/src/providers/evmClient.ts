import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  Hex,
  http,
  parseUnits,
  formatUnits,
} from 'viem';
import { mainnet, base, bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export class EVMClient {
  static nativeTokenAddress = '0x0000000000000000000000000000000000000000';
  private publicClient;
  private chain;

  constructor({
    rpcUrl,
    chainName,
  }: {
    rpcUrl: string;
    chainName: string;
  }) {
    this.chain = this.getChain(chainName);
    
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl),
    });
  }

  private getChain(chainName: string) {
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
    return 
    ( this.chain === mainnet && tokenSymbol === 'ETH' ) ||
    ( this.chain === base && tokenSymbol === 'ETH' ) ||
    ( this.chain === bsc && tokenSymbol === 'BNB' );
  }

  /**
   * Get token decimals
   * @param tokenAddress ERC20 token address
   * @returns number of decimals
   */
  async getTokenDecimals(tokenAddress: string): Promise<number> {
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
   * @param formatted Whether to return formatted balance with decimals
   * @returns Token balance (raw bigint or formatted string)
   */
  async getTokenBalance(
    tokenAddress: string, 
    walletAddress: string,
    formatted: boolean = false
  ): Promise<bigint> {
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
}