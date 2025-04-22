import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { MongoService } from '../mongo/mongo.service.js';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private mongoService: MongoService
  ) {}

  getAccessToken(payload: object): { accessToken: string } {
    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: '2d',
      }),
    };
  }

  private generateApiKey(): string {
    // Generate a short API key using Auth Token
    const random = randomBytes(11).toString('hex');
    const checksum = randomBytes(4).toString('hex');
    return `${random}-${checksum}`;
  }

  async createAndStoreAPIKey(userId: string, roomId: string, agentId: string): Promise<{ token: string, apiKey: string }> {
   
    const existingToken = await this.mongoService.authTokens.findOne({
      userId,
      roomId,
      agentId
    });

    if (existingToken && existingToken.expiresAt > new Date()) {
      return {
        token: existingToken.token,
        apiKey: existingToken.apiKey
      };
    }

    // // If token exists but is expired, delete it
    // if (existingToken) {
    //   await this.mongoService.authTokens.deleteOne({ token: existingToken.token });
    //   return {
    //     token: '',
    //     apiKey: ''
    //   }
    // }

    // Create a new token
    const payload = { userId, roomId, agentId };
    const { accessToken } = this.getAccessToken(payload);
    const apiKey = this.generateApiKey();
    
    // Calculate expiration date (use 2 days as above)
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(now.getDate() + 2);

    // Store in database
    await this.mongoService.authTokens.insertOne({
      token: accessToken,
      apiKey,
      userId,
      roomId,
      agentId,
      createdAt: new Date(),
      expiresAt
    });

    return {
      token: accessToken,
      apiKey
    };
  }

  // Validate API key
  async validateApiKey(apiKey: string): Promise<{ userId: string, roomId: string, agentId: string }> {
    // Find the token record by API key
    const tokenRecord = await this.mongoService.authTokens.findOne({ apiKey });
    
    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Check if token is expired
    if (tokenRecord.expiresAt < new Date()) {
      // Remove expired token
      await this.mongoService.authTokens.deleteOne({ apiKey });
      throw new UnauthorizedException('API key expired. Please recreate your auth token.');
    }

    return {
      userId: tokenRecord.userId,
      roomId: tokenRecord.roomId,
      agentId: tokenRecord.agentId
    };
  }
}
