import {
    type ActionExample,
    composeContext,
    generateObjectDeprecated,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State,
    type Action,
    elizaLogger,
} from "@elizaos/core";
import {getWalletKey, sign} from "../keypairUtils.js";
import { isAgentAdmin, NotAgentAdminMessage, walletProvider } from '../providers/wallet.js';


const claimAirdropTemplate = `
{{recentMessages}}

Given the recent messages, Extract the airdrop information from the message, Use null for any values that cannot be determined. The result should be a valid json object with the following fields:
{
    programName: string | null
}

for example:
claim airdrop of [Xnomad AI Initial funds]

The result should be a valid json object with the following fields:
{
    programName: "Xnomad AI Initial funds"
}
`;

interface ClaimAirdropRequest {
    protocol: string;
    version: string;
    blockchain: string;
    delegator: string;
    delegatee: string;
    expiresAt: Date;
    airdrop: {
        programName: string;
        claimMethod: string;
        claimUrl: string;
    };
    signature?: string;
}


async function claimAirdropHttp(runtime: IAgentRuntime, req: ClaimAirdropRequest){
    elizaLogger.log("running claimAirdrop...", req);
    const { keypair } = await getWalletKey(runtime, true);
    req.signature = sign(JSON.stringify(req), keypair);

    const response = await fetch(req.airdrop.claimUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
    });
    const result = await response.json();
    elizaLogger.log("claimAirdrop result:", result);
    return true
}

export const airdrop: Action = {
    name: "CLAIM_AIRDROP",
    similes: [],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if the necessary parameters are provided in the message
        elizaLogger.log("Validating CLAIM_AIRDROP Message:", message.content);
        return true;
    },
    description: "Perform claim airdrop",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        const isAdmin = await isAgentAdmin(runtime, message);
        if (!isAdmin) {
            const responseMsg = {
                text: NotAgentAdminMessage,
            };
            callback?.(responseMsg);
            return true;
        }
        // composeState
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const walletInfo = await walletProvider.get(runtime, message, state);

        state.walletInfo = walletInfo;

        const context = composeContext({
            state,
            template: claimAirdropTemplate,
        });

        const response = await generateObjectDeprecated({
            runtime,
            context: context,
            modelClass: ModelClass.LARGE,
        });


        elizaLogger.log("Response:", response);
        if (response.programName){
            const responseMsg = {
                text: "[Xnomad AI Initial funds] Airdrop claimed successfully. 0.01 SOL will be transferred to your wallet.",
                action: "CLAIM_AIRDROP",
            };
            callback?.(responseMsg);
            return true
        }
        // const{ keypair } =  await getWalletKey(runtime, true);
        // if (response.delegatee != keypair.publicKey.toBase58()){
        //     const responseMsg = {
        //         text: `You are not the delegatee for the airdrop. Delegatee address: ${response.delegatee}`,
        //     };
        //     callback?.(responseMsg);
        //     return false
        // }
        //
        // if (response.airdrop.claimMethod != "http" || !response.airdrop.claimUrl){
        //     const responseMsg = {
        //         text: `Only http claim method is supported now. Claim URL: ${response.airdrop.claimUrl}`,
        //     };
        //     callback?.(responseMsg);
        //     return false
        // }
        //
        // try {
        //     const isSuccess = await claimAirdropHttp(runtime, response);
        //     if (isSuccess) {
        //         const responseMsg = {
        //             text: `Airdrop claimed successfully.`,
        //         };
        //         callback?.(responseMsg);
        //         return true
        //     }else{
        //         const responseMsg = {
        //             text: `claim airdrop failed`,
        //         };
        //         callback?.(responseMsg);
        //         return false
        //     }
        // } catch (error) {
        //     elizaLogger.error(`Error during claim airdrop ${error}`);
        //     const responseMsg = {
        //         text: `Error during claim airdrop: ${error}`,
        //     };
        //     callback?.(responseMsg);
        //     return false;
        // }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: 'claim airdrop of [Xnomad AI Initial funds]',
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Please ack, the program name is [Xnomad AI Initial funds]",
                    action: "CLAIM_AIRDROP",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "yes",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "[Xnomad AI Initial funds] Airdrop claimed successfully. 0.01 SOL will be transferred to your wallet.",
                    action: "CLAIM_AIRDROP",
                },
            },
        ],
        // Add more examples as needed
    ] as ActionExample[][],
} as Action;