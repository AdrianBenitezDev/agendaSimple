const databaseName = "rockeala-public-cache";
const storeName = "entries";
const cacheKey = "public-catalog";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "key" });
      }
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

export async function readCatalogCache() {
  if (!("indexedDB" in window)) {
    return null;
  }

  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(cacheKey);

    request.addEventListener("success", () => resolve(request.result || null));
    request.addEventListener("error", () => reject(request.error));
  });
}

export async function writeCatalogCache(services, syncedAt) {
  if (!("indexedDB" in window)) {
    return;
  }

  const database = await openDatabase();

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    store.put({
      key: cacheKey,
      services,
      syncedAt
    });

    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}
