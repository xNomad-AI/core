import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransientLoggerService } from './transient-logger.service.js';

export class PhalaPod {
  name: string;
  endpoint: string;
  id: number;
  kms_url: string;
  tproxy_url: string;
  tproxy_version: string;
  tproxy_base_domain: string;
  tproxy_port: number;
  tproxy_tappd_port: number;
  teepod_version: string;
  max_cvm_number: number;
  max_allocable_vcpu: number;
  max_allocable_memory_in_mb: number;
  max_disk_size_in_gb: number;
  status: string;
  enabled: boolean;
  created_at: string;
}

@Injectable()
export class PhalaService {
  private endpoint: string;
  private accessToken: string;
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly appConfig: ConfigService,
  ) {
    this.endpoint = this.appConfig.get<string>('PHALA_ENDPOINT')!;
    this.accessToken = this.appConfig.get<string>('PHALA_ACCESS_TOKEN')!;
  }
}
