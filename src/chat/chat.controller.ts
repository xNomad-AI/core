import { Body, Controller, Post, UseGuards, Param, UseInterceptors, UploadedFile, Request, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { ChatService } from './chat.service.js';
import { encode } from 'gpt-tokenizer';
import { ProcessChatRequest, ChatCompletionResponse } from './chat.types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { RateLimitService } from '../shared/rate-limit.service.js';
import PQueue from 'p-queue';

@Controller('/v1/chat')
export class ChatController {
  private readonly userQueues: Map<string, PQueue> = new Map();
  
  private readonly MAX_QUEUE_SIZE = 2;  // Maximum requests in queue per user
  private readonly MAX_CONCURRENT_PER_USER = 3;  // Maximum concurrent requests per user
  private readonly REQUEST_TIMEOUT_MS = 20000;  // Request timeout in milliseconds

  constructor(
    private readonly chatService: ChatService,
    private readonly logger: TransientLoggerService,
    private readonly rateLimitService: RateLimitService,
  ) {
    this.logger.setContext('ChatController');
  }

  private getOrCreateUserQueue(userAddress: string): PQueue {
    let queue = this.userQueues.get(userAddress);
    if (!queue) {
      queue = new PQueue({ 
        concurrency: this.MAX_CONCURRENT_PER_USER,
        autoStart: true,
        timeout: this.REQUEST_TIMEOUT_MS,
        throwOnTimeout: true
      });

      // Monitor queue size
      queue.on('add', () => {
        this.logger.debug(`Queue size for user ${userAddress}: ${queue.size}, Pending: ${queue.pending}`);
      });

      // Handle queue errors
      queue.on('error', (error) => {
        this.logger.error(`Queue error for user ${userAddress}: ${error.message}`);
      });

      this.userQueues.set(userAddress, queue);
    }
    return queue;
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
    try {
      const userAddress = req['X-USER-ADDRESS'];
      const userQueue = this.getOrCreateUserQueue(userAddress);

      // Check if user's queue is too full
      if (userQueue.size >= this.MAX_QUEUE_SIZE) {
        throw new HttpException({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'Service busy',
          message: `Too many requests in queue for this user (max ${this.MAX_QUEUE_SIZE}), please try again later`,
        }, HttpStatus.SERVICE_UNAVAILABLE);
      }

      return new Promise<ChatCompletionResponse>((resolve, reject) => {
        userQueue.add(async () => {
          try {
            this.logger.debug('Processing chat completion request');
            
            // Check rate limit (requests per hour)
            const isAllowed = await this.rateLimitService.checkRateLimit(userAddress);
            
            if (!isAllowed) {
              const remainingTime = await this.rateLimitService.getResetTime(userAddress);
              throw new HttpException({
                status: HttpStatus.TOO_MANY_REQUESTS,
                error: 'Rate limit exceeded',
                message: `Please try again in ${Math.ceil((remainingTime - Date.now()) / 1000)} seconds`,
              }, HttpStatus.TOO_MANY_REQUESTS);
            }

            // Process the request
            const response = await this.processRequest(body, req, userAddress);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error processing chat request: ${error.message}`);
      throw new HttpException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal server error',
        message: 'Failed to process chat request',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async processRequest(body: any, req: any, userAddress: string): Promise<ChatCompletionResponse> {
    // Extract the last user message from the messages array
    const lastMessage = body.messages[body.messages.length - 1];
    const userText = lastMessage.content;
    
    // Check for API key in header or from middleware
    const apiKey = req['apiKey'];

    if (!apiKey) {
      this.logger.error('No API key found');
      throw new Error('No API key found');
    }

    this.logger.debug(`API key present: ${!!apiKey}`);
    
    // Create the request object
    const request: ProcessChatRequest = {
      text: userText,
      user: 'user',
      stream: 'false',
      apiKey,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      model: body.model
    };
    
    const response = await this.chatService.processChat(request);

    // Count tokens
    const promptTokens = encode(userText).length;
    const completionTokens = encode(response.text).length;

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