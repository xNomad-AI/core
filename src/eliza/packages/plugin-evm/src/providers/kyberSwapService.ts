import CryptoJS from 'crypto-js';

class KyberSwapService {

  private readonly targetUrl = 'https://aggregator-api.kyberswap.com';
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

  async getRoutes(query: Record<string, any>) {
    const path = `/${query['chain']}/api/v1/routes`;
    const url = `${this.targetUrl}${path}${this.preParams(query)}`;
    this.logger.log(`Request URL: ${url}`);
    return await this.request(url, 'GET', undefined, query);
  }

  async getCallData(query: Record<string, any>) {
    const path = `/${query['chain']}/route/encode`;
    const url = `${this.targetUrl}${path}${this.preParams(query)}`;
    this.logger.log(`Request URL: ${url}`);
    return await this.request(url, 'GET', undefined, query);
  }
}

const kyberSwapService = new KyberSwapService();

export default kyberSwapService;