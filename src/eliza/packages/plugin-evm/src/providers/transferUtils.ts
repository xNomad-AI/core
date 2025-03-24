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

const nativeTokenAddress = '0x0000000000000000000000000000000000000000';

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


  if (tokenAddress === nativeTokenAddress) {
    // Send native token transaction
    const amountInWei = parseUnits(amount, 18);
    const txHash = await walletClient.sendTransaction({
      to: recipient as `0x${string}`,
      value: amountInWei,
      account,
      kzg: {
        blobToKzgCommitment: (blob: Uint8Array) => new Uint8Array(),
        computeBlobKzgProof: (blob: Uint8Array, commitment: Uint8Array) => new Uint8Array(),
      },
      chain,
    });
    return txHash;
  } else {
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

    const decimals = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'decimals',
    });
    const amountInWei = parseUnits(amount, decimals);

    if (BigInt(balance) < amountInWei) {
      throw new Error('Insufficient balance');
    }

    // Send ERC20 token transaction
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
}