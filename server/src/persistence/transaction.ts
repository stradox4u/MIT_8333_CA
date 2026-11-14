declare const scope: unique symbol;

/** An opaque scope shared by repositories participating in one atomic change. */
export interface RepositoryTransaction {
  readonly [scope]: true;
}
