import { createPublicClient, createWalletClient, Hex, http, WalletClient } from 'viem';
import { base, bsc, mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

abstract class ValidatorNodeService {
    abstract postTransaction(
        {
            walletClient,
            serializedTransaction,
        }: {
            walletClient: WalletClient;
            serializedTransaction: string;
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

class MevNodeService extends ValidatorNodeService {
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

const jsonRpcNodeService = new JsonRPCNodeService();
const mevNodeService = new MevNodeService();

export { jsonRpcNodeService, mevNodeService };
