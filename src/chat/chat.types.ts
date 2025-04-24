export interface ProcessChatRequest {
    text: string;
    user: string;
    stream: string;
    apiKey?: string;
    userId?: string;
    roomId?: string;
    agentId?: string;
    temperature?: number;
    max_tokens?: number;
    model?: string;
}

export interface ProcessChatResponse {
  text: string;
}

/**
 * Interface for the request body sent to the agent service
 */
export interface ChatRequestBody {
  agentId: string;
  text: string;
  stream: string;
  roomId?: string;
  userId: string;
  user: string;
  temperature?: number;
  max_tokens?: number;
}

export interface UserContext {
  userId: string;
  roomId?: string;
  agentId?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}