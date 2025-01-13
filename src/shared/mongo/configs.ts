export const DB_NAME = 'core';

export const COLLECTIONS = [
  {
    db: DB_NAME,
    name: 'collections',
    indexes: [],
    uniqueIndexes: [{ collectionId: 1 }],
  },
  {
    db: DB_NAME,
    name: 'nfts',
    indexes: [
      {
        collectionId: 1,
        'rarity.score': -1,
      },
      {
        collectionId: 1,
        name: 1,
      },
    ],
    uniqueIndexes: [
      {
        nftId: 1,
      },
      {
        chain: 1,
        contractAddress: 1,
        tokenId: 1,
      },
    ],
  },
] as const;
