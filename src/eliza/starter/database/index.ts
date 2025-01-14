import { SqliteDatabaseAdapter } from '@elizaos/adapter-sqlite';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function initializeDatabase(sqliteFile: string) {
    const dir = path.dirname(sqliteFile);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    try {
        const db = new SqliteDatabaseAdapter(new Database(sqliteFile));
        return db;
    } catch (error) {
        console.error('Failed to initialize SQLite database:', error);
        throw error;
    }
}
