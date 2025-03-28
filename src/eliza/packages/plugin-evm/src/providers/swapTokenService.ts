import { FourMemeSwapParams, FourMemeSwapResponse, KyberSwapParams, KyberSwapResponse, OkxParams, OkxSwapResponse, OpenoceanGasPriceResponse, OpenoceanParams, OpenoceanSwapResponse, SwapTokenDto } from './type';
import { createWalletClient, ethAddress, formatUnits, Hex, http, zeroAddress } from 'viem';
import { bloxValidatorNodeService, jsonRpcNodeService } from './validatorNodeService.js';
import okxService from './okxService.js';
import openoceanService from './openoceanService.js';
import kyberSwapService from './kyberSwapService.js';
import fourMemeService from './fourMemeService.js';
import { privateKeyToAccount } from 'viem/accounts';
import { base, bsc, mainnet } from 'viem/chains';
import { EVMClient } from './evmClient.js';
import BigNumber from 'bignumber.js';

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
    return await result.json() as { priorityFee, tip, slippage, mode };
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
        mode = 'FAST',
        gasMode = 'AVG',
        maxFeePerGas,
        maxPriorityFeePerGas,
        tip,
        privateKey,
        userWalletAddress,
    }: SwapTokenDto): Promise<string> {
        // transform gas Gwei to wei
        const maxFeePerGasWei = maxFeePerGas ? BigNumber(maxFeePerGas).multipliedBy(new BigNumber(10).pow(9)).toString() : undefined;
        const maxPriorityFeePerGasWei = maxPriorityFeePerGas ? BigNumber(maxFeePerGas).multipliedBy(new BigNumber(10).pow(9)).toString() : undefined;
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

            const deciaml = await evmClient.getTokenDecimals(inputTokenCA);

            let tx;
            const fourMemeParams: FourMemeSwapParams = {
                rpcUrl,
                chainName,
                inputTokenCA,
                outputTokenCA,
                amount: amount.toString(),
                slippage
            };
            const fourMemeSwapResponse = await this.getFourMemeCallData(fourMemeParams);
            if (fourMemeSwapResponse) {
                tx = {
                    to: fourMemeSwapResponse.to,
                    data: fourMemeSwapResponse.data,
                    value: fourMemeSwapResponse.value,
                };
            } else {
                const openoceanParams: OpenoceanParams = {
                    chainId,
                    inTokenAddress: inputTokenCA,
                    outTokenAddress: outputTokenCA,
                    amount: formatUnits(BigInt(amount.toString()), deciaml),
                    slippage: slippage.toString(),
                    account: userWalletAddress
                }
                const openoceanResponse = await this.getOpenoceanCallData(openoceanParams);
                if (!openoceanResponse.data) {
                    throw new Error(`Failed to generate transaction, ${openoceanResponse?.data}`);
                }
                tx = {
                    to: openoceanResponse.data.to,
                    value: openoceanResponse.data.value,
                    data: openoceanResponse.data.data,
                };
            }

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

            if (gasMode === 'CUSTOM' && (maxFeePerGasWei && maxPriorityFeePerGasWei)) {
                request.maxFeePerGas = BigInt(maxFeePerGasWei.toString());;
                request.maxPriorityFeePerGas = BigInt(maxPriorityFeePerGasWei.toString());;
            } else if (gasMode === 'HIGH') {
                request.maxFeePerGas = BigInt(request.maxFeePerGas) * 2n;
                request.maxPriorityFeePerGas = BigInt(request.maxPriorityFeePerGas) * 2n;
            }
            if (request.maxFeePerGas < request.maxPriorityFeePerGas) {
                throw new Error('Invalid max fee or max priority fee');
            }

            const serializedTransaction = await account.signTransaction(request);
            const validatorNode =
                mode === 'FAST' ? jsonRpcNodeService : bloxValidatorNodeService;
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

    private async getFourMemeCallData(params: FourMemeSwapParams): Promise<FourMemeSwapResponse | undefined> {
        const { rpcUrl, chainName, inputTokenCA, outputTokenCA, amount, slippage } = params;
        if (chainName === 'bsc') {
            const side = inputTokenCA.toLowerCase() === ethAddress ? 'BUY' : 'SELL';
            const tokenInfo = await fourMemeService.getTokenInfo(rpcUrl, chainName, (side === 'BUY' ? outputTokenCA : inputTokenCA) as `0x${string}`);
            if (tokenInfo.version !== '0' && !tokenInfo.liquidityAdded) {
                if (side === 'BUY') {
                    const tryBuyResult = await fourMemeService.tryBuy(rpcUrl, chainName, outputTokenCA as `0x${string}`, '0', amount.toString());
                    const minBuyAmount = (BigInt(tryBuyResult.estimatedAmount) * BigInt(100 - slippage * 100) / BigInt(100)).toString();
                    const buyData = fourMemeService.buildBuyTxData(tokenInfo.version, outputTokenCA, amount.toString(), minBuyAmount);
                    return {
                        to: tokenInfo.tokenManager,
                        data: buyData,
                        value: amount.toString(),
                    };
                } else {
                    const trySellResult = await fourMemeService.trySell(rpcUrl, chainName, inputTokenCA as `0x${string}`, amount.toString());
                    const minFunds = (BigInt(trySellResult.funds) * BigInt(100 - slippage * 100) / BigInt(100)).toString();
                    const feePercent = getSWAP_FEE_BPS() ?? 0;
                    const feeAccount = getSWAP_FEE_ACCOUNT() ?? zeroAddress;
                    const sellData = fourMemeService.buildSellTxData(tokenInfo.version, '0', inputTokenCA, amount.toString(), minFunds, feePercent.toString(), feeAccount);
                    return {
                        to: tokenInfo.tokenManager,
                        data: sellData,
                        value: '0',
                    };
                }
            }
        }
        return undefined;
    }
}