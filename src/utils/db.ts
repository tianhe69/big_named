/**
 * IndexedDB工具类 - 用于追踪字符使用次数
 */

const DB_NAME = 'namingApp';
const STORE_NAME = 'charUsage';
const DB_VERSION = 1;

export interface CharUsage {
  char: string;          // 字符
  position: 'first' | 'second';  // 位置（中间字或结尾字）
  count: number;         // 使用次数
  lastUsed: number;      // 最后使用时间戳
}

class NamingDB {
  private db: IDBDatabase | null = null;

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建对象存储，使用复合索引 [char, position]
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: ['char', 'position']
          });
          // 创建索引以便查询
          store.createIndex('char', 'char', { unique: false });
          store.createIndex('position', 'position', { unique: false });
          store.createIndex('count', 'count', { unique: false });
        }
      };
    });
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDB(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  /**
   * 获取字符的使用次数
   */
  async getCharCount(char: string, position: 'first' | 'second'): Promise<number> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get([char, position]);

      request.onsuccess = () => {
        const result = request.result as CharUsage | undefined;
        resolve(result?.count || 0);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 增加字符使用次数
   */
  async incrementCharCount(char: string, position: 'first' | 'second'): Promise<void> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const key = [char, position];

      // 先获取现有记录
      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        const existing = getRequest.result as CharUsage | undefined;

        if (existing) {
          // 更新现有记录
          existing.count += 1;
          existing.lastUsed = Date.now();
          store.put(existing);
        } else {
          // 创建新记录
          store.put({
            char,
            position,
            count: 1,
            lastUsed: Date.now()
          });
        }
      };

      getRequest.onerror = () => reject(getRequest.error);

      // 等待事务完成
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * 批量增加字符使用次数
   */
  async incrementMultipleChars(
    updates: Array<{ char: string; position: 'first' | 'second' }>
  ): Promise<void> {
    await this.ensureDB();

    // 串行执行每个更新，确保原子性
    for (const { char, position } of updates) {
      await this.incrementCharCount(char, position);
    }
  }

  /**
   * 检查字符是否可用（未达到最大使用次数）
   */
  async isCharAvailable(
    char: string,
    position: 'first' | 'second',
    maxReuse: number
  ): Promise<boolean> {
    const count = await this.getCharCount(char, position);
    return count < maxReuse;
  }

  /**
   * 重置所有计数（清空数据库）
   */
  async resetAllCounts(): Promise<void> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取所有字符的使用统计
   */
  async getAllStats(): Promise<CharUsage[]> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as CharUsage[]);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除特定字符的记录
   */
  async deleteCharRecord(char: string, position: 'first' | 'second'): Promise<void> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete([char, position]);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// 导出单例实例
export const namingDB = new NamingDB();

// 导出一个辅助函数用于重置并重新初始化
export const resetNamingDB = async (): Promise<void> => {
  await namingDB.resetAllCounts();
};

// 自动初始化数据库
namingDB.init().catch(console.error);
