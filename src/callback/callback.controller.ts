import { Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

import { Body, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';

class BaseCallbackDto {
  monitorId: number;
  clientId: string;
  timestamp: number;
  txHash: string;
}

class PriceCallbackDto extends BaseCallbackDto {
  tokenAddress: string;
  triggeredPrice: number;
  targetPrice: number;
  conditionType: string;
}

class AddressCallbackDto extends BaseCallbackDto {
  address: string;
}

@Controller('/callbacks')
export class CallbackController {
  private apikey: string;

  constructor(
    private appConfig: ConfigService,
    private logger: TransientLoggerService,
  ) {
    this.apikey = this.appConfig.get<string>('TRADE_MONITOR_SERVICE_API_KEY')!;
  }

  @Post('/limit-order')
  async handlePriceCallback(
    @Body() callbackData: PriceCallbackDto,
    @Headers('X-Monitor-ID') monitorId: string,
    @Headers('X-Agent-Address') agentAddress: string,
    @Headers('api-key') apiKey: string,
  ) {
    this.validateApiKey(apiKey);

    try {
      this.logger.debug('Received price monitor callback', {
        monitorId: callbackData.monitorId,
        tokenAddress: callbackData.tokenAddress,
        triggeredPrice: callbackData.triggeredPrice,
      });

      // todo @everimbaq: validate task and swap token

      return {
        success: true,
        message: 'Price monitor callback processed successfully',
      };
    } catch (error) {
      this.logger.error('Error processing price monitor callback', {
        error: error.message,
        monitorId: callbackData.monitorId,
      });
      throw error;
    }
  }

  @Post('/copy-trade')
  @HttpCode(200)
  async handleAddressCallback(
    @Body() callbackData: AddressCallbackDto,
    @Headers('X-Monitor-ID') monitorId: string,
    @Headers('X-Agent-Address') agentAddress: string,
    @Headers('api-key') apiKey: string,
  ) {
    this.validateApiKey(apiKey);

    try {
      this.logger.debug('Received address monitor callback', {
        monitorId: callbackData.monitorId,
        address: callbackData.address,
      });

      // todo @everimbaq: validate task and swap token

      return {
        success: true,
        message: 'Address monitor callback processed successfully',
      };
    } catch (error) {
      this.logger.error('Error processing address monitor callback', {
        error: error.message,
        monitorId: callbackData.monitorId,
      });
      throw error;
    }
  }

  private validateApiKey(apiKey: string) {
    if (apiKey !== process.env.API_KEY) {
      throw new UnauthorizedException('Invalid API key');
    }
  }
}
