
import { encodeFunctionData } from 'viem';
import { EVMClient } from './evmClient.js';
import { FourMemeTokenInfo, FourMemeTryBuy, FourMemeTrySell } from './type.js';

export class FourMemeService {
  private readonly logger: Console;

  constructor(
    logger?: Console,
  ) {
    this.logger = logger || console;
  }

  private getContract(chainName: string) {
    let contract;
    switch(chainName) {
        case 'bsc':
            contract = '0xF251F83e40a78868FcfA3FA4599Dad6494E46034';
            break;
        default:
            throw new Error(`Unsupport chain: ${chainName}`);
    }
    return contract;
  }
  
  async getTokenInfo(rpcUrl: string, chainName: string, tokenAddress: `0x${string}`): Promise<FourMemeTokenInfo> {
    const contract = this.getContract(chainName);
    const evmClient = new EVMClient({rpcUrl, chainName});
	console.log(tokenAddress)
    const tokenInfo = await evmClient.readContract(contract, tokenManagerHelperABI, 'getTokenInfo', [tokenAddress]);
	return {
		version: tokenInfo[0].toString(),
		tokenManager: tokenInfo[1].toString(),
		quote: tokenInfo[2].toString(),
		lastPrice: tokenInfo[3].toString(),
		tradingFeeRate: tokenInfo[4].toString(),
		minTradingFee: tokenInfo[5].toString(),
		launchTime: tokenInfo[6].toString(),
		offers: tokenInfo[7].toString(),
		maxOffers: tokenInfo[8].toString(),
		funds: tokenInfo[9].toString(),
		maxFunds: tokenInfo[10].toString(),
		liquidityAdded: tokenInfo[11],
	};
  }

  async tryBuy(rpcUrl: string, chainName: string, tokenAddress: `0x${string}`, amount: string, funds: string): Promise<FourMemeTryBuy> {
    const contract = this.getContract(chainName);
    const evmClient = new EVMClient({rpcUrl, chainName});
    const buyResult = await evmClient.readContract(contract, tokenManagerHelperABI, 'tryBuy', [tokenAddress, amount, funds]);
    return {
		tokenManager: buyResult[0].toString(),
		quote: buyResult[1].toString(),
		estimatedAmount: buyResult[2].toString(),
		estimatedCost: buyResult[3].toString(),
		estimatedFee: buyResult[4].toString(),
		amountMsgValue: buyResult[5].toString(),
		amountApproval: buyResult[6].toString(),
		amountFunds: buyResult[7].toString(),
	};
  }

  async trySell(rpcUrl: string, chainName: string, tokenAddress: `0x${string}`, amount: string): Promise<FourMemeTrySell> {
    const contract = this.getContract(chainName);
    const evmClient = new EVMClient({rpcUrl, chainName});
    const sellResult = await evmClient.readContract(contract, tokenManagerHelperABI, 'trySell', [tokenAddress, amount]);
    return {
		tokenManager: sellResult[0].toString(),
		quote: sellResult[1].toString(),
		funds: sellResult[2].toString(),
		fee: sellResult[3].toString(),
	};
  }

buildBuyTxData(version: string, token: string, funds: string, minAmount: string): string {
	switch(version) {
		case '1':
			return encodeFunctionData({
				abi: tokenManager1ABI,
				functionName: 'purchaseTokenAMAP',
				args: [token, funds, minAmount],
			});
		case '2':
			return encodeFunctionData({
				abi: tokenManager2ABI,
				functionName: 'buyTokenAMAP',
				args: [token, funds, minAmount],
			});
		default:
			throw new Error(`Invalid token manager version: ${version}`);
	}
  }

buildSellTxData(version: string, origin: string, token: string, amount: string, minFunds: string, feeRate: string, feeRecipient: string): string {
	switch(version) {
		case '1':
			return encodeFunctionData({
				abi: tokenManager1ABI,
				functionName: 'saleToken',
				args: [token, amount],
			});
		case '2':
			return encodeFunctionData({
				abi: tokenManager2ABI,
				functionName: 'sellToken',
				args: [origin, token, amount, minFunds, feeRate, feeRecipient],
			});
		default:
			throw new Error(`Invalid token manager version: ${version}`);	
	}
  }
}

