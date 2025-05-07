import { Body, Controller, Post, UseGuards, Param, UseInterceptors, UploadedFile, Request, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { ChatService } from './chat.service.js';
import { encode } from 'gpt-tokenizer';
import { ProcessChatRequest, ChatCompletionResponse } from './chat.types.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

@Controller('/v1/chat')
@UseGuards(ThrottlerGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly logger: TransientLoggerService,
  ) {
    this.logger.setContext('ChatController');
  }

  @Post('/completions')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 40, ttl: 10000 } })
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
      const accessToken = req.headers['authorization']?.split(' ')[1] || '';

      this.logger.debug('Processing chat completion request');
      const response = await this.processRequest(body, req, userAddress, accessToken);
      return response;
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

  private async processRequest(body: any, req: any, userAddress: string, accessToken: string): Promise<ChatCompletionResponse> {
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
      model: body.model,
      accessToken
    };
    
    const response = await this.chatService.processChat(request);

    // Count tokens
    const promptTokens = encode(userText).length;
    const responseContent = response.text + (response.analysis ? '\n' + JSON.stringify(response.analysis) : '');
    const completionTokens = encode(responseContent).length;

    // Generate OpenAI-like ID
    const randomString = [...Array(29)].map(() => 
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".charAt(
        Math.floor(Math.random() * 62)
      )
    ).join('');
    
    return {
      id: `chatcmpl-${randomString}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            text: response.text,
            analysis: response.analysis
          })
        },
        finish_reason: ''
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    };
  }
}