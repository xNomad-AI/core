import { Injectable } from '@nestjs/common';

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
}
