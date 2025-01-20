export const DB_NAME = 'core';

export const COLLECTIONS = [
  {
    db: DB_NAME,
    name: 'collections',
    indexes: [],
    uniqueIndexes: [{ id: 1 }],
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
  {
    db: DB_NAME,
    name: 'nftOwners',
    indexes: [],
    uniqueIndexes: [
      {
        chain: 1,
        contractAddress: 1,
        tokenId: 1,
      },
    ],
  },
  {
    db: DB_NAME,
    name: 'nftActivities',
    indexes: [{ txHash: 1 }],
    uniqueIndexes: [
      {
        chain: 1,
        txHash: 1,
        contractAddress: 1,
        tokenId: 1,
      },
    ],
  },
  {
    db: DB_NAME,
    name: 'keyStore',
    indexes: [],
    uniqueIndexes: [
      {
        key: 1,
      },
    ],
  },
  {
    db: DB_NAME,
    name: 'addressNonces',
    indexes: [],
    uniqueIndexes: [
      {
        account: 1,
        type: 1,
      },
    ],
  },
] as const;
