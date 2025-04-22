import { Body, Controller, Post, UseGuards, Param, UseInterceptors, UploadedFile, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { MessageService } from './message.service.js';
import { encode } from 'gpt-tokenizer';
import { ProcessMessageRequest, ChatCompletionResponse } from './message.types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

@Controller('/v1/chat')
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly logger: TransientLoggerService,
  ) {
    this.logger.setContext('MessageController');
  }

  @Post('/completions')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(AuthGuard)
  async processMessage(
    @Body() body: {
      model?: string;
      messages: { role: string; content: string }[];
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    },
    @Request() req
  ): Promise<ChatCompletionResponse> {
    this.logger.debug('Processing chat completion request');
    this.logger.debug(`Auth values: userId=${req.userId}, roomId=${req.roomId}, agentId=${req.agentId}`);
    
    // Extract the last user message from the messages array
    const lastMessage = body.messages[body.messages.length - 1];
    const userText = lastMessage.content;

    // Get user Auth values from the AuthGuard using API key auth (req)
    const request: ProcessMessageRequest = {
      text: userText,
      user: 'user',
      stream: body.stream ? 'true' : 'false',
      userId: req.userId,
      roomId: req.roomId,
      agentId: req.agentId,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      model: body.model
    };
    
    this.logger.debug(`Sending to message service: ${JSON.stringify({
      text: userText.substring(0, 50) + (userText.length > 50 ? '...' : ''),
      userId: req.userId,
      roomId: req.roomId,
      agentId: req.agentId,
      model: body.model
    })}`);

    const response = await this.messageService.processMessage(request);

    // Count tokens
    const promptTokens = encode(userText).length;
    const completionTokens = encode(response.text).length;
    this.logger.debug(`Response received, tokens: prompt=${promptTokens}, completion=${completionTokens}`);

    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model || 'default-model',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.text
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    };
  }
} 