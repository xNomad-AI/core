// src/message/message.service.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { ProcessChatRequest, ProcessChatResponse, UserContext } from './chat.types.js';
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
    
    // If apiKey is provided, use it to get user info directly
    this.logger.debug('API key provided, validating and retrieving user context');
    const keyData = await this.apiKeyService.validateApiKey(request.apiKey);
    
    if (keyData) {

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
  
    const response = await this.request( {
      agentId: agentId,
      text: request.text,
      stream: request.stream === 'true',
      roomId: roomId,
      userId: userId,
      user: request.user,
    });

    this.logger.debug('Message processed successfully');
    return { text: response[response.length - 1].text };
    
    }else{
      throw new Error('API key is not Valid');
    }
}


  private async request(body: any) {
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
      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          headers: { 'Content-Type': 'application/json' }
        })
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