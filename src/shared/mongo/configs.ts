export const DB_NAME = 'core';
export const AGENT_DB_NAME = 'agent';

export const COLLECTIONS = [
  {
    db: DB_NAME,
    name: 'collectionConfigs',
    indexes: [],
    uniqueIndexes: [{ id: 1 }],
  },
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
        'rarity.rank': -1,
      },
      {
        collectionId: 1,
        name: 1,
      },
      {
        agentId: 1,
      },
      {
        'agentAccount.solana': 1,
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
        contractAddress: 1,
        tokenId: 1,
        txHash: 1,
        from: 1,
      },
    ],
  },
  {
    db: DB_NAME,
    name: 'nftPrologues',
    indexes: [],
    uniqueIndexes: [
      {
        chain: 1,
        nftId: 1,
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
        address: 1,
        nonceType: 1,
      },
    ],
  },
  {
    db: DB_NAME,
    name: 'nftConfigs',
    indexes: [],
    uniqueIndexes: [
      {
        nftId: 1,
      },
    ],
  },
  {
    db: DB_NAME,
    name: 'nftPrimaryCoins',
    indexes: [],
    uniqueIndexes: [
      {
        nftId: 1,
      },
    ],
  },
  {
    db: AGENT_DB_NAME,
    name: 'copyTrades',
    indexes: [],
    uniqueIndexes: [
      {
        id: 1,
      },
      {
        walletAddress: 1,
        targetAddress: 1,
      },
    ],
  },
  {
    db: DB_NAME,
    name: 'orders',
    indexes: [
      { txHash: 1 },
      { nftId: 1 },
      { 'from': 1 },
      { 'to': 1 },
      { timestamp: -1 }
    ],
    uniqueIndexes: [
      { txHash: 1 }
    ],
  },
  {
    db: DB_NAME,
    name: 'swarms',
    indexes: [],
    uniqueIndexes: [],
  },
  {
    db: DB_NAME,
    name: 'AgentCreatedCoin',
    indexes: [],
    uniqueIndexes: [],
  },
  {
    db: DB_NAME,
    name: 'tokenAPIKey',
    indexes: [
      { expiresAt: 1 },
      { userId: 1 },
      { roomId: 1 },
      { agentId: 1 },
      { apiKey: 1 },
    ],
    uniqueIndexes: [
      { token: 1 },
      { apiKey: 1 }
    ],
  },
] as const;
