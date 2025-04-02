import CryptoJS from 'crypto-js';
import { SwapMixedMultiHopExactIn, SwapV2MultiHopExactInParams, SwapV3MultiHopExactInParams, SwapxSwapV2ExactInParams, SwapxSwapV3ExactInParams } from './type.js';
import { encodeFunctionData, zeroAddress } from 'viem';
import swapxABI from './swapxABI.js';
import { EVMClient } from './evmClient.js';

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
                switch (dex) {
                    case 'PancakeV3':
                        return '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
                    case 'UniswapV3':
                        return '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7';
                    case 'PancakeV2':
                        return '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
                    default:
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

    buildSwapV2ExactInTx(params: SwapxSwapV2ExactInParams) {
        const contract = this.getContract(params.chainName);
        const data = encodeFunctionData({
            abi: swapxABI,
            functionName: 'swapV2ExactIn',
            args: [
                params.tokenIn,
                params.tokenOut,
                params.amountIn,
                params.amountOutMinimum,
                params.poolAddress,
                params.exactFees
            ]
        });
        return {
            to: contract,
            data: data,
            value: params.tokenIn.toLowerCase() === zeroAddress ? params.amountIn : '0',
        }
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

    buildSwapV2MultiHopExactInTx(params: SwapV2MultiHopExactInParams) {
        const contract = this.getContract(params.chainName);
        const data = encodeFunctionData({
            abi: swapxABI,
            functionName: 'swapV2MultiHopExactIn',
            args: [
                params.tokenIn,
                params.amountIn,
                params.amountOutMinimum,
                params.path,
                params.recipient,
                params.deadline,
                params.factory,
                params.exactFees
            ]
        });
        return {
            to: contract,
            data: data,
            value: '0',
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

    buildSwapMixedMultiHopExactIn(params: SwapMixedMultiHopExactIn) {
        const contract = this.getContract(params.chainName);
        const data = encodeFunctionData({
            abi: swapxABI,
            functionName: 'swapMixedMultiHopExactIn',
            args: [
                {
                    routes: params.routes,
                    path1: params.path1,
                    factory1: params.factory1,
                    poolAddress1: params.poolAddress1,
                    path2: params.path2,
                    factory2: params.factory2,
                    poolAddress2: params.poolAddress2,
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


    async getFee(rpcUrl: string, chainName: string, poolAddress: `0x${string}`): Promise<number> {
        const evmClient = new EVMClient({ rpcUrl, chainName });
        const fee = await evmClient.readContract(
            poolAddress,
            [
                { "inputs": [], "name": "fee", "outputs": [{ "internalType": "uint24", "name": "", "type": "uint24" }], "stateMutability": "view", "type": "function" }
            ],
            'fee',
            []
        );
        return Number(fee);
    }
}

const swapxService = new SwapxService();

export default swapxService;

