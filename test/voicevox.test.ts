import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { narrate, silentWav, VoicevoxClient, wavDurationSec } from "../src/production/voicevox.js";

test("無音WAVの長さを読み取れる", () => {
  assert.equal(wavDurationSec(silentWav(2.5)), 2.5);
});

/** VOICEVOX エンジンの代わりに、同じ形で応答するサーバー */
async function fakeVoicevox(): Promise<{ url: string; server: Server; texts: string[] }> {
  const texts: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/version") return res.end('"0.0.0"');
    if (url.pathname === "/speakers") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify([{ name: "青山龍星", styles: [{ name: "ノーマル", id: 13 }] }]));
    }
    if (url.pathname === "/audio_query") {
      texts.push(url.searchParams.get("text") ?? "");
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ speedScale: 1 }));
    }
    if (url.pathname === "/synthesis") return res.end(Buffer.from(silentWav(1.25)));
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, texts };
}

test("VOICEVOX が動いていれば読み上げ音声を保存し、クレジットを返す", async () => {
  const fake = await fakeVoicevox();
  const dir = await mkdtemp(join(tmpdir(), "voice-"));
  try {
    const result = await narrate(["一つ目。", "二つ目。"], { speaker: "青山龍星", style: "ささやき", speed: 1.1 }, {
      client: new VoicevoxClient(fake.url),
      publicDir: dir,
      relDir: "jobs/test",
    });
    assert.equal(result.credit, "VOICEVOX:青山龍星");
    assert.deepEqual(fake.texts, ["一つ目。", "二つ目。"]);
    assert.deepEqual(result.clips.map((c) => c.durationSec), [1.25, 1.25]);
    const wav = await readFile(join(dir, result.clips[0]!.file));
    assert.equal(wavDurationSec(new Uint8Array(wav)), 1.25);
  } finally {
    fake.server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("VOICEVOX が動いていなければ無音で代用する", async () => {
  const dir = await mkdtemp(join(tmpdir(), "voice-"));
  try {
    const result = await narrate(["あ".repeat(70)], { speaker: "青山龍星", style: "ノーマル", speed: 1.15 }, {
      client: new VoicevoxClient("http://127.0.0.1:9"),
      publicDir: dir,
      relDir: "jobs/test",
    });
    assert.equal(result.credit, null);
    assert.ok(result.warning);
    assert.ok(Math.abs(result.clips[0]!.durationSec - 10) < 0.01);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
