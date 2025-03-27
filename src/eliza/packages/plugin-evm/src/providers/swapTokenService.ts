import { KyberSwapParams, KyberSwapResponse, OkxParams, OkxSwapResponse, OpenoceanGasPriceResponse, OpenoceanParams, OpenoceanSwapResponse, SwapTokenDto } from './type';
import { createWalletClient, ethAddress, formatUnits, Hex, http, zeroAddress } from 'viem';
import { bloxValidatorNodeService, jsonRpcNodeService } from './validatorNodeService.js';
import okxService from './okxService.js';
import openoceanService from './openoceanService.js';
import kyberSwapService from './kyberSwapService.js';
import { privateKeyToAccount } from 'viem/accounts';
import { base, bsc, mainnet } from 'viem/chains';
import { EVMClient } from './evmClient.js';

const DEFAULT_CONFIG = {
    EVM_SWAP_FEE_ACCOUNT: '0x1b455ab558518b7c32bafaff4661ede24cef005c',
    EVM_SWAP_FEE_BPS: 100,
  };
  
  export function getSWAP_FEE_BPS() {
    return DEFAULT_CONFIG.EVM_SWAP_FEE_BPS;
  }
  
  export function getSWAP_FEE_ACCOUNT() {
    return DEFAULT_CONFIG.EVM_SWAP_FEE_ACCOUNT;
  }
  
  export async function getTradeSettings(agentId: string) {
    const result = await fetch(`http://localhost:8080/agent/trade/settings?agentId=${agentId}`);
    return await result.json() as {priorityFee, tip, slippage, mode};
  }

export class SwapTokenService {
    private readonly logger: Console;
    private readonly ETH_ADDRESS = ethAddress;
    constructor() {
        this.logger = console;
    }

