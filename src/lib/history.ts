export type HistoryRecord = {
  id: string;
  createdAt: number;
  person: Blob;
  garment: Blob;
  result: Blob;
};

const DB_NAME = "vton-history";
const STORE = "runs";
const PENDING = "pending";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PENDING)) {
        db.createObjectStore(PENDING);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveHistory(record: HistoryRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listHistory(): Promise<HistoryRecord[]> {
  const db = await openDb();
  const rows = await new Promise<HistoryRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as HistoryRecord[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export type PendingJob = {
  jobId: string;
  createdAt: number;
  person: Blob;
  garment: Blob;
};

export async function savePending(record: PendingJob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PENDING, "readwrite");
    tx.objectStore(PENDING).put(record, "current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readPending(): Promise<PendingJob | null> {
  const db = await openDb();
  const row = await new Promise<PendingJob | undefined>((resolve, reject) => {
    const tx = db.transaction(PENDING, "readonly");
    const request = tx.objectStore(PENDING).get("current");
    request.onsuccess = () => resolve(request.result as PendingJob | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return row ?? null;
}

export async function clearPending(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PENDING, "readwrite");
    tx.objectStore(PENDING).delete("current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
