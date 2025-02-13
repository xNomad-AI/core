import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from './transient-logger.service.js';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ElevenlabsService {
  private endpoint: string;
  private apikey: string;
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apikey = this.appConfig.get<string>('ELEVENLABS_API_KEY');
    this.endpoint = 'https://api.elevenlabs.io';
  }

  async getVoices() {
    const url = `${this.endpoint}/v1/voices`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apikey,
      },
    };
    const response = await firstValueFrom(this.httpService.get(url, config));
    return response.data;
  }
}
