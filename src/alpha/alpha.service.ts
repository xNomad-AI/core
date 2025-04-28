import { Injectable } from '@nestjs/common';
import { MongoService } from '../shared/mongo/mongo.service.js';
import { TransientLoggerService } from '../shared/transient-logger.service.js';

@Injectable()
export class AlphaService {
  constructor(
    private readonly mongoService: MongoService,
    private readonly logger: TransientLoggerService,
  ) {
    this.logger.setContext(AlphaService.name);
  }

  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    let query = {};

    if (search) {
      query = {
        $or: [
          { twitterHandle: { $regex: search, $options: 'i' } },
          { userName: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.mongoService.twitterKols
        .find(query)
        .sort({ pnl_30d: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.mongoService.twitterKols.countDocuments(query),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByHandle(handle: string) {
    const cleanHandle = handle.startsWith('@') ? handle.substring(1) : handle;
    return this.mongoService.twitterKols.findOne({ 
      $or: [
        { twitterHandle: cleanHandle },
        { userName: cleanHandle },
      ] 
    });
  }
}