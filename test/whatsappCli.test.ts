/**
 * WhatsApp reads through the same verbs and the same JSON keys as iMessage.
 * The schema is the one `whatsappRecipes` was written against: a
 * `pragma table_info` dump, not a guess. Column names are only as good as
 * that dump.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ON_MAC = process.platform === "darwin";
const itMac = it.skipIf(!ON_MAC);
const REPO = fileURLToPath(new URL("../", import.meta.url));
const BIN = path.join(REPO, "dist", "plow-messages");
const SQLITE = "/usr/bin/sqlite3";
const EPOCH = 978307200;

const secs = (ago: number): number => Math.floor(Date.now() / 1000) - ago - EPOCH;

/** `--after`/`--before` take an ISO instant. The suite forces UTC. */
function isoAgo(ago: number): string {
  const d = new Date(Date.now() - ago * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
  );
}

function makeStore(dir: string): string {
  const store = path.join(dir, "ChatStorage.sqlite");
  const sql = [
    "create table ZWACHATSESSION (Z_PK integer primary key, ZPARTNERNAME text, ZCONTACTJID text, ZLASTMESSAGEDATE integer);",
    "create table ZWAGROUPMEMBER (Z_PK integer primary key, ZCONTACTNAME text, ZMEMBERJID text, ZCHATSESSION integer);",
    "create table ZWAMESSAGE (ZMESSAGEDATE integer, ZTEXT text, ZCHATSESSION integer, ZISFROMME integer, ZGROUPMEMBER integer, ZPUSHNAME text);",
    `insert into ZWACHATSESSION values (1, 'O''Brien', '15551234@s.whatsapp.net', ${secs(1000)});`,
    `insert into ZWACHATSESSION values (2, 'Book Club', '99887@g.us', ${secs(500)});`,
    `insert into ZWACHATSESSION values (3, 'Wren', '15557777@s.whatsapp.net', ${secs(2000)});`,
    "insert into ZWAGROUPMEMBER values (1, 'Bernard', '15559999@s.whatsapp.net', 2);",
    `insert into ZWAMESSAGE (ZMESSAGEDATE, ZTEXT, ZCHATSESSION, ZISFROMME) values (${secs(3000)}, 'from you about dinner', 1, 1);`,
    `insert into ZWAMESSAGE (ZMESSAGEDATE, ZTEXT, ZCHATSESSION, ZISFROMME) values (${secs(1000)}, 'their dinner reply', 1, 0);`,
    `insert into ZWAMESSAGE (ZMESSAGEDATE, ZTEXT, ZCHATSESSION, ZISFROMME, ZGROUPMEMBER) values (${secs(500)}, 'from the club', 2, 0, 1);`,
    `insert into ZWAMESSAGE (ZMESSAGEDATE, ZTEXT, ZCHATSESSION, ZISFROMME, ZGROUPMEMBER) values (${secs(800)}, 'don''t forget the cake', 2, 0, 1);`,
    `insert into ZWAMESSAGE (ZMESSAGEDATE, ZTEXT, ZCHATSESSION, ZISFROMME) values (${secs(4000)}, 'old inbound', 3, 0);`,
    `insert into ZWAMESSAGE (ZMESSAGEDATE, ZTEXT, ZCHATSESSION, ZISFROMME) values (${secs(2000)}, 'you already answered', 3, 1);`,
  ].join("\n");
  execFileSync(SQLITE, [store, sql], { encoding: "utf8" });
  return store;
}

let store = "";

beforeAll(() => {
  if (!ON_MAC) return;
  if (!fs.existsSync(BIN)) execFileSync("just", ["build"], { cwd: REPO, stdio: "inherit" });
  store = makeStore(fs.mkdtempSync(path.join(os.tmpdir(), "plow-messages-wa-")));
}, 120_000);

type Row = Record<string, string | number | boolean | null>;

