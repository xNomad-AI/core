import {
  CacheManager,
  Character,
  DbCacheAdapter,
  IDatabaseCacheAdapter,
} from '@everimbaq/core';

export function initializeDbCache(
  character: Character,
  db: IDatabaseCacheAdapter,
) {
  const cache = new CacheManager(new DbCacheAdapter(db, character.id));
  return cache;
}
