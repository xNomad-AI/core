import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  getContract,
  Hex,
  http,
  parseUnits,
} from 'viem';
import { mainnet, base,bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export async function transferToken({
                                 rpcUrl,
                                 privateKey,
                                 tokenAddress,
                                 recipient,
                                 amount,
                                 chainName,
                               }: {
  rpcUrl: string;
  privateKey: string;
  tokenAddress: string;
  recipient: string;
  amount: string;
  chainName: string;
}) {
  const account = privateKeyToAccount(privateKey as Hex);
  let chain;
  switch (chainName) {
    case 'ethereum':
      chain = mainnet;
      break;
    case 'base':
      chain = base;
      break;
    case 'bsc':
      chain = bsc;
      break;
    default:
      throw new Error(`Invalid chain name ${chainName}`);
  }
  const walletClient = createWalletClient({
    chain,
    transport: http(rpcUrl),
    account,
  });

  const publicClient = createPublicClient({
    transport: http(rpcUrl),
  });


  // Read wallet balance
  const balance = await publicClient.readContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  });

  console.log(`Current balance: ${balance}`);

  const amountInWei = parseUnits(amount, 18); // Ensure correct unit conversion
  if (BigInt(balance) < amountInWei) {
    throw new Error('Insufficient balance');
  }

  // Send transaction
  const txHash = await walletClient.writeContract({
    chain,
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipient as `0x${string}`, amountInWei],
    account,
  });

  return txHash;
}