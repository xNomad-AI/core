export interface ProcessMessageRequest {
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

export interface ProcessMessageResponse {
  text: string;
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