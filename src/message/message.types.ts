export interface ProcessMessageRequest {
    text: string;
    user: string;
    roomId?: string;
    userId?: string;
    agentId?: string;
    stream: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }

export interface ProcessMessageResponse {
  text: string;
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