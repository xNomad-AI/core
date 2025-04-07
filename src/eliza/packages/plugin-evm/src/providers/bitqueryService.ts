export class BitqueryService {
    private readonly targetUrl = 'https://streaming.bitquery.io/graphql'
    private readonly logger: Console;

    constructor(
        logger?: Console,
    ) {
        this.logger = logger || console;
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

    async query(query: string, variables: string) {
        const body = {
            query,
            variables,
        };
        return await this.request(this.targetUrl, 'POST', {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BITQUERY_API_KEY!}`,
        }, body);
    }
}
const bitqueryService = new BitqueryService();

export default bitqueryService;
