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
          { twitterHandle: { $regex: `^${search}`, $options: 'i' } },
          { userName: { $regex: `^${search}`, $options: 'i' } },
          { name: { $regex: `^${search}`, $options: 'i' } },
        ]
      };
    }

    // Add filter to only show KOLs with PnL data
    const queryWithPnl = {
      ...query,
      pnl30d: { $exists: true },
      pnl30dAmount: { $exists: true }
    };

    const [items, total] = await Promise.all([
      this.mongoService.twitterKols
        .find(queryWithPnl)
        .sort({ 
          pnl30d: -1,  // Primary sort by percentage
          pnl30dAmount: -1  // Secondary sort by amount
        })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.mongoService.twitterKols.countDocuments(queryWithPnl),
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