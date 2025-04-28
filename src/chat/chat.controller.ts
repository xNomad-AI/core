import { Body, Controller, Post, UseGuards, Param, UseInterceptors, UploadedFile, Request, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { ChatService } from './chat.service.js';
import { encode } from 'gpt-tokenizer';
import { ProcessChatRequest, ChatCompletionResponse } from './chat.types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { RateLimitService } from '../shared/rate-limit.service.js';

@Controller('/v1/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly logger: TransientLoggerService,
    private readonly rateLimitService: RateLimitService,
  ) {
    this.logger.setContext('ChatController');
  }

  @Post('/completions')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(AuthGuard)
  async processChat(
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
    
    // Check rate limit
    const userAddress = req['X-USER-ADDRESS'];
    const isAllowed = await this.rateLimitService.checkRateLimit(userAddress);
    
    if (!isAllowed) {
      const remainingTime = await this.rateLimitService.getResetTime(userAddress);
      throw new HttpException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Rate limit exceeded',
        message: `Please try again in ${Math.ceil((remainingTime - Date.now()) / 1000)} seconds`,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    
    // Extract the last user message from the messages array
    const lastMessage = body.messages[body.messages.length - 1];
    const userText = lastMessage.content;
    
    // Check for API key in header or from middleware
    const apiKey = req['apiKey'];

    if (!apiKey) {
      this.logger.error('No API key found');
      throw new Error('No API key found');
    }

    this.logger.debug(`API key present: ${!!apiKey} (Source: ${req.headers['x-api-key'] ? 'X-API-Key header' : (req['apiKey'] ? 'Authorization header' : 'None')})`);
    
    // Create the request object
    const request: ProcessChatRequest = {
      text: userText,
      user: 'user',
      stream: body.stream ? 'true' : 'false',
      apiKey,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      model: body.model
    };
    
    this.logger.debug(`Sending to chat service: ${JSON.stringify({
      text: userText.substring(0, 50) + (userText.length > 50 ? '...' : ''),
      hasApiKey: !!apiKey,
      apiKeyValue: apiKey ? apiKey.substring(0, 5) + '...' : null,
      model: body.model
    })}`);

    const response = await this.chatService.processChat(request);

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