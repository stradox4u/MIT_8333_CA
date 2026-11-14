import type { Database } from './database.js';
import type { RepositoryTransaction } from '../persistence/transaction.js';

const connections = new WeakMap<RepositoryTransaction, Database>();

/** Keeps the connection private and expires the scope before leaving its transaction. */
export function repositoryTransaction<T>(
  db: Database,
  work: (db: Database, scope: RepositoryTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const scope = Object.freeze({}) as RepositoryTransaction;
    connections.set(scope, tx);
    try {
      return await work(tx, scope);
    } finally {
      connections.delete(scope);
    }
  });
}

export function transactionConnection(scope: RepositoryTransaction): Database {
  const connection = connections.get(scope);
  if (!connection)
    throw new Error('Repository transaction is no longer active');
  return connection;
}
