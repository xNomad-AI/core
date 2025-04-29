// src/message/message.service.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { ProcessChatRequest, ProcessChatResponse, UserContext, ChatRequestBody } from './chat.types.js';
import { ApiKeyService } from '../api-keys/api-key.service.js';

@Injectable()
export class ChatService {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly httpService: HttpService,
    private readonly apiKeyService: ApiKeyService,
  ) {
    this.logger.setContext(ChatService.name);
  }


  async processChat(request: ProcessChatRequest): Promise<ProcessChatResponse> {
    
    this.logger.debug('API key provided, validating and retrieving user context');
    const keyData = await this.apiKeyService.validateApiKey(request.apiKey);
    // already checked in middleware so there is no need to check again
    
    // Use userId from API key
    const userId = keyData.userId;
    const roomId = keyData.roomId;
    const agentId = keyData.agentId;

    // Ensure we have an agentId for processing
    if (!agentId) {
      this.logger.error('Missing agentId, cannot process message');
      throw new Error('Agent ID is required for message processing');
    }

    this.logger.debug(`Context from API key: userId=${userId}, roomId=${roomId}, agentId=${agentId}`);

    const chatRequestBody: ChatRequestBody = {
      agentId,
      text: request.text,
      stream: request.stream,
      roomId,
      userId,
      user: request.user,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      accessToken: request.accessToken
    };

    const response = await this.request(chatRequestBody);

    this.logger.debug('Message processed successfully');
    return { text: response[response.length - 1].text };

  }


  private async request(body: ChatRequestBody): Promise<any[]> {
    this.logger.debug(`Sending request to agent ${body.agentId}`);
    
    if (!body.agentId) {
      this.logger.error('Critical error: agentId is undefined or empty');
      throw new Error('Agent ID is required for message processing');
    }
    
    const port = this.appConfig.get<number>('AGENT_SERVER_PORT');
    const url = `http://localhost:${port}/${body.agentId}/message`;
    
    this.logger.debug(`Request URL: ${url}`);
    this.logger.debug(`Request payload: ${JSON.stringify({
      text: body.text?.substring(0, 50) + (body.text?.length > 50 ? '...' : ''),
      stream: body.stream,
      roomId: body.roomId,
      userId: body.userId
    })}`);
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (body.accessToken) {
        headers['Authorization'] = `Bearer ${body.accessToken}`;
      }

      const response = await firstValueFrom(
        this.httpService.post<any[]>(url, body, { headers })
      );
      
      this.logger.debug(`Response received: status=${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Request failed: ${error.message}`);
      this.logger.error(`Failed endpoint: ${url}`);
      this.logger.error(`Agent ID: ${body.agentId}`);
      
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Error details: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}