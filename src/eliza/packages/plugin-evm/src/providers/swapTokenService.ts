import { FourMemeSwapParams, FourMemeSwapResponse, GetSwapCallDataDto, KyberSwapParams, KyberSwapResponse, OkxParams, OkxSwapResponse, OpenoceanGasPriceResponse, OpenoceanParams, OpenoceanQuoteParams, OpenoceanQuoteResponse, OpenoceanSwapResponse, SwapTokenDto, SwapxParams, TradeSettingsDto } from './type';
import { createWalletClient, encodeFunctionData, ethAddress, formatUnits, Hex, http, zeroAddress } from 'viem';
import { bloxValidatorNodeService, jsonRpcNodeService } from './validatorNodeService.js';
import okxService from './okxService.js';
import openoceanService from './openoceanService.js';
import kyberSwapService from './kyberSwapService.js';
import fourMemeService from './fourMemeService.js';
import { privateKeyToAccount } from 'viem/accounts';
import { base, bsc, mainnet } from 'viem/chains';
import { EVMClient } from './evmClient.js';
import BigNumber from 'bignumber.js';
import swapxABI from './swapxABI.js';
import swapxService from './swapxService.js';

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

export async function getTradeSettings(agentId: string, chain: string): Promise<TradeSettingsDto> {
    const result = await fetch(`http://localhost:8080/agent/trade/settings?agentId=${agentId}&chain=${chain}`);
    return await result.json() as TradeSettingsDto;
}

export class SwapTokenService {
    private readonly logger: Console;
    private readonly ETH_ADDRESS = ethAddress;
    constructor() {
        this.logger = console;
    }
    
    getChain(chainName: string) {
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
        return { chain, chainId };
    }

    async swapToken(req: SwapTokenDto): Promise<string> {
        const { chainName, rpcUrl, privateKey, userWalletAddress, mode = 'FAST', inputTokenCA, amount, gasMode, maxFeePerGas, maxPriorityFeePerGas, tip } = req;
        const { chain } = this.getChain(chainName);
        const account = privateKeyToAccount(req.privateKey as Hex);
        const walletClient = createWalletClient({
            chain,
            transport: http(req.rpcUrl),
            account,
        });
        const calldata = await this.getSwapTxCallData(req);
        // set approval for token transfer
        await new EVMClient({rpcUrl, chainName}).checkAndApproveTokenTransfer({
            walletAddress: userWalletAddress,
            walletPrivateKey: privateKey,
            tokenAddress: inputTokenCA,
            dexRouterAddress: calldata.to,
            rawAmount: amount.toString(),
        });
        const request = await walletClient.prepareTransactionRequest({
            account,
            chain,
            to: calldata.to,
            data: calldata.data,
            value: BigInt(calldata.value),
            kzg: undefined,
        });
        const maxFeePerGasWei = maxFeePerGas ? BigNumber(maxFeePerGas).multipliedBy(new BigNumber(10).pow(9)).toString() : undefined;
        const maxPriorityFeePerGasWei = maxPriorityFeePerGas ? BigNumber(maxFeePerGas).multipliedBy(new BigNumber(10).pow(9)).toString() : undefined;
        if (gasMode === 'CUSTOM' && (maxFeePerGasWei && maxPriorityFeePerGasWei)) {
            request.maxFeePerGas = BigInt(maxFeePerGasWei.toString());
            request.maxPriorityFeePerGas = BigInt(maxPriorityFeePerGasWei.toString());
        } else if (gasMode === 'HIGH') {
            request.maxFeePerGas = BigInt(request.maxFeePerGas) * 2n;
            request.maxPriorityFeePerGas = BigInt(request.maxPriorityFeePerGas) * 2n;
        }
        if (request.maxFeePerGas < request.maxPriorityFeePerGas) {
            request.maxFeePerGas = request.maxPriorityFeePerGas;
        }

        const serializedTransaction = await account.signTransaction(request);
        const validatorNode =
          mode === 'FAST' ? jsonRpcNodeService : bloxValidatorNodeService;
        return await validatorNode.postTransaction({
            walletClient,
            serializedTransaction,
            tip
        })
    }

