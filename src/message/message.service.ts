// src/message/message.service.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { ProcessMessageRequest, ProcessMessageResponse } from './message.types.js';

@Injectable()
export class MessageService {

  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly httpService: HttpService,
  ) {
    logger.setContext(MessageService.name);
  }

  async processMessage(request: ProcessMessageRequest): Promise<ProcessMessageResponse> {
    this.logger.debug(`Processing message for agent ${request.agentId}`);
    
    if (!request.agentId) {
      this.logger.error('Missing agentId in request');
      throw new Error('Agent ID is required');
    }
    
    const response = await this.request(request.agentId, {
      text: request.text,
      stream: request.stream === 'true',
      roomId: request.roomId,
      userId: request.userId,
      user: request.user,
    });

    this.logger.debug('Message processed successfully');
    return { text: response[response.length - 1].text };
  }

  private async request(agentId: string, body: any) {
    this.logger.debug(`Sending request to agent ${agentId}`);
    
    if (!agentId) {
      this.logger.error('Critical error: agentId is undefined or empty');
      throw new Error('Agent ID is required for message processing');
    }
    
    const port = this.appConfig.get<number>('AGENT_SERVER_PORT');
    const url = `http://localhost:${port}/${agentId}/message`;
    
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
      this.logger.error(`Agent ID: ${agentId}`);
      
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Error details: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}