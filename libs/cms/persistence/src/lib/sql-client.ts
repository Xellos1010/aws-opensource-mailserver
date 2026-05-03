export interface SqlQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

export interface SqlQueryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
}

export interface SqlClient extends SqlQueryable {
  release(): void;
}

export interface SqlPool extends SqlQueryable {
  connect(): Promise<SqlClient>;
  end?: () => Promise<void>;
}
