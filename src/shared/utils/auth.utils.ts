import { Request } from 'express';

/**
 * Extract token from Authorization header
 * @param request The HTTP request
 * @returns The token if present and correctly formatted
 */
export function extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request['headers'].authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
}


/**
 * Check if a token appears to be a JWT (contains two dots)
 * @param token The token to check
 * @returns True if the token appears to be a JWT
 */
export function isJwtToken(token: string): boolean {
  return token.split('.').length === 3;
} 