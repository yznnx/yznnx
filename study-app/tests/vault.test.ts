import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { changePassword, createVault, deleteRecord, exportBackup, importBackup, loadAllRecords, loadBlob, lockVault, saveBlob, saveRecord, unlockVault, wipeVault } from "../src/lib/vault";
import { dbGetAll } from "../src/lib/db";

describe("encrypted vault", () => {
  it("encrypts records and files, unlocks only with the right password, survives backup/restore", async () => {
    await createVault("my secret pw");
    await saveRecord("course", { id: "c1", name: "Lineare Algebra", color: "#000", emoji: "📘", createdAt: 1 });
    const bytes = new TextEncoder().encode("PDF CONTENT Eigenwert").buffer;
    await saveBlob("b1", bytes);

    // nothing readable on disk
    const raw = await dbGetAll<{ data: ArrayBuffer }>("records");
    expect(new TextDecoder().decode(new Uint8Array(raw[0].data))).not.toContain("Lineare");

    lockVault();
    expect(await unlockVault("wrong")).toBe(false);
    expect(await unlockVault("my secret pw")).toBe(true);
    expect((await loadAllRecords()).course[0].name).toBe("Lineare Algebra");
    expect(new TextDecoder().decode((await loadBlob("b1"))!)).toBe("PDF CONTENT Eigenwert");

    expect(await changePassword("my secret pw", "new password 2")).toBe(true);
    lockVault();
    expect(await unlockVault("my secret pw")).toBe(false);
    expect(await unlockVault("new password 2")).toBe(true);

    const backup = await (await exportBackup()).arrayBuffer();
    await deleteRecord("course", "c1");
    await wipeVault();
    await importBackup(backup);
    expect(await unlockVault("new password 2")).toBe(true);
    expect((await loadAllRecords()).course).toHaveLength(1);
    expect(new TextDecoder().decode((await loadBlob("b1"))!)).toContain("Eigenwert");
  });
});
