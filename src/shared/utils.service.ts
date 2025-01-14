import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';

@Injectable()
export class UtilsService {
  static IsFulfilled<T>(
    input: PromiseSettledResult<T>,
  ): input is PromiseFulfilledResult<T> {
    return input.status === 'fulfilled';
  }

  static IsRejected<T>(
    input: PromiseSettledResult<T>,
  ): input is PromiseRejectedResult {
    return input.status === 'rejected';
  }

  static getEnvFromFile(filepath: string): Record<string, string>{
    const envFileContent = readFileSync(filepath, 'utf-8');
    const envVars = envFileContent
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      .map((line) => {
        const [key, value] = line.split('=');
        if (key && value) {
          return [key.trim(), value.trim()] as [string, string];
        }
        return null;
      })
      .filter((item): item is [string, string] => item !== null);
    return Object.fromEntries(envVars);
  }

}