const fourMemeService = new FourMemeService();

export default fourMemeService;

const tokenManagerHelperABI = [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [],
		"name": "PANCAKE_FACTORY",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "PANCAKE_V3_FACTORY",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "TM",
		"outputs": [
			{
				"internalType": "contract ITokenManager",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "TM2",
		"outputs": [
			{
				"internalType": "contract ITokenManager2",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "TOKEN_MANAGER",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "TOKEN_MANAGER_2",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "WETH",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "maxRaising",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "totalSupply",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "offers",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "reserves",
				"type": "uint256"
			}
		],
		"name": "calcInitialPrice",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "pure",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			}
		],
		"name": "getTokenInfo",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "version",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "tokenManager",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "quote",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "lastPrice",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "tradingFeeRate",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "minTradingFee",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "launchTime",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "offers",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxOffers",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxFunds",
				"type": "uint256"
			},
			{
				"internalType": "bool",
				"name": "liquidityAdded",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			}
		],
		"name": "tryBuy",
		"outputs": [
			{
				"internalType": "address",
				"name": "tokenManager",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "quote",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "estimatedAmount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "estimatedCost",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "estimatedFee",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "amountMsgValue",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "amountApproval",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "amountFunds",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "trySell",
		"outputs": [
			{
				"internalType": "address",
				"name": "tokenManager",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "quote",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "fee",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

const tokenManager1ABI = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "creator",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "requestId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "name",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "symbol",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "totalSupply",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "launchTime",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "launchFee",
				"type": "uint256"
			}
		],
		"name": "TokenCreate",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "account",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "tokenAmount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "etherAmount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "fee",
				"type": "uint256"
			}
		],
		"name": "TokenPurchase",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "account",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "tokenAmount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "etherAmount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "fee",
				"type": "uint256"
			}
		],
		"name": "TokenSale",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "token",
				"type": "address"
			}
		],
		"name": "TradeStop",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "tokenAddress",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxFunds",
				"type": "uint256"
			}
		],
		"name": "purchaseToken",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "tokenAddress",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "minAmount",
				"type": "uint256"
			}
		],
		"name": "purchaseTokenAMAP",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "tokenAddress",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "saleToken",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