    async getSwapTxCallData({
        rpcUrl,
        chainName,
        amount,
        slippage,
        inputTokenCA,
        outputTokenCA,
        userWalletAddress,
        exactFees = [{
            feeCollector: getSWAP_FEE_ACCOUNT(),
            feeRate: getSWAP_FEE_BPS().toString(),
        }],
    }: GetSwapCallDataDto): Promise<{
        to: string,
        data: string,
        value: string,
    }> {
        const { chainId } = this.getChain(chainName);
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
            const evmClient = new EVMClient({
                rpcUrl, chainName
            });

            let tx;
            const fourMemeParams: FourMemeSwapParams = {
                rpcUrl,
                chainName,
                inputTokenCA,
                outputTokenCA,
                amount: amount.toString(),
                recipient: userWalletAddress,
                slippage,
                exactFees
            };
            const fourMemeSwapResponse = await this.getFourMemeCallData(fourMemeParams);
            if (fourMemeSwapResponse) {
                tx = {
                    to: fourMemeSwapResponse.to,
                    data: fourMemeSwapResponse.data,
                    value: fourMemeSwapResponse.value,
                };
            } else {
                const deciaml = await evmClient.getTokenDecimals(inputTokenCA);
                const swapxResponse = await this.getSwapxCallData({
                    rpcUrl,
                    chainName,
                    chainId,
                    tokenIn: inputTokenCA,
                    tokenOut: outputTokenCA,
                    amountIn: amount.toString(),
                    deciaml,
                    to: userWalletAddress,
                    slippage,
                    exactFees
                });

                tx = {
                    to: swapxResponse.to,
                    value: swapxResponse.value,
                    data: swapxResponse.data,
                };
                // if (slippage > 50) {
                //     throw new Error('Openocean error, exceed max slippage: 50%');
                // }
                // const deciaml = await evmClient.getTokenDecimals(inputTokenCA);
                // const openoceanParams: OpenoceanParams = {
                //     chainId,
                //     inTokenAddress: inputTokenCA,
                //     outTokenAddress: outputTokenCA,
                //     amount: formatUnits(BigInt(amount.toString()), deciaml),
                //     slippage: (slippage * 100).toString(),
                //     account: userWalletAddress
                // }
                // const openoceanResponse = await this.getOpenoceanCallData(openoceanParams);
                // if (!openoceanResponse.data) {
                // throw new Error(`Failed to generate transaction, ${openoceanResponse?.data}`);
                // }
                // tx = {
                //     to: openoceanResponse.data.to,
                //     value: openoceanResponse.data.value,
                //     data: openoceanResponse.data.data,
                // };
            }
            return tx;
        } catch (error) {
            throw new Error(
                `Get swap call data failed: ${error instanceof Error ? error.message : 'unknown error'}`,
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

    private async getSwapxCallData(params: SwapxParams): Promise<{
        to: string,
        data: string,
        value: string,
    }> {
        const response: OpenoceanGasPriceResponse = await openoceanService.getGasPrice({
            chainId: params.chainId
        });
        if (!response.without_decimals) {
            throw new Error(`Get gas price failed: ${JSON.stringify(response)}`);
        }
        params.gasPrice = response.without_decimals.fast.toString();

        const routes = await this.getRoutes({
            chainId: params.chainId,
            inTokenAddress: params.tokenIn.toLowerCase() === ethAddress ? swapxService.getWETH(params.chainName) : params.tokenIn,
            outTokenAddress: params.tokenOut.toLowerCase() === ethAddress ? swapxService.getWETH(params.chainName) : params.tokenOut,
            amount: formatUnits(BigInt(params.amountIn), params.deciaml).toString(),
            gasPrice: params.gasPrice,
            enabledDexIds: '1,45,46' //PancakeV2, UniswapV3, PancakeV3
        });

        if (routes.data.path.routes.length === 0) {
            throw new Error(`Get routes failed: ${JSON.stringify(routes)}`);
        }
        const route = routes.data.path.routes[0];
        if (route.subRoutes.length == 0) {
            throw new Error(`Get routes failed: ${JSON.stringify(routes)}`);
        }
        const amountOut = routes.data.outAmount;
        const amountOutMin = (BigInt(amountOut) * BigInt(100 - params.slippage * 100) / BigInt(100)).toString();
        if (route.subRoutes.length == 1) {
            const dex = routes.data.path.routes[0].subRoutes[0].dexes[0];
            if (dex.dex === 'PancakeV2') {
                return swapxService.buildSwapV2ExactInTx({
                    chainName: params.chainName,
                    poolAddress: dex.id,
                    tokenIn: params.tokenIn.toLowerCase() === ethAddress ? zeroAddress : params.tokenIn,
                    tokenOut: params.tokenOut.toLowerCase() === ethAddress ? swapxService.getWETH(params.chainName) : params.tokenOut,
                    deadline: (Math.floor(Date.now() / 1000) + 60).toString(),
                    amountIn: params.amountIn,
                    amountOutMinimum: amountOutMin,
                    exactFees: params.exactFees,
                })
            } else {
                return swapxService.buildSwapV3ExactInTx({
                    chainName: params.chainName,
                    factoryAddress: swapxService.getFactoryAddress(params.chainName, dex.dex),
                    poolAddress: dex.id,
                    tokenIn: params.tokenIn.toLowerCase() === ethAddress ? zeroAddress : params.tokenIn,
                    tokenOut: params.tokenOut.toLowerCase() === ethAddress ? swapxService.getWETH(params.chainName) : params.tokenOut,
                    fee: await swapxService.getFee(params.rpcUrl, params.chainName, dex.id as `0x${string}`),
                    recipient: params.to,
                    deadline: (Math.floor(Date.now() / 1000) + 60).toString(),
                    amountIn: params.amountIn,
                    amountOutMinimum: amountOutMin,
                    sqrtPriceLimitX96: 0,
                    exactFees: params.exactFees,
                });
            }
        } else {
            const pancakeV2Routes = route.subRoutes.filter((subRoute) => subRoute.dexes[0].dex === "PancakeV2");
            if (pancakeV2Routes.length === route.subRoutes.length) {
                const path: string[] = [];
                route.subRoutes.forEach((subRoute) => {
                    path.push(subRoute.from)
                });
                path.push(params.tokenOut);
                const tx = swapxService.buildSwapV2MultiHopExactInTx({
                    chainName: params.chainName,
                    tokenIn: params.tokenIn,
                    tokenOut: params.tokenOut,
                    amountIn: params.amountIn,
                    amountOutMinimum: amountOutMin,
                    path: path,
                    recipient: params.to,
                    deadline: (Math.floor(Date.now() / 1000) + 60).toString(),
                    factory: swapxService.getFactoryAddress(params.chainName, 'PancakeV2'),
                    exactFees: params.exactFees
                });
                if (params.tokenIn.toLowerCase() === ethAddress) {
                    tx.value = params.amountIn;
                }
                return tx;
            } else if (pancakeV2Routes.length === 0) {
                const feeResults = await Promise.all(
                    route.subRoutes.map(async (subRoute) => {
                        const fee = await swapxService.getFee(
                            params.rpcUrl,
                            params.chainName,
                            subRoute.dexes[0].id as `0x${string}`
                        );
                        return {
                            from: subRoute.from,
                            to: subRoute.to,
                            fee
                        };
                    })
                );
                const path: string[] = [];
                const fees: number[] = [];
                feeResults.forEach((item, index) => {
                  if (index === 0) path.push(item.from);
                  path.push(item.to); 
                  fees.push(item.fee);
                });
                const tx = swapxService.buildSwapV3MultiHopExactInTx({
                    chainName: params.chainName,
                    factoryAddresses: route.subRoutes.map((subRoute) => swapxService.getFactoryAddress(params.chainName, subRoute.dexes[0].dex)),
                    poolAddresses: route.subRoutes.map((subRoute) => subRoute.dexes[0].id),
                    path: swapxService.encodePath(path, fees),
                    recipient: params.to,
                    deadline: (Math.floor(Date.now() / 1000) + 60).toString(),
                    amountIn: params.amountIn,
                    amountOutMinimum: amountOutMin,
                    exactFees: params.exactFees
                });
                if (params.tokenIn.toLowerCase() === ethAddress) {
                    tx.value = params.amountIn;
                }
                return tx;
            } else {
                throw new Error(`No matching swap route found: ${JSON.stringify(route.subRoutes)}`);
            }
        }
    }

    private async getRoutes(params: OpenoceanQuoteParams): Promise<OpenoceanQuoteResponse> {
        const qoute = await openoceanService.getQuote(params);
        return qoute;
    }

    private async getFourMemeCallData(params: FourMemeSwapParams): Promise<FourMemeSwapResponse | undefined> {
        const { rpcUrl, chainName, inputTokenCA, outputTokenCA, amount, slippage } = params;
        const swapxAddress = swapxService.getContract(chainName);
        if (inputTokenCA.toLowerCase() !== ethAddress && outputTokenCA.toLocaleLowerCase() != ethAddress) {
            return undefined;
        }
        if (chainName === 'bsc') {
            const side = inputTokenCA.toLowerCase() === ethAddress ? 'BUY' : 'SELL';
            const tokenInfo = await fourMemeService.getTokenInfo(rpcUrl, chainName, (side === 'BUY' ? outputTokenCA : inputTokenCA) as `0x${string}`);
            if (tokenInfo.version !== '0' && !tokenInfo.liquidityAdded) {
                if (side === 'BUY' && swapxAddress) {
                    const tryBuyResult = await fourMemeService.tryBuy(rpcUrl, chainName, outputTokenCA as `0x${string}`, '0', amount.toString());
                    const minBuyAmount = (BigInt(tryBuyResult.estimatedAmount) * BigInt(100 - slippage * 100) / BigInt(100)).toString();
                    const buyData = encodeFunctionData({
                        abi: swapxABI,
                        functionName: 'buyMemeToken',
                        args: [tokenInfo.tokenManager, outputTokenCA, params.recipient, amount, minBuyAmount, params.exactFees],
                    });
                    return {
                        to: swapxAddress,
                        data: buyData,
                        value: amount.toString(),
                    };
                } else if (side === 'SELL') {
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