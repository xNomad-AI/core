import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'fs';

export class AmazonS3 {
  client: S3Client;

  constructor(
    private readonly bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
  ) {
    this.client = new S3Client({
      credentials: { accessKeyId, secretAccessKey },
      region,
    });
  }

  // Upload files to s3
  async addFileToS3(
    localFilename: string,
    s3FileName: string,
    checkFile: boolean,
    mime?: string,
  ) {
    if (checkFile) {
      try {
        const exists = await this.exist(s3FileName);
        if (exists) return true;
      } catch (error) {
        console.log(`failed to check file exist on s3: ${error.message}`);
      }
    }

    const body = createReadStream(localFilename);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3FileName,
      Body: body,
      ContentType: mime,
    });

    const resp = await this.client.send(command);

    body.close();
    if (resp.$metadata.httpStatusCode === 200) {
      return true;
    }

    throw new Error(`failed to upload file to s3: ${resp.$metadata}`);
  }

  async addFileFromBuffer(buffer: Buffer, s3FileName: string, mime?: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3FileName,
      Body: buffer,
      ContentType: mime,
    });

    const resp = await this.client.send(command);

    if (resp.$metadata.httpStatusCode === 200) {
      return true;
    }

    throw new Error(`failed to upload file to s3: ${resp.$metadata}`);
  }

  async createPresignedUrl(filename: string, expiresInSeconds: number) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filename,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
    return url;
  }

  // remove file from s3
  async removeFileFromS3(filename: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: filename,
    });

    const resp = await this.client.send(command);

    if (resp.$metadata.httpStatusCode === 204) {
      return true;
    }

    throw new Error(`failed to remove file from s3: ${resp.$metadata}`);
  }

  async getFile(filename: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: filename,
    });

    const resp = await this.client.send(command);
    return {
      body: await resp.Body.transformToByteArray(),
      metadata: resp.Metadata,
    };
  }

  async exist(filename: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: filename,
      });
      const resp = await this.client.send(command);
      return resp.$metadata.httpStatusCode === 200;
    } catch (e) {
      if ([404, 403].includes(e.$metadata?.httpStatusCode)) {
        return false;
      }
      throw new Error();
    }
  }

  async listFiles(prefix: string) {
    const command = new ListObjectsCommand({
      Bucket: this.bucket,
      Prefix: prefix,
    });
    const resp = await this.client.send(command);
    return resp.Contents;
  }
}
