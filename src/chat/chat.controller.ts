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
  private readonly requestQueue: PQueue;

  constructor(
    private readonly chatService: ChatService,
    private readonly logger: TransientLoggerService,
    private readonly rateLimitService: RateLimitService,
  ) {
    this.logger.setContext('ChatController');
    // Process 10 requests concurrently, max 200 in queue
    this.requestQueue = new PQueue({ 
      concurrency: 10,
      autoStart: true,
      timeout: 30000, // 30 second timeout
      throwOnTimeout: true
    });

    // Monitor queue size
    this.requestQueue.on('add', () => {
      this.logger.debug(`Queue size: ${this.requestQueue.size}, Pending: ${this.requestQueue.pending}`);
    });

    // Handle queue errors
    this.requestQueue.on('error', (error) => {
      this.logger.error(`Queue error: ${error.message}`);
    });
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
      // Check if queue is too full
      if (this.requestQueue.size >= 200) {
        throw new HttpException({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'Service busy',
          message: 'Too many requests in queue, please try again later',
        }, HttpStatus.SERVICE_UNAVAILABLE);
      }

      return new Promise<ChatCompletionResponse>((resolve, reject) => {
        this.requestQueue.add(async () => {
          try {
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
              stream: 'false',
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

            resolve({
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
            });
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
}