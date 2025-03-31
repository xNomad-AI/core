import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  getContract,
  Hex,
  http,
  parseUnits,
  ethAddress,
} from 'viem';
import { mainnet, base,bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const nativeTokenAddress = ethAddress;

