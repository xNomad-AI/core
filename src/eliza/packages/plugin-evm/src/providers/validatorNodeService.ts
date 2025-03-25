import { keccak256, toBytes, WalletClient } from 'viem';
import { base, bsc, mainnet } from 'viem/chains';
abstract class ValidatorNodeService {
    abstract postTransaction(
        {
            walletClient,
            serializedTransaction,
        }: {
            walletClient: WalletClient;
            serializedTransaction: `0x${string}`;
        }
    ): Promise<string>;
}

class JsonRPCNodeService extends ValidatorNodeService {
    async postTransaction(
        {
            walletClient,
            serializedTransaction,
        }: {
            walletClient: WalletClient;
            serializedTransaction: `0x${string}`;
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
        }: {
            walletClient: WalletClient;
            serializedTransaction: `0x${string}`;
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
                            "transaction": [serializedTransaction],
                            "blockchain_network": "BSC-Mainnet",
                            "block_number": blockNumber as string,
                            "mev_builders": {
                                "all": ""
                            }
                        },
                    };
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
