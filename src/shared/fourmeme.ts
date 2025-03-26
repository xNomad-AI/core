import axios from 'axios';
import { ethers } from 'ethers';

export class FourMemeApi {
  constructor() {}

  async login(wallet: ethers.Wallet): Promise<string> {
    const nonceResponse = await axios.post(
      'https://four.meme/meme-api/v1/private/user/nonce/generate',
      {
        accountAddress: wallet.address,
        verifyType: 'LOGIN',
        networkCode: 'BSC',
      },
    );

    if (nonceResponse.data.code !== 0) {
      throw new Error(`获取nonce失败: ${nonceResponse.data.msg}`);
    }

    const nonce = nonceResponse.data.data;
    const message = `You are sign in Meme ${nonce}`;

    const signature = await wallet.signMessage(message);

    const loginResponse = await axios.post(
      'https://four.meme/meme-api/v1/private/user/login/dex',
      {
        region: 'WEB',
        langType: 'EN',
        loginIp: '',
        inviteCode: '',
        verifyInfo: {
          address: wallet.address,
          networkCode: 'BSC',
          signature,
          verifyType: 'LOGIN',
        },
        walletName: 'OKX Wallet',
      },
    );

    if (loginResponse.data.code !== 0) {
      throw new Error(`failed to login: ${loginResponse.data.msg}`);
    }

    return loginResponse.data.data;
  }

  async uploadImage(userToken: string, image: Buffer) {
    const formData = new FormData();
    formData.append('file', new Blob([image]), 'image.png');

    const response = await axios.post(
      'https://four.meme/meme-api/v1/private/token/upload',
      formData,
      {
        headers: {
          Cookie: `user_token=${userToken}`,
          'meme-web-access': userToken,
          'Content-Type': 'multipart/form-data',
        },
      },
    );

    if (response.data.code !== 0) {
      throw new Error(`failed to upload image: ${response.data.msg}`);
    }

    return response.data.data;
  }

  /**
   * twitter, telegram, website must start with "https://"
   */
  async createToken(
    userToken: string,
    params: {
      name: string;
      symbol: string;
      description: string;
      image: string;
      initialBuyAmount: number;
      twitter?: string;
      telegram?: string;
      website?: string;
    },
  ) {
    try {
      const response = await axios.post(
        'https://four.meme/meme-api/v1/private/token/create',
        {
          name: params.name,
          shortName: params.symbol,
          desc: params.description,
          webUrl: params.website,
          twitterUrl: params.twitter,
          telegramUrl: params.telegram,
          totalSupply: 1000000000,
          raisedAmount: 24,
          saleRate: 0.8,
          reserveRate: 0,
          imgUrl: params.image,
          raisedToken: {
            symbol: 'BNB',
            nativeSymbol: 'BNB',
            symbolAddress: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
            deployCost: '0',
            buyFee: '0.01',
            sellFee: '0.01',
            minTradeFee: '0',
            b0Amount: '8',
            totalBAmount: '24',
            totalAmount: '1000000000',
            logoUrl:
              'https://static.four.meme/market/68b871b6-96f7-408c-b8d0-388d804b34275092658264263839640.png',
            tradeLevel: ['0.1', '0.5', '1'],
            status: 'PUBLISH',
            buyTokenLink: 'https://pancakeswap.finance/swap',
            reservedNumber: 10,
            saleRate: '0.8',
            networkCode: 'BSC',
            platform: 'MEME',
          },
          launchTime: Date.now(),
          funGroup: false,
          preSale:
            params.initialBuyAmount === 0
              ? '0'
              : params.initialBuyAmount.toString(),
          clickFun: false,
          symbol: 'BNB',
          label: 'AI',
          lpTradingFee: 0.0025,
        },
        {
          headers: {
            Cookie: `user_token=${userToken}`,
            'meme-web-access': userToken,
            referer: 'https://four.meme/create-token',
          },
        },
      );

      if (response.data.code !== 0) {
        throw new Error(
          `failed to create token on four.meme: ${response.data.msg}`,
        );
      }

      return response.data.data;
    } catch (e) {
      throw new Error(
        `failed to create token on four.meme, error: ${e.message}${
          e.response?.data ? `, response: ${e.response.data}` : ''
        }`,
      );
    }
  }
}
