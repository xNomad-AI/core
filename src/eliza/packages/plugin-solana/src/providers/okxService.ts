import CryptoJS from 'crypto-js';

interface Config {
  OK_ACCESS_KEY: string;
  OK_ACCESS_SECRET: string;
  OK_ACCESS_PASSPHRASE: string;
  OK_ACCESS_PROJECT: string;
}

class OkxService {
  private readonly targetUrl = 'https://www.okx.com';
  private readonly logger: Console;

  constructor(
    private readonly config: Config,
    logger?: Console,
  ) {
    this.logger = logger || console;
  }

  private preParams(params: any) {
    const searchParams = new URLSearchParams(params).toString();
    return searchParams ? `?${searchParams}` : '';
  }

  private preHash(
    timestamp: string,
    method: string,
    requestPath: string,
    params?: any,
  ): string {
    let queryString = '';
    if (method === 'GET' && params) {
      queryString = this.preParams(params);
    } else if (method === 'POST' && params) {
      queryString = JSON.stringify(params);
    }

    const message = `${timestamp}${method}${requestPath}${queryString}`;
    this.logger.log(`Pre-hash message: ${message}`);
    return message;
  }

  private sign(message: string, secretKey: string): string {
    return CryptoJS.enc.Base64.stringify(
      CryptoJS.HmacSHA256(message, secretKey),
    );
  }

  private createSignature(method: string, requestPath: string, params?: any) {
    const timestamp = new Date().toISOString();
    const message = this.preHash(timestamp, method, requestPath, params);
    const signature = this.sign(message, this.config.OK_ACCESS_SECRET);

    return { signature, timestamp };
  }

  private async request(url: string, method: string, headers: any, body?: any) {
    const options: RequestInit = {
      method,
      headers,
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    };

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorData.message}`,
        );
      }
      return await response.json();
    } catch (error) {
      this.logger.error(`Error in request: ${error.message}`);
      throw error;
    }
  }

  async getCallData(query: Record<string, any>) {
    const path = '/api/v5/dex/aggregator/swap';
    const { signature, timestamp } = this.createSignature('GET', path, query);

    const headers = {
      'OK-ACCESS-KEY': this.config.OK_ACCESS_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.OK_ACCESS_PASSPHRASE,
    };

    const url = `${this.targetUrl}${path}${this.preParams(query)}`;
    this.logger.log(`Request URL: ${url}`);
    this.logger.log(`Headers: ${JSON.stringify(headers)}`);

    return await this.request(url, 'GET', headers, query);
  }
}

const config: Config = {
  OK_ACCESS_KEY: process.env.OK_ACCESS_KEY!,
  OK_ACCESS_SECRET: process.env.OK_ACCESS_SECRET!,
  OK_ACCESS_PASSPHRASE: process.env.OK_ACCESS_PASSPHRASE!,
  OK_ACCESS_PROJECT: process.env.OK_ACCESS_PROJECT!,
};

const okxService = new OkxService(config);

export default okxService;
