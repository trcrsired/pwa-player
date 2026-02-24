class SimpleKVStore {
  constructor(dbName = "KVStore", storeName = "kv", version = 1) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  async set(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async get(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readonly");
      const request = tx.objectStore(this.storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async delete(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async keys() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }
};

let kv_async = new SimpleKVStore("pwaplayerdb", "videos")
let kv_sync;

async function kv_get(key)
{
  if (!kv_sync)
  {
    kv_sync = await kv_async.init();
  }
  return await kv_sync.get(key);
}

async function kv_set(key, value)
{
  if (!kv_sync)
  {
    kv_sync = await kv_async.init();
  }
  return await kv_sync.set(key, value);
}

async function kv_delete(key)
{
  if (!kv_sync)
  {
    kv_sync = await kv_async.init();
  }
  return await kv_sync.delete(key);
}
