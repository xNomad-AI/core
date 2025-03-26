import CryptoJS from 'crypto-js';

class OpenoceanService {

  private readonly targetUrl = 'https://open-api.openocean.finance/v4';
  private readonly logger: Console;

  constructor(
    logger?: Console,
  ) {
    this.logger = logger || console;
  }

  private preParams(params: any) {
    const searchParams = new URLSearchParams(params).toString();
    return searchParams ? `?${searchParams}` : '';
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

  async getGasPrice(query: Record<string, any>) {
    const path = `/${query['chainId']}/gasPrice`;
    const url = `${this.targetUrl}${path}`;
    this.logger.log(`Request URL: ${url}`);
    return await this.request(url, 'GET', undefined, query);
  }

  async getCallData(query: Record<string, any>) {
    const path = `/${query['chainId']}/swap`;
    const url = `${this.targetUrl}${path}${this.preParams(query)}`;
    this.logger.log(`Request URL: ${url}`);
    return await this.request(url, 'GET', undefined, query);
  }
}

const openoceanService = new OpenoceanService();

export default openoceanService;