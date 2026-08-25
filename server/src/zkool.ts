import { GraphQLClient, gql } from 'graphql-request';

// ── Interfaces ──────────────────────────────────────────

export interface ZkoolAccount {
  aindex: number;
  dindex: number;
  birth: number;
  height: number;
  name: string;
  balance: number;
  id: number;
}

export interface ZkoolAddress {
  ua: string;
  orchard: string;
  sapling: string;
  transparent: string;
}

export interface ZkoolBalance {
  transparent: number;
  sapling: number;
  orchard: number;
  total: number;
}

export interface ZkoolTransactionSummary {
  txid: string;
  value: number;
  fee: number;
  time: string;
  height: number;
}

export interface ZkoolNote {
  address: string;
  memo: string;
  value: number;
  pool: string;
}

export interface ZkoolTransactionInfo {
  height: number;
  txid: string;
  value: number;
  notes: ZkoolNote[];
  outputs: ZkoolNote[];
  spends: ZkoolNote[];
}

// ── Client (view-only: account import + transaction info) ──

export class ZkoolClient {
  private client: GraphQLClient;
  private _accountId: number = 1;
  private _syncLock: boolean = false;
  private _syncTask: ReturnType<typeof setInterval> | undefined;
  private syncIntervalMs: number = 60_000;
  private maxSyncRetries: number = 3;
  private syncRetryCount: number = 0;

  constructor(endpoint: string, options: Record<string, unknown> = {}) {
    this.client = new GraphQLClient(endpoint, options);
  }

  get accountId(): number {
    return this._accountId;
  }

  set accountId(value: number) {
    this._accountId = value;
  }

