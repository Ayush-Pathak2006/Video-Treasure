import { QueryState } from "../models/queryState.model.js";

const LEGACY_INDEX = "query_1";

export const ensureQueryStateIndexes = async () => {
  // Listing the indexes of a collection that doesn't exist yet fails (NamespaceNotFound) on a brand-new database.
  await QueryState.createCollection();

  const collection = QueryState.collection;
  const indexes = await collection.indexes();
  const legacyQueryIndex = indexes.find(index => index.name === LEGACY_INDEX);

  if (legacyQueryIndex?.unique) {
    await collection.dropIndex(LEGACY_INDEX);
    console.log("🛠️ Dropped legacy unique index querystates.query_1");
  }

  await QueryState.syncIndexes();
  console.log("✅ QueryState indexes synced.");
};