function cli(...args: string[]): { rows: Row[]; stderr: string; code: number } {
  const argv = ["--app", "whatsapp", "--store", store, ...args];
  try {
    const out = execFileSync(BIN, argv, { encoding: "utf8", env: { ...process.env, TZ: "UTC" } });
    const lines = out.trim() === "" ? [] : out.trim().split("\n");
    const rows = out.startsWith("{") ? lines.map((l) => JSON.parse(l) as Row) : [];
    return { rows, stderr: "", code: 0 };
  } catch (e) {
    const err = e as { status: number; stderr: string; stdout: string };
    return { rows: [], stderr: String(err.stderr), code: err.status };
  }
}

describe("plow-messages --app whatsapp", () => {
  itMac("lists chats with the jid a send would target, groups marked", () => {
    const rows = cli("chats").rows;
    expect(rows.map((r) => r.guid)).toEqual(["99887@g.us", "15551234@s.whatsapp.net", "15557777@s.whatsapp.net"]);
    expect(rows.map((r) => r.chat_identifier)).toEqual(rows.map((r) => r.guid));
    expect(rows.find((r) => r.guid === "99887@g.us")).toMatchObject({ kind: "group", display_name: "Book Club" });
    expect(rows.find((r) => r.guid === "15551234@s.whatsapp.net")).toMatchObject({ kind: "direct" });
  });

  itMac("attributes a search to the owner or the sender jid, never a display name", () => {
    const rows = cli("search", "dinner").rows;
    const mine = rows.find((r) => r.body === "from you about dinner");
    const theirs = rows.find((r) => r.body === "their dinner reply");
    expect(mine).toMatchObject({ is_from_me: true, sender: null, chat_identifier: "15551234@s.whatsapp.net" });
    expect(theirs).toMatchObject({
      is_from_me: false,
      sender: "15551234@s.whatsapp.net",
      chat_identifier: "15551234@s.whatsapp.net",
    });
  });

  itMac("attributes a group row to the member jid", () => {
    const row = cli("search", "club").rows[0];
    expect(row).toMatchObject({
      is_from_me: false,
      sender: "15559999@s.whatsapp.net",
      chat_guid: "99887@g.us",
    });
  });

  itMac("reads a direct thread by jid and not the group", () => {
    const rows = cli("thread", "--handle", "15551234@s.whatsapp.net").rows;
    expect(rows.map((r) => r.body)).toEqual(["from you about dinner", "their dinner reply"]);
    expect(cli("thread", "--handle", "99887@g.us").rows).toEqual([]);
  });

  itMac("lists a direct chat whose newest message is inbound", () => {
    const ids = cli("unreplied").rows.map((r) => r.chat_identifier);
    expect(ids).toContain("15551234@s.whatsapp.net");
    expect(ids).not.toContain("15557777@s.whatsapp.net");
    expect(ids).not.toContain("99887@g.us");
  });

  itMac("keeps an apostrophe inside the bound phrase", () => {
    const rows = cli("search", "don't").rows;
    expect(rows.map((r) => r.body)).toEqual(["don't forget the cake"]);
    expect(rows[0]?.sender).toBe("15559999@s.whatsapp.net");
  });

  itMac("applies --after and --before as unix seconds, not nanoseconds", () => {
    const newer = cli("search", "--after", isoAgo(1500)).rows.map((r) => r.body);
    expect(newer).toEqual(expect.arrayContaining(["their dinner reply", "from the club", "don't forget the cake"]));
    expect(newer).not.toContain("from you about dinner");
    const older = cli("search", "--before", isoAgo(2500)).rows.map((r) => r.body);
    expect(older).toContain("from you about dinner");
    expect(older).not.toContain("their dinner reply");
    const dated = cli("search", "dinner").rows[0];
    expect(String(dated?.at)).toMatch(new RegExp("^" + new Date().getUTCFullYear()));
  });

  itMac("accepts --store before --app, still as globals", () => {
    const out = execFileSync(BIN, ["--store", store, "--app", "whatsapp", "chats"], {
      encoding: "utf8",
      env: { ...process.env, TZ: "UTC" },
    });
    expect(out).toContain("99887@g.us");
  });
});
