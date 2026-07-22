import { useState, useCallback } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

const JSDELIVR_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm',
    mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js',
  },
  eh: {
    mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm',
    mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js',
  },
};

let dbInstancePromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function initDuckDB(): Promise<duckdb.AsyncDuckDB> {
  const logger = new duckdb.ConsoleLogger();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  
  // Create a blob worker if needed or directly pass CDN URL
  const response = await fetch(bundle.mainWorker!);
  const blob = new Blob([await response.text()], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);
  
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export function getOrInitDB(): Promise<duckdb.AsyncDuckDB> {
  if (!dbInstancePromise) {
    dbInstancePromise = initDuckDB();
  }
  return dbInstancePromise;
}

function cleanValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') return Number(val);
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') {
    if (typeof val.toJSON === 'function') return val.toJSON();
    if (typeof val.toString === 'function') {
      const s = val.toString();
      if (s === '[object Object]') return val;
      return s;
    }
  }
  return val;
}

export function useDuckDB() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(async (file: File): Promise<{ headers: string[]; n_rows: number }> => {
    setIsLoading(true);
    setError(null);
    try {
      const dbInstance = await getOrInitDB();
      const conn = await dbInstance.connect();

      // Read file buffer and register in DuckDB VFS
      const buffer = await file.arrayBuffer();
      await dbInstance.registerFileBuffer(file.name, new Uint8Array(buffer));

      // Drop existing table if any
      await conn.query(`DROP TABLE IF EXISTS uploaded_data`);

      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'parquet') {
        await conn.query(`CREATE TABLE uploaded_data AS SELECT * FROM read_parquet('${file.name}')`);
      } else if (ext === 'tsv') {
        await conn.query(`CREATE TABLE uploaded_data AS SELECT * FROM read_csv_auto('${file.name}', delim='\\t')`);
      } else {
        await conn.query(`CREATE TABLE uploaded_data AS SELECT * FROM read_csv_auto('${file.name}')`);
      }

      // Get count
      const countResult = await conn.query(`SELECT COUNT(*)::BIGINT as count FROM uploaded_data`);
      const n_rows = Number(countResult.toArray()[0]?.count ?? 0);

      // Get headers
      const sampleResult = await conn.query(`SELECT * FROM uploaded_data LIMIT 1`);
      const headers = sampleResult.schema.fields.map((f: any) => f.name);

      await conn.close();
      return { headers, n_rows };
    } catch (err: any) {
      console.error('DuckDB loadFile Error:', err);
      const msg = err.message || String(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const query = useCallback(async (sql: string): Promise<{ headers: string[]; rows: any[][] }> => {
    setIsLoading(true);
    setError(null);
    try {
      const dbInstance = await getOrInitDB();
      const conn = await dbInstance.connect();
      const result = await conn.query(sql);
      const headers = result.schema.fields.map((f: any) => f.name);
      const rows = result.toArray().map((row: any) => {
        return headers.map((h: string) => cleanValue(row[h]));
      });
      await conn.close();
      return { headers, rows };
    } catch (err: any) {
      console.error('DuckDB Query Error:', err);
      const msg = err.message || String(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getColumns = useCallback(async (tableName: string): Promise<string[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const dbInstance = await getOrInitDB();
      const conn = await dbInstance.connect();
      const result = await conn.query(`SELECT * FROM ${tableName} LIMIT 1`);
      const headers = result.schema.fields.map((f: any) => f.name);
      await conn.close();
      return headers;
    } catch (err: any) {
      console.error('DuckDB getColumns Error:', err);
      const msg = err.message || String(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSample = useCallback(async (tableName: string, n: number): Promise<any[][]> => {
    setIsLoading(true);
    setError(null);
    try {
      const dbInstance = await getOrInitDB();
      const conn = await dbInstance.connect();
      const result = await conn.query(`SELECT * FROM ${tableName} LIMIT ${n}`);
      const headers = result.schema.fields.map((f: any) => f.name);
      const rows = result.toArray().map((row: any) => {
        return headers.map((h: string) => cleanValue(row[h]));
      });
      await conn.close();
      return rows;
    } catch (err: any) {
      console.error('DuckDB getSample Error:', err);
      const msg = err.message || String(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    loadFile,
    query,
    getColumns,
    getSample,
    isLoading,
    error,
  };
}
