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

  static getEnvFromFile(filepath: string): Record<string, string> {
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


type TaskFunction = () => Promise<void>;

export function startIntervalTask(
  taskName: string,
  task: TaskFunction,
  interval: number,
  errorInterval?: number
): { stop: () => void } {
  errorInterval ??= interval;

  let isRunning = true;

  const runTask = async () => {
    while (isRunning) {
      try {
        // console.log(`[${taskName}] Task started at ${new Date().toISOString()}`);
        await task();
        // console.log(`[${taskName}] Task completed successfully.`);
        await sleep(interval);
      } catch (error) {
        console.error(
          `[${taskName}] Task failed at ${new Date().toISOString()}: ${error}`
        );
        await sleep(errorInterval);
      }
    }
    console.log(`[${taskName}] Task has been stopped.`);
  };
  runTask();
  return {
    stop: () => {
      console.log(`[${taskName}] Stop signal received.`);
      isRunning = false;
    },
  };
}