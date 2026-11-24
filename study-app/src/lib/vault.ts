// The encrypted vault: all reads/writes of your data go through here.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  createDataKey,
  fromB64,
  openBytes,
  openJson,
  sealBytes,
  sealJson,
  toB64,
  unwrapDataKey,
  wrapDataKey,
  type WrappedKey,
} from "./crypto";
import { closeDb, dbClear, dbDelete, dbGet, dbGetAll, dbPut, dbPutMany, type EncRow } from "./db";
import { COLLECTIONS, type CollectionName, type Collections } from "./types";

const VAULT_ID = "vault";
const BACKUP_FORMAT = "study-vault-backup";

interface VaultMeta {
  id: typeof VAULT_ID;
  version: 1;
  key: WrappedKey;
  createdAt: number;
}

let dataKey: CryptoKey | null = null;

export function isUnlocked() {
  return dataKey !== null;
}

function requireKey(): CryptoKey {
  if (!dataKey) throw new Error("Vault is locked");
  return dataKey;
}

export async function hasVault(): Promise<boolean> {
  return !!(await dbGet<VaultMeta>("meta", VAULT_ID));
}

export async function createVault(password: string): Promise<void> {
  if (await hasVault()) throw new Error("A vault already exists on this device.");
  const { key, wrapped } = await createDataKey(password);
  const meta: VaultMeta = { id: VAULT_ID, version: 1, key: wrapped, createdAt: Date.now() };
  await dbPut("meta", meta);
  dataKey = key;
}

/** Returns false if the password is wrong. */
export async function unlockVault(password: string): Promise<boolean> {
  const meta = await dbGet<VaultMeta>("meta", VAULT_ID);
  if (!meta) throw new Error("No vault on this device yet.");
  try {
    dataKey = await unwrapDataKey(meta.key, password);
    return true;
  } catch {
    return false;
  }
}

export function lockVault() {
  dataKey = null;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  const meta = await dbGet<VaultMeta>("meta", VAULT_ID);
  if (!meta) return false;
  let extractable: CryptoKey;
  try {
    extractable = await unwrapDataKey(meta.key, oldPassword, true);
  } catch {
    return false;
  }
  meta.key = await wrapDataKey(extractable, newPassword);
  await dbPut("meta", meta);
  return true;
}

// ---------- records ----------

const rowKey = (type: string, id: string) => `${type}:${id}`;

export async function loadAllRecords(): Promise<{ [K in CollectionName]: Collections[K][] }> {
  const key = requireKey();
  const rows = await dbGetAll<EncRow>("records");
  const out = Object.fromEntries(COLLECTIONS.map((c) => [c, [] as unknown[]])) as {
    [K in CollectionName]: Collections[K][];
  };
  await Promise.all(
    rows.map(async (row) => {
      const type = row.type as CollectionName;
      if (!out[type]) return;
      try {
        const value = await openJson<never>(key, { iv: row.iv, data: row.data });
        (out[type] as unknown[]).push(value);
      } catch (e) {
        console.warn("Could not decrypt record", row.key, e);
      }
    }),
  );
  return out;
}

export async function saveRecord<K extends CollectionName>(type: K, value: Collections[K]): Promise<void> {
  const key = requireKey();
  const sealed = await sealJson(key, value);
  const row: EncRow = { key: rowKey(type, value.id), type, iv: sealed.iv, data: sealed.data };
  await dbPut("records", row);
}

export async function saveRecords<K extends CollectionName>(type: K, values: Collections[K][]): Promise<void> {
  const key = requireKey();
  const rows = await Promise.all(
    values.map(async (v) => {
      const s = await sealJson(key, v);
      return { key: rowKey(type, v.id), type, iv: s.iv, data: s.data } satisfies EncRow;
    }),
  );
  await dbPutMany("records", rows);
}

export async function deleteRecord(type: CollectionName, id: string): Promise<void> {
  await dbDelete("records", rowKey(type, id));
}

// ---------- files ----------

export async function saveBlob(id: string, data: ArrayBuffer): Promise<void> {
  const sealed = await sealBytes(requireKey(), data);
  const row: EncRow = { key: id, iv: sealed.iv, data: sealed.data };
  await dbPut("blobs", row);
}

export async function loadBlob(id: string): Promise<ArrayBuffer | null> {
  const row = await dbGet<EncRow>("blobs", id);
  if (!row) return null;
  return openBytes(requireKey(), { iv: row.iv, data: row.data });
}

export async function deleteBlob(id: string): Promise<void> {
  await dbDelete("blobs", id);
}

// ---------- backup / restore ----------

/**
 * Exports the whole vault as one file. The file stays encrypted with your
 * password, so it is safe to keep on a USB stick or cloud drive.
 */
export async function exportBackup(): Promise<Blob> {
  requireKey();
  const meta = await dbGet<VaultMeta>("meta", VAULT_ID);
  const records = await dbGetAll<EncRow>("records");
  const blobs = await dbGetAll<EncRow>("blobs");
  const files: Record<string, Uint8Array> = {};
  files["manifest.json"] = strToU8(
    JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: Date.now(), meta }),
  );
  files["records.json"] = strToU8(
    JSON.stringify(records.map((r) => ({ key: r.key, type: r.type, iv: toB64(r.iv), data: toB64(r.data) }))),
  );
  const blobIndex: { key: string; iv: string }[] = [];
  blobs.forEach((b, i) => {
    blobIndex.push({ key: b.key, iv: toB64(b.iv) });
    files[`blobs/${i}.bin`] = new Uint8Array(b.data);
  });
  files["blobs.json"] = strToU8(JSON.stringify(blobIndex));
  // Data is already encrypted (= incompressible), so store without compression.
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped], { type: "application/octet-stream" });
}

/** Replaces everything on this device with the backup. You then unlock with the backup's password. */
export async function importBackup(file: ArrayBuffer): Promise<void> {
  const unz = unzipSync(new Uint8Array(file));
  const manifestRaw = unz["manifest.json"];
  if (!manifestRaw) throw new Error("This is not a Study Vault backup file.");
  const manifest = JSON.parse(strFromU8(manifestRaw));
  if (manifest.format !== BACKUP_FORMAT || !manifest.meta) throw new Error("This is not a Study Vault backup file.");
  const records = JSON.parse(strFromU8(unz["records.json"])) as { key: string; type: string; iv: string; data: string }[];
  const blobIndex = JSON.parse(strFromU8(unz["blobs.json"])) as { key: string; iv: string }[];

  await dbClear();
  await dbPut("meta", manifest.meta);
  await dbPutMany(
    "records",
    records.map((r) => ({ key: r.key, type: r.type, iv: fromB64(r.iv), data: fromB64(r.data).buffer })),
  );
  for (let i = 0; i < blobIndex.length; i++) {
    const bytes = unz[`blobs/${i}.bin`];
    if (!bytes) continue;
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    await dbPut("blobs", { key: blobIndex[i].key, iv: fromB64(blobIndex[i].iv), data: copy.buffer });
  }
  lockVault();
}

/** Deletes the vault and every file from this device. Irreversible. */
export async function wipeVault(): Promise<void> {
  await dbClear();
  lockVault();
  closeDb();
}
