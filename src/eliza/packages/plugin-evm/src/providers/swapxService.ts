import CryptoJS from 'crypto-js';
import { SwapV3MultiHopExactInParams, SwapxSwapV3ExactInParams } from './type.js';
import { encodeFunctionData, zeroAddress } from 'viem';
import swapxABI from './swapxABI.js';

class SwapxService {
    private readonly logger: Console;

    constructor(
        logger?: Console,
    ) {
        this.logger = logger || console;
    }

    getContract(chainName: string) {
        let contract;
        switch (chainName) {
            case 'bsc':
                contract = '0x25751494aa6187db7a6aebc6d53ddae876420f8d';
                break;
            default:
                throw new Error(`Unsupport chain: ${chainName}`);
        }
        return contract;
    }

    getWETH(chainName: string) {
        let weth;
        switch (chainName) {
            case 'bsc':
                weth = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
                break;
            default:
                throw new Error(`Unsupport chain: ${chainName}`);
        }
        return weth;
    }

    getFactoryAddress(chainName: string, dex: string) {
        switch (chainName) {
            case 'bsc': 
                switch(dex) {
                    case 'PancakeV3':
                        return '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
                    default :
                        throw new Error(`Unsupport dex: ${dex}`);
                }
            default:
                throw new Error(`Unsupport chain: ${chainName}`);
        }
    }

    encodePath(tokens: string[], fees: number[]): string {
        if (tokens.length !== fees.length + 1) throw new Error("Invalid path")
    
        let path = tokens[0].toLowerCase().slice(2)
        for (let i = 0; i < fees.length; i++) {
        const feeHex = fees[i].toString(16).padStart(6, '0') // 3 bytes
        const token = tokens[i + 1].toLowerCase().slice(2)
        path += feeHex + token
        }
        return '0x' + path
    }

    buildSwapV3ExactInTx(params: SwapxSwapV3ExactInParams) {
        const contract = this.getContract(params.chainName);
        const data = encodeFunctionData({
            abi: swapxABI,
            functionName: 'swapV3ExactIn',
            args: [
                {
                    factoryAddress: params.factoryAddress,
                    poolAddress: params.poolAddress,
                    tokenIn: params.tokenIn,
                    tokenOut: params.tokenOut,
                    fee: params.fee,
                    recipient: params.recipient,
                    deadline: params.deadline,
                    amountIn: params.amountIn,
                    amountOutMinimum: params.amountOutMinimum,
                    sqrtPriceLimitX96: params.sqrtPriceLimitX96,
                },
                params.exactFees
            ]
        });
        return {
            to: contract,
            data: data,
            value: params.tokenIn.toLowerCase() === zeroAddress ? params.amountIn : '0',
        }
    }

    buildSwapV3MultiHopExactInTx(params: SwapV3MultiHopExactInParams) {
        const contract = this.getContract(params.chainName);
        const data = encodeFunctionData({
            abi: swapxABI,
            functionName: 'swapV3MultiHopExactIn',
            args: [
                {
                    factoryAddresses: params.factoryAddresses,
                    poolAddresses: params.poolAddresses,
                    path: params.path,
                    recipient: params.recipient,
                    deadline: params.deadline,
                    amountIn: params.amountIn,
                    amountOutMinimum: params.amountOutMinimum,
                },
                params.exactFees
            ]
        });
        return {
            to: contract,
            data: data,
            value: '0',
        }
    }
}

const swapxService = new SwapxService();

export default swapxService;