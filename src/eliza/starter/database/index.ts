import { MongoDBDatabaseAdapter } from '@elizaos/adapter-mongodb';
import { MongoClient } from 'mongodb';


let db: MongoDBDatabaseAdapter | undefined;

export async function initializeDatabase(client: MongoClient, dbName: string): Promise<MongoDBDatabaseAdapter> {
  if (!db) {
    try {
      let newDB = new MongoDBDatabaseAdapter(client, dbName);
      await newDB.init();
      db = newDB;
    } catch (error) {
      console.error("Failed to initialize MongoDBDatabaseAdapter:", error);
      throw error;
    }
  }
  return db;
}
