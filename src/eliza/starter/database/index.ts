import { SqliteDatabaseAdapter } from '@elizaos/adapter-sqlite';
import Database from 'better-sqlite3';

export function initializeDatabase(sqliteFile: string) {
    const db = new SqliteDatabaseAdapter(new Database(sqliteFile));
    return db;
}
