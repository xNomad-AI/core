import { BigNumber } from 'bignumber.js';
import { OkxParams, OkxSwapResponse, SwapTokenDto } from './type';
import { createWalletClient, ethAddress, Hex, http, zeroAddress } from 'viem';
import { jsonRpcNodeService, mevNodeService } from './validatorNodeService';
import okxService from './okxService';
import { getSWAP_FEE_ACCOUNT, getSWAP_FEE_BPS } from './swapUtils';
import { privateKeyToAccount } from 'viem/accounts';
import { base, bsc, mainnet } from 'viem/chains';

export class SwapTokenService {
    private readonly logger: Console;
    private readonly WEI_PER_ETH = new BigNumber('1000000000000000000');
    private readonly SOL_ADDRESS = '11111111111111111111111111111111';
    constructor() {
        this.logger = console;
    }

    async swapToken({
        rpcUrl,
        chainId,
        chainName,
        amount,
        slippage,
        inputTokenCA,
        outputTokenCA,
        mode = 'FAST',
        privateKey,
        userWalletAddress,
    }: SwapTokenDto): Promise<string> {
        try {

            if (inputTokenCA === zeroAddress) {
                inputTokenCA = ethAddress;
            }
            if (outputTokenCA === zeroAddress) {
                outputTokenCA = ethAddress;
            }

            if (!slippage || slippage < 0 || slippage > 1) {
                throw new Error('Invalid slippage, slippage should be between 0 and 1');
            }

            this.logger.info(
                `[swap token] Swapping ${amount} ${inputTokenCA} to ${outputTokenCA}`,
            );

            if (!rpcUrl || chainId || !userWalletAddress) {
                throw new Error('Missing required parameters');
            }

            const validatorNode =
                mode === 'FAST' ? jsonRpcNodeService : mevNodeService;

            const okxParams: OkxParams = {
                chainId,
                amount: amount.toString(),
                toTokenAddress: outputTokenCA,
                fromTokenAddress: inputTokenCA,
                slippage: slippage.toString(),
                userWalletAddress
            };
            this.logger.info('okxParams', JSON.stringify(okxParams));

            const okxResponse = await this.getOKXCallData(okxParams);

            const tx = okxResponse.data[0].tx;
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

            const request = await walletClient.prepareTransactionRequest({                
                account,
                chain,
                to: tx.to,
                data: tx.data,
                value: BigInt(tx.value),
                gas: BigInt(tx.gas),
                gasPrice: tx.gasPrice,
                maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
                kzg: undefined,
            })
            const serializedTransaction = await account.signTransaction(request)
            return await validatorNode.postTransaction({
                walletClient,
                serializedTransaction
            })
        } catch (error) {
            throw new Error(
                `Swap token failed: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
        }
    }


    private async getOKXCallData(params: OkxParams): Promise<OkxSwapResponse> {
        if (params.fromTokenAddress === this.SOL_ADDRESS || params.toTokenAddress === this.SOL_ADDRESS) {
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
}