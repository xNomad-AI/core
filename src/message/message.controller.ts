import { Body, Controller, Post, UseGuards, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { MessageService } from './message.service.js';
import { encode } from 'gpt-tokenizer';
import { ProcessMessageRequest, ChatCompletionResponse } from './message.types.js';

@Controller('/v1/chat')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('/completions')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(AuthGuard)
  async processMessage(
    @Body() body: ProcessMessageRequest,
 
  ): Promise<ChatCompletionResponse> {
    const response = await this.messageService.processMessage({
      ...body,
    });

    // Count tokens
    const promptTokens = encode(body.text).length;
    const completionTokens = encode(response.text).length;

    return {
      id: Date.now().toString(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-3.5-turbo',
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