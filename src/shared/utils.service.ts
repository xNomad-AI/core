import { Injectable } from '@nestjs/common';
import fs from 'fs';
import dotenv from 'dotenv';

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
    const envFileContent = fs.readFileSync(filepath, 'utf8'); // 读取文件内容
    return dotenv.parse(envFileContent);
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
  errorInterval?: number,
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
          `[${taskName}] Task failed at ${new Date().toISOString()}: ${error}`,
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
