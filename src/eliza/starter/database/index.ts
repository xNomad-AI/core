import { MongoDBDatabaseAdapter } from '@elizaos/adapter-mongodb';
import { MongoClient } from 'mongodb';


export function initializeDatabase(client: MongoClient, dbName: string) {
  try {
    const db = new MongoDBDatabaseAdapter(client, dbName);
    return db;
  } catch (error) {
    console.error('Failed to initialize MongoDBDatabaseAdapter:', error);
    throw error;
  }
}