  private async request<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
    return this.client.request<T>(document, variables);
  }

  private logError(method: string, error: unknown): void {
    console.log(`[ZkoolClient.${method}]`, error);
  }

  private async safeCall<T>(method: string, fallback: T | (() => T), fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      return result ?? (typeof fallback === 'function' ? (fallback as () => T)() : fallback);
    } catch (error) {
      this.logError(method, error);
      return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
    }
  }

  // ── Init ──

  async init(shouldSpawnSyncTask: boolean = true): Promise<boolean> {
    return this.safeCall('init', false, async () => {
      const rep = await this.request<{ apiVersion: string }>(
        gql`query PingApiVersion { apiVersion }`
      );
      if (!rep?.apiVersion) return false;
      console.log('[Zkool] Client initialized.');
      if (shouldSpawnSyncTask) {
        this._syncTask = this.spawnSyncTask();
      }
      return true;
    });
  }

  // ── Account Import ──

  async createNewAccount(
    key: string,
    accountIndex: number,
    birth: number = 0,
    accountName: string,
    passphrase: string = ''
  ): Promise<{ createAccount: number | null }> {
    return this.safeCall('createNewAccount', { createAccount: null }, async () => {
      const result = await this.request<{ createAccount: number | null }>(
        gql`
          mutation CreateNewAccount($newAccount: NewAccount!) {
            createAccount(newAccount: $newAccount)
          }
        `,
        {
          newAccount: {
            key,
            aindex: accountIndex,
            birth,
            name: accountName,
            passphrase,
            useInternal: false,
          },
        }
      );
      return result ?? { createAccount: null };
    });
  }

  // ── Account Info ──

  async getAccounts(): Promise<ZkoolAccount[]> {
    return this.safeCall('getAccounts', [], async () => {
      const result = await this.request<{ accounts: ZkoolAccount[] }>(
        gql`
          query GetAccounts {
            accounts { aindex dindex birth height name balance id }
          }
        `
      );
      return result?.accounts ?? [];
    });
  }

  async getAccountById(accountId: number): Promise<ZkoolAccount> {
    const fallback: ZkoolAccount = { aindex: 0, dindex: 0, birth: 0, height: 0, name: '', balance: 0, id: accountId };
    return this.safeCall('getAccountById', fallback, async () => {
      const result = await this.request<{ accounts: ZkoolAccount[] }>(
        gql`
          query GetAccount($filter: AccountFilter!) {
            accounts(accountFilter: $filter) { aindex dindex birth height name balance id }
          }
        `,
        { filter: { id: accountId } }
      );
      return result?.accounts?.[0] ?? fallback;
    });
  }

  // ── Address ──

  async getAddress(): Promise<ZkoolAddress> {
    const fallback: ZkoolAddress = { ua: '', orchard: '', sapling: '', transparent: '' };
    return this.safeCall('getAddress', fallback, async () => {
      const result = await this.request<{ addressByAccount: ZkoolAddress }>(
        gql`
          query GetAddress($id: Int!) {
            addressByAccount(idAccount: $id) { ua orchard sapling transparent }
          }
        `,
        { id: this._accountId }
      );
      return result?.addressByAccount ?? fallback;
    });
  }

  // ── Balance ──

  async getTotalBalance(): Promise<ZkoolBalance> {
    const fallback: ZkoolBalance = { transparent: 0, sapling: 0, orchard: 0, total: 0 };
    return this.safeCall('getTotalBalance', fallback, async () => {
      const result = await this.request<{ balanceByAccount: ZkoolBalance }>(
        gql`
          query GetTotalBalance($id: Int!) {
            balanceByAccount(idAccount: $id) { transparent sapling orchard total }
          }
        `,
        { id: this._accountId }
      );
      return result?.balanceByAccount ?? fallback;
    });
  }

  // ── Transactions ──

  async getTransactions(): Promise<ZkoolTransactionSummary[]> {
    return this.safeCall('getTransactions', [], async () => {
      const result = await this.request<{ transactionsByAccount: ZkoolTransactionSummary[] }>(
        gql`
          query GetTransactions($id: Int!) {
            transactionsByAccount(idAccount: $id) { txid value fee time height }
          }
        `,
        { id: this._accountId }
      );
      return result?.transactionsByAccount ?? [];
    });
  }

  async getTransactionInfo(txid: string): Promise<ZkoolTransactionInfo> {
    const fallback: ZkoolTransactionInfo = { height: 0, txid, value: 0, notes: [], outputs: [], spends: [] };
    return this.safeCall('getTransactionInfo', fallback, async () => {
      const result = await this.request<{ transactionById: ZkoolTransactionInfo }>(
        gql`
          query GetTransactionInfo($id: Int!, $txid: String!) {
            transactionById(idAccount: $id, txid: $txid) {
              height txid value
              notes { address memo value pool }
              outputs { value memo address pool }
              spends { address diversifier memo pool value }
            }
          }
        `,
        { id: this._accountId, txid: String(txid) }
      );
      return result?.transactionById ?? fallback;
    });
  }

  async getLastTxId(): Promise<{ txid: string | null }> {
    return this.safeCall<{ txid: string | null }>('getLastTxId', { txid: null }, async () => {
      const result = await this.request<{ transactionsByAccount: { txid: string }[] }>(
        gql`
          query GetLastTxId($id: Int!) {
            transactionsByAccount(idAccount: $id) { txid }
          }
        `,
        { id: this._accountId }
      );
      return result?.transactionsByAccount?.[0] ?? { txid: null };
    });
  }

  // ── Heights ──

  async getServerHeight(): Promise<number> {
    return this.safeCall('getServerHeight', 0, async () => {
      const result = await this.request<{ currentHeight: number }>(
        gql`query GetServerHeight { currentHeight }`
      );
      return result?.currentHeight ?? 0;
    });
  }

  async getWalletHeight(): Promise<number> {
    return this.safeCall('getWalletHeight', 0, async () => {
      const result = await this.request<{ accounts: { height: number }[] }>(
        gql`
          query GetWalletHeight($filter: AccountFilter!) {
            accounts(accountFilter: $filter) { height }
          }
        `,
        { filter: { id: this._accountId } }
      );
      return result?.accounts?.[0]?.height ?? 0;
    });
  }

  // ── Sync ──

  async synchronize(fast?: boolean): Promise<{ synchronize: boolean }> {
    if (fast === undefined) {
      fast = process.env.ZKOOL_FAST_SYNC === 'true';
    }
    return this.safeCall('synchronize', { synchronize: false }, async () => {
      const result = await this.request<{ synchronize: boolean }>(
        gql`
          mutation SynchronizeAccount($ids: [Int!]!, $fast: Boolean!) {
            synchronize(idAccounts: $ids, fast: $fast)
          }
        `,
        { ids: this._accountId, fast: !!fast }
      );
      return result ?? { synchronize: false };
    });
  }

  spawnSyncTask(): ReturnType<typeof setInterval> {
    if (this._syncTask) clearInterval(this._syncTask);

    const timer = setInterval(async () => {
      if (this._syncLock) {
        console.log('[Zkool] Already syncing');
        return;
      }
      this._syncLock = true;
      try {
        const serverHeight = await this.getServerHeight();
        const accHeight = await this.getWalletHeight();
        console.log(`[Zkool] Chain tip: ${serverHeight} | Wallet: ${accHeight}`);

        if (serverHeight <= accHeight) {
          this.syncRetryCount = 0;
          return;
        }
        if (this.syncRetryCount >= this.maxSyncRetries) return;

        console.log(`[Zkool] ${serverHeight - accHeight} new blocks`);
        this.synchronize()
          .then(() => { this.syncRetryCount = 0; })
          .catch(() => { this.syncRetryCount++; });
      } catch {
        this.syncRetryCount++;
      } finally {
        this._syncLock = false;
      }
    }, this.syncIntervalMs);

    console.log('[Zkool] Sync task spawned.');
    return timer;
  }
}

export { gql };
