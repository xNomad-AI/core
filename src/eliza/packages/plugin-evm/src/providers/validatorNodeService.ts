import BigNumber from 'bignumber.js';
import { keccak256, toBytes, WalletClient } from 'viem';
import { base, bsc, mainnet } from 'viem/chains';
abstract class ValidatorNodeService {
    abstract postTransaction(
        {
            walletClient,
            serializedTransaction,
            tip,
        }: {
            walletClient: WalletClient;
            serializedTransaction: `0x${string}`;
            tip?: string | BigNumber
        }
    ): Promise<string>;
}

class JsonRPCNodeService extends ValidatorNodeService {
    async postTransaction(
        {
            walletClient,
            serializedTransaction,
            tip,
        }: {
            walletClient: WalletClient;
            serializedTransaction: `0x${string}`;
            tip?: string | BigNumber
        }
    ): Promise<string> {
        try {
            const hash = await walletClient.sendRawTransaction({
                serializedTransaction,
            })
            return hash;
        } catch (error) {
            return error.message;
        }
    }
}
class BloxValidatorNodeService extends ValidatorNodeService {
    private readonly bloxApiUrl =
        'https://api.blxrbdn.com';

    private readonly apikey = process.env.BLOX_API_KEY;

    async postTransaction(
        {
            walletClient,
            serializedTransaction,
            tip,
        }: {
            walletClient: WalletClient;
            serializedTransaction: `0x${string}`;
            tip?: string | BigNumber
        }
    ): Promise<string> {
        try {
            const blockNumber = await walletClient.request({
                method: 'eth_blockNumber',
                params: [],
            });

            let body;
            switch (walletClient.chain) {
                case mainnet:
                    throw new Error(`Unsupport chain: ${mainnet.name}`);
                case base:
                    throw new Error(`Unsupport chain: ${base.name}`);
                case bsc:
                    body = {
                        id: 1,
                        method: 'blxr_submit_bundle',
                        params: {
                            "transaction": [serializedTransaction.slice(2,)],
                            "blockchain_network": "BSC-Mainnet",
                            "block_number": blockNumber as string,
                            // "blocks_count": 10,
                            "mev_builders": {
                                "all": ""
                            }
                        },
                    };
                    if (tip) {
                        const tipRequest = await walletClient.prepareTransactionRequest({
                            chain: walletClient.chain,
                            to: '0x74c5F8C6ffe41AD4789602BDB9a48E6Cad623520',
                            data: '0x',
                            value: BigInt(tip.toString()),
                            kzg: undefined,
                        });
                        tipRequest.nonce += 1;
                        const tipTransaction = await walletClient.account.signTransaction(tipRequest);
                        console.log(tipRequest, tipTransaction)

                        body.params.transaction.push(tipTransaction.slice(2,));
                    }
                    break;
                default:
                    throw new Error(`Unsupport chain name ${walletClient.chain.name}`);
            }
            const response = await fetch(
                this.bloxApiUrl,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': this.apikey,
                    },
                    body: JSON.stringify(body),
                },
            );
            const responseData = await response.json();
            if (responseData.error) {
                throw new Error(responseData.error.message);
            }
            // return responseData.result.bundleHash;
            return keccak256(toBytes(serializedTransaction));
        } catch (error) {
            return error.message;
        }
    }
}

const jsonRpcNodeService = new JsonRPCNodeService();
const bloxValidatorNodeService = new BloxValidatorNodeService();

export { jsonRpcNodeService, bloxValidatorNodeService };
