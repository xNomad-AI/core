import {
  type ActionExample,
  composeContext,
  generateObjectDeprecated,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelClass,
  type State,
  type Action, ActionStatus,
} from '@elizaos/core';

const chatTemplate = `
# Task: Carefully analyze the conversation context and generate response message.
**Format** 
    { 
    "text": "<string>"
} 
# Knowledge 
{{knowledge}} 
 
About {{agentName}}: 
{{bio}} 
{{lore}} 
  
{{attachments}} 
  
{{recentMessages}} 
`;
export const none: Action = {
  functionCallSpec: {
    name: 'none',
    strict: true,
    additionalProperties: false,
    description: 'Normal conversation chat',
    parameters: {
      type: 'null',
      properties: {},
      required: [],
    },
  },
  name: 'none',
  similes: [],
  suppressInitialMessage: true,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return true;
  },
  description: 'Normal conversation chat action',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionStatus> => {
    const chatContext = composeContext({
      state,
      template: chatTemplate,
    });

    const response = await generateObjectDeprecated({
      runtime,
      context: chatContext,
      modelClass: ModelClass.MEDIUM,
    });
    callback?.(response);
    return 'success';
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'hi',
        },
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Hello, how can I help you today?',
          action: 'none',
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