const tokenManager2ABI = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "base",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "offers",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "quote",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			}
		],
		"name": "LiquidityAdded",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "creator",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "requestId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "name",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "symbol",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "totalSupply",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "launchTime",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "launchFee",
				"type": "uint256"
			}
		],
		"name": "TokenCreate",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "account",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "price",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "cost",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "fee",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "offers",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			}
		],
		"name": "TokenPurchase",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "origin",
				"type": "uint256"
			}
		],
		"name": "TokenPurchase2",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "account",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "price",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "cost",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "fee",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "offers",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			}
		],
		"name": "TokenSale",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "origin",
				"type": "uint256"
			}
		],
		"name": "TokenSale2",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "address",
				"name": "token",
				"type": "address"
			}
		],
		"name": "TradeStop",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "STATUS_ADDING_LIQUIDITY",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "STATUS_COMPLETED",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "STATUS_HALT",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "STATUS_TRADING",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "_launchFee",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "_referralRewardKeeper",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "_referralRewardRate",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "_templateCount",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "_templates",
		"outputs": [
			{
				"internalType": "address",
				"name": "quote",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "initialLiquidity",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxRaising",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "totalSupply",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxOffers",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "minTradingFee",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "_tokenCount",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "_tokenInfoEx1s",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "launchFee",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "pcFee",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "reserved2",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "reserved3",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "reserved4",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "_tokenInfoExs",
		"outputs": [
			{
				"internalType": "address",
				"name": "creator",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "founder",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "reserves",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "_tokenInfos",
		"outputs": [
			{
				"internalType": "address",
				"name": "base",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "quote",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "template",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "totalSupply",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxOffers",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxRaising",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "launchTime",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "offers",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "lastPrice",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "K",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "T",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "status",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "_tokens",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "_tradingFeeRate",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "_tradingHalt",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "origin",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxFunds",
				"type": "uint256"
			}
		],
		"name": "buyToken",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxFunds",
				"type": "uint256"
			}
		],
		"name": "buyToken",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "origin",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxFunds",
				"type": "uint256"
			}
		],
		"name": "buyToken",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "maxFunds",
				"type": "uint256"
			}
		],
		"name": "buyToken",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "minAmount",
				"type": "uint256"
			}
		],
		"name": "buyTokenAMAP",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "base",
						"type": "address"
					},
					{
						"internalType": "address",
						"name": "quote",
						"type": "address"
					},
					{
						"internalType": "uint256",
						"name": "template",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "totalSupply",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxOffers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxRaising",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "launchTime",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "offers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "funds",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "lastPrice",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "K",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "T",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "status",
						"type": "uint256"
					}
				],
				"internalType": "struct TokenManager3.TokenInfo",
				"name": "ti",
				"type": "tuple"
			},
			{
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			}
		],
		"name": "calcBuyAmount",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "pure",
		"type": "function"
	},
	{
		"inputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "base",
						"type": "address"
					},
					{
						"internalType": "address",
						"name": "quote",
						"type": "address"
					},
					{
						"internalType": "uint256",
						"name": "template",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "totalSupply",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxOffers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxRaising",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "launchTime",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "offers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "funds",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "lastPrice",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "K",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "T",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "status",
						"type": "uint256"
					}
				],
				"internalType": "struct TokenManager3.TokenInfo",
				"name": "ti",
				"type": "tuple"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "calcBuyCost",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "pure",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "maxRaising",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "totalSupply",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "offers",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "reserves",
				"type": "uint256"
			}
		],
		"name": "calcInitialPrice",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "pure",
		"type": "function"
	},
	{
		"inputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "base",
						"type": "address"
					},
					{
						"internalType": "address",
						"name": "quote",
						"type": "address"
					},
					{
						"internalType": "uint256",
						"name": "template",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "totalSupply",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxOffers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxRaising",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "launchTime",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "offers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "funds",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "lastPrice",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "K",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "T",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "status",
						"type": "uint256"
					}
				],
				"internalType": "struct TokenManager3.TokenInfo",
				"name": "ti",
				"type": "tuple"
			}
		],
		"name": "calcLastPrice",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "pure",
		"type": "function"
	},
	{
		"inputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "base",
						"type": "address"
					},
					{
						"internalType": "address",
						"name": "quote",
						"type": "address"
					},
					{
						"internalType": "uint256",
						"name": "template",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "totalSupply",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxOffers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxRaising",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "launchTime",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "offers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "funds",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "lastPrice",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "K",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "T",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "status",
						"type": "uint256"
					}
				],
				"internalType": "struct TokenManager3.TokenInfo",
				"name": "ti",
				"type": "tuple"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "calcSellCost",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "pure",
		"type": "function"
	},
	{
		"inputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "base",
						"type": "address"
					},
					{
						"internalType": "address",
						"name": "quote",
						"type": "address"
					},
					{
						"internalType": "uint256",
						"name": "template",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "totalSupply",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxOffers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "maxRaising",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "launchTime",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "offers",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "funds",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "lastPrice",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "K",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "T",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "status",
						"type": "uint256"
					}
				],
				"internalType": "struct TokenManager3.TokenInfo",
				"name": "ti",
				"type": "tuple"
			},
			{
				"internalType": "uint256",
				"name": "funds",
				"type": "uint256"
			}
		],
		"name": "calcTradingFee",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes",
				"name": "args",
				"type": "bytes"
			},
			{
				"internalType": "bytes",
				"name": "signature",
				"type": "bytes"
			}
		],
		"name": "createToken",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "origin",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "minFunds",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "feeRate",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "feeRecipient",
				"type": "address"
			}
		],
		"name": "sellToken",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "origin",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "minFunds",
				"type": "uint256"
			}
		],
		"name": "sellToken",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "origin",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "sellToken",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "minFunds",
				"type": "uint256"
			}
		],
		"name": "sellToken",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "origin",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "minFunds",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "feeRate",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "feeRecipient",
				"type": "address"
			}
		],
		"name": "sellToken",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "token",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "sellToken",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];