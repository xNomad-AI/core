import { OkxParams, OkxSwapResponse, SwapTokenDto } from './type';
import { createWalletClient, ethAddress, Hex, http, zeroAddress } from 'viem';
import { bloxValidatorNodeService, jsonRpcNodeService } from './validatorNodeService.js';
import okxService from './okxService.js';
import { privateKeyToAccount } from 'viem/accounts';
import { base, bsc, mainnet } from 'viem/chains';



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
        mode = 'FAST',
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
            const validatorNode =
                mode === 'FAST' ? jsonRpcNodeService : bloxValidatorNodeService;
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
            const tx = okxResponse.data?.[0]?.tx;
            if (!tx) {
                throw new Error(`Failed to generate transaction: ${okxResponse?.msg}`);
            }
            const account = privateKeyToAccount(privateKey as Hex);
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
                gasPrice: BigInt(tx.gasPrice),
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
}