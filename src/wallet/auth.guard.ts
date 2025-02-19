import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const token = request.headers['x-secret-token'];
    if (
      !token ||
      token !== this.configService.get('WALLET_SERVICE_SECRET_TOKEN')
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
