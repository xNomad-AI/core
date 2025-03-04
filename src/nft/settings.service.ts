import { Injectable } from '@nestjs/common';
import { TransientLoggerService } from '../shared/transient-logger.service.js';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { UpdateCoreSettingsDto } from './nft.dto.js';

@Injectable()
export class SettingsService {
  constructor(
    private readonly logger: TransientLoggerService,
    private readonly mongo: MongoService,
  ) {
    this.logger.setContext(SettingsService.name);
  }

  async upsertCoreSettings(
    proxies: UpdateCoreSettingsDto[],
  ) {
    const httpProxies: string[] = proxies.map((proxy) => {
      const username = proxy.username;
      const password = proxy.password;
      return `http://${username}:${password}@${proxy.entryPoint}:${proxy.port}`;
    });
    const existingProxies = await this.mongo.coreSettings.find({
      "value.httpProxy": { $in: httpProxies }
    }).toArray();
    const existingHttpProxies = existingProxies.map((proxy) => proxy.value.httpProxy);

    const insertedDocs: any[] = [];
    for (const proxy of proxies) {
      const username = proxy.username;
      const password = proxy.password;
      const httpProxy = `http://${username}:${password}@${proxy.entryPoint}:${proxy.port}`;

      if (!existingHttpProxies.includes(httpProxy)) {
        insertedDocs.push({
          category: "httpProxy",
          value: {
            product: "datacenterProxies",
            username,
            password,
            // example.com
            entryPoint: proxy.entryPoint,
            // 8001
            port: proxy.port.toString(),
            country: proxy.countryCode,
            assignedIP: proxy.ip,
            httpProxy: `http://${username}:${password}@${proxy.entryPoint}:${proxy.port}`,
            // how many agent using this proxy
            count: 0
          }
        });
      }
    }

    await this.mongo.coreSettings.insertMany(insertedDocs);

    return insertedDocs.length;
  }
}
