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
    const response = await this.request(request.agentId, {
      text: request.text,
      stream: request.stream === 'true',
      roomId: request.roomId,
      userId: request.userId,
      user: request.user,
    });

    return { text: response[response.length - 1].text };
  }

  private async request(agentId: string, body: any) {
    const port = this.appConfig.get<number>('AGENT_SERVER_PORT');
    const url = `http://localhost:${port}/${agentId}/message`;
    
    console.log('URL:', url);
    console.log('BODY:', JSON.stringify(body, null, 2));
    
    this.logger.log(`Making request to: ${url}`);
    this.logger.log(`Request body: ${JSON.stringify(body, null, 2)}`);
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          headers: { 'Content-Type': 'application/json' }
        })
      );
      
      console.log('-- REQUEST SUCCESSFUL --');
      console.log('STATUS:', response.status);
      
      this.logger.log(`Response status: ${response.status}`);
      this.logger.log(`Response data: ${JSON.stringify(response.data, null, 2)}`);
      return response.data;
    } catch (error) {
      console.log('ERROR:', error.message);
      if (error.response) {
        console.log('STATUS:', error.response.status);
        console.log('DATA:', JSON.stringify(error.response.data, null, 2));
      }
      
      this.logger.error(`Failed to process message: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      throw error;
    }
  }
}