    async swapToken({
        rpcUrl,
        chainName,
        amount,
        slippage,
        inputTokenCA,
        outputTokenCA,
        mode = 'JSON_RPC',
        gasMode = 'AVG',
        maxFeePerGas,
        maxPriorityFeePerGas,
        tip,
        privateKey,
        userWalletAddress,
    }: SwapTokenDto): Promise<string> {
        let chain;
        let chainId;
        switch (chainName) {
            case 'ethereum':
                chain = mainnet;
                chainId = 1;
                break;
            case 'base':
                chain = base;
                chainId = 8453;
                break;
            case 'bsc':
                chain = bsc;
                chainId = 56;
                break;
            default:
                throw new Error(`Invalid chain name ${chainName}`);
        }

        if (inputTokenCA.toLowerCase() === zeroAddress) {
            inputTokenCA = ethAddress;
        }
        if (outputTokenCA.toLowerCase() === zeroAddress) {
            outputTokenCA = ethAddress;
        }

        if (!slippage || slippage < 0 || slippage > 1) {
            throw new Error('Invalid slippage, slippage should be between 0 and 1');
        }

        if (!rpcUrl || !chainId || !userWalletAddress) {
            throw new Error('Missing required parameters');
        }

        this.logger.info(
          `[swap token] ${chainName} Swapping ${amount} ${inputTokenCA} to ${outputTokenCA}`,
        );

        try {
            const account = privateKeyToAccount(privateKey as Hex);
            const walletClient = createWalletClient({
                chain,
                transport: http(rpcUrl),
                account,
            });

            const evmClient = new EVMClient({
                rpcUrl, chainName
            });
            
            const kyberSwapParams: KyberSwapParams = {
                chain: chainName,
                tokenIn: inputTokenCA,
                tokenOut: outputTokenCA,
                amountIn: amount.toString(),
                to: userWalletAddress,
                slippageTolerance: (slippage * 100).toString()
            }

            const kyberSwapResponse = await this.getKyberSwapCallData(kyberSwapParams);
            if (!kyberSwapResponse.encodedSwapData) {
                throw new Error(`Failed to generate transaction: ${kyberSwapResponse}`);
            }
            const tx: any = {
                to: kyberSwapResponse.routerAddress,
                value: inputTokenCA.toLowerCase() === ethAddress ? amount.toString() : '0',
                data: kyberSwapResponse.encodedSwapData,
            };

            await evmClient.checkAndApproveTokenTransfer({
                walletAddress: userWalletAddress,
                walletPrivateKey: privateKey,
                tokenAddress: inputTokenCA,
                dexRouterAddress: tx.to,
                rawAmount: amount.toString(),
            });

            const request = await walletClient.prepareTransactionRequest({
                account,
                chain,
                to: tx.to,
                data: tx.data,
                value: BigInt(tx.value),
                kzg: undefined,
            });
            
            if (gasMode === 'CUSTOM' && (maxFeePerGas && maxPriorityFeePerGas)) {
                request.maxFeePerGas = BigInt(maxFeePerGas.toString());;
                request.maxPriorityFeePerGas = BigInt(maxPriorityFeePerGas.toString());;
            } else if (gasMode === 'HIGH') {
                request.maxFeePerGas = BigInt(request.maxFeePerGas) * 2n;
                request.maxPriorityFeePerGas = BigInt(request.maxPriorityFeePerGas) * 2n;
            }
            if (request.maxFeePerGas < request.maxPriorityFeePerGas) {
                throw new Error('Invalid max fee or max priority fee');
            }
            
            const serializedTransaction = await account.signTransaction(request);
            const validatorNode =
                mode === 'JSON_RPC' ? jsonRpcNodeService : bloxValidatorNodeService;
            return await validatorNode.postTransaction({
                walletClient,
                serializedTransaction,
                tip
            })
        } catch (error) {
            throw new Error(
                `Swap token failed: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
        }
    }


    private async getOKXCallData(params: OkxParams): Promise<OkxSwapResponse> {
        if (params.fromTokenAddress === this.ETH_ADDRESS || params.toTokenAddress === this.ETH_ADDRESS) {
            params.directRoute = true;
        }
        if (params.slippage === '1') {
            params.autoSlippage = true;
            params.maxAutoSlippage = "0.99"; // okx max slippage should be less than 1
        }

        const feePercent = Number(getSWAP_FEE_BPS()) / 100;
        const feeAccount = getSWAP_FEE_ACCOUNT();
        if (feePercent && feeAccount) {
            params.feePercent = feePercent.toString();
            params.toTokenAddress === ethAddress ?
                params.toTokenReferrerWalletAddress = feeAccount :
                params.fromTokenReferrerWalletAddress = feeAccount;
        }

        return await okxService.getCallData(params);
    }

    private async getOpenoceanCallData(params: OpenoceanParams): Promise<OpenoceanSwapResponse> {
        const feePercent = Number(getSWAP_FEE_BPS()) / 100;
        const feeAccount = getSWAP_FEE_ACCOUNT();

        if (feePercent && feeAccount) {
            params.referrerFee = feePercent;
            params.referrer = feeAccount;
        }

        if (!params.gasPrice) {
            const response: OpenoceanGasPriceResponse = await openoceanService.getGasPrice({
                chainId: params.chainId
            });
            if (!response.without_decimals) {
                throw new Error(`Get gas price failed: ${JSON.stringify(response)}`);
            }
            params.gasPrice = response.without_decimals.fast.toString();
        }

        return await openoceanService.getCallData(params);
    }

    private async getKyberSwapCallData(params: KyberSwapParams): Promise<KyberSwapResponse> {
        const feePercent = getSWAP_FEE_BPS();
        const feeAccount = getSWAP_FEE_ACCOUNT();

        if (feePercent && feeAccount) {
            params.isInBps = true;
            params.chargeFeeBy = params.tokenIn.toLowerCase() === ethAddress ? 'currency_in' : 'currency_out';
            params.feeAmount = feePercent.toString();
            params.feeReceiver = feeAccount;
        }

        return await kyberSwapService.getCallData(params);
    }
}