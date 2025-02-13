import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  getAccessToken(payload: object): { accessToken: string } {
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
