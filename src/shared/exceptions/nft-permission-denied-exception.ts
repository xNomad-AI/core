import { HttpException, HttpStatus } from '@nestjs/common';

export class NftPermissionDeniedException extends HttpException {
  constructor(
    message = 'You do not have permission to perform this operation on the NFT.',
  ) {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export const NFT_PERMISSION_DENIED_EXCEPTION =
  new NftPermissionDeniedException();
