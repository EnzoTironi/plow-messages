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

function makeStore(dir: string, extraSql: string[] = []): string {
  const store = path.join(dir, "ChatStorage.sqlite");
  const sql = [
    "create table ZWACHATSESSION (Z_PK integer primary key, ZPARTNERNAME text, ZCONTACTJID text, ZLASTMESSAGEDATE integer);",
    "create table ZWAGROUPMEMBER (Z_PK integer primary key, ZCONTACTNAME text, ZMEMBERJID text, ZCHATSESSION integer);",
    "create table ZWAMESSAGE (ZMESSAGEDATE integer, ZTEXT text, ZCHATSESSION integer, ZISFROMME integer, ZGROUPMEMBER integer, ZPUSHNAME text, ZMESSAGETYPE integer default 0);",
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
    `insert into ZWAMESSAGE (ZMESSAGEDATE, ZTEXT, ZCHATSESSION, ZISFROMME) values (${secs(700)}, 'missing group sender', 2, 0);`,
    `insert into ZWAMESSAGE (ZMESSAGEDATE, ZTEXT, ZCHATSESSION, ZISFROMME, ZGROUPMEMBER) values (${secs(600)}, 'missing group member record', 2, 0, 999);`,
    ...extraSql,
  ].join("\n");
  execFileSync(SQLITE, [store, sql], { encoding: "utf8" });
  return store;
}

let store = "";
let edgeStore = "";

beforeAll(() => {
  if (!ON_MAC) return;
  if (!fs.existsSync(BIN)) execFileSync("just", ["build"], { cwd: REPO, stdio: "inherit" });
  store = makeStore(fs.mkdtempSync(path.join(os.tmpdir(), "plow-messages-wa-")));
  edgeStore = makeStore(fs.mkdtempSync(path.join(os.tmpdir(), "plow-messages-wa-edges-")), [
    `insert into ZWACHATSESSION values (4, 'Only events', '15550004@s.whatsapp.net', ${secs(50)});`,
    `insert into ZWACHATSESSION values (5, 'Attachment', '15550005@s.whatsapp.net', ${secs(200)});`,
    `insert into ZWACHATSESSION values (6, 'Old inbound', '15550006@s.whatsapp.net', ${secs(50)});`,
    `insert into ZWACHATSESSION values (7, 'LID direct', '123456@lid', ${secs(200)});`,
    `insert into ZWACHATSESSION values (8, 'Broadcast', '123456@broadcast', ${secs(200)});`,
    `insert into ZWACHATSESSION values (9, 'Status', '123456@lid.status', ${secs(200)});`,
    `insert into ZWAMESSAGE (ZMESSAGEDATE, ZTEXT, ZCHATSESSION, ZISFROMME, ZMESSAGETYPE) values
      (${secs(50)}, 'system-event', 1, 0, 6),
      (${secs(50)}, 'system-event', 2, 0, 6),
      (${secs(50)}, 'system-event', 3, 0, 6),
      (${secs(50)}, 'system-event', 4, 0, 6),
      (${secs(25)}, 'system-event outgoing metadata', 1, 1, 10),
      (${secs(25)}, 'system-event group metadata', 2, 0, 10),
      (${secs(25)}, 'system-event inbound metadata', 3, 0, 10),
      (${secs(25)}, 'system-event metadata only', 4, 0, 10),
      (${secs(200)}, NULL, 5, 0, 1),
      (${secs(129700)}, 'too old', 6, 0, 0),
      (${secs(50)}, 'system-event', 6, 0, 6),
      (${secs(200)}, NULL, 7, 0, 99),
      (${secs(200)}, 'broadcast', 8, 0, 0),
      (${secs(200)}, 'status', 9, 0, 0);`,
    `update ZWACHATSESSION set ZLASTMESSAGEDATE = ${secs(50)} where Z_PK in (1, 2, 3);`,
  ]);
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

  itMac("keeps a group sender unknown when its member is missing", () => {
    const result = cli("search", "missing group");
    expect(result.code).toBe(0);
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row).toMatchObject({ sender: null, is_from_me: false, chat_guid: "99887@g.us" });
    }
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

  itMac("ignores system events in search, thread, and the latest chat timestamp", () => {
    expect(cli("--store", edgeStore, "search", "system-event")).toMatchObject({ code: 0, rows: [] });
    const thread = cli("--store", edgeStore, "thread", "--chat-id", "1");
    expect(thread.code).toBe(0);
    expect(thread.rows.map((r) => r.body)).toEqual(["from you about dinner", "their dinner reply"]);
    const chats = cli("--store", edgeStore, "chats");
    expect(chats.code).toBe(0);
    expect(chats.rows.find((r) => r.chat_id === 1)?.last_message).toBe(thread.rows[1]?.at);
    expect(chats.rows.map((r) => r.chat_id)).not.toContain(4);
  });

  itMac("bases unreplied on real direct messages and preserves bodiless media and unknown types", () => {
    const result = cli("--store", edgeStore, "unreplied");
    expect(result.code).toBe(0);
    expect(result.rows.map((r) => r.chat_identifier).sort()).toEqual([
      "123456@lid", "15550005@s.whatsapp.net", "15551234@s.whatsapp.net",
    ]);
    expect(result.rows.find((r) => r.chat_identifier === "15551234@s.whatsapp.net")?.body).toBe("their dinner reply");
    expect(result.rows.find((r) => r.chat_identifier === "15550005@s.whatsapp.net")?.body).toBeNull();
    expect(result.rows.find((r) => r.chat_identifier === "123456@lid")?.body).toBeNull();
  });

  itMac("accepts LID direct handles and excludes broadcast and status handles", () => {
    expect(cli("--store", edgeStore, "thread", "--handle", "123456@lid").rows).toHaveLength(1);
    for (const handle of ["123456@broadcast", "123456@lid.status"]) {
      expect(cli("--store", edgeStore, "thread", "--handle", handle)).toMatchObject({ code: 0, rows: [] });
    }
  });

  itMac("keeps an apostrophe inside the bound phrase", () => {
    const rows = cli("search", "don't").rows;
    expect(rows.map((r) => r.body)).toEqual(["don't forget the cake"]);
    expect(rows[0]?.sender).toBe("15559999@s.whatsapp.net");
  });

  itMac("keeps phrases and handles literal, including SQL-looking input", () => {
    for (const phrase of ["%dinner%", "dinner_", ".*dinner.*", "' OR 1=1 --"]) {
      expect(cli("search", phrase)).toMatchObject({ code: 0, rows: [] });
    }
    expect(cli("search", "DINNER").rows).toHaveLength(2);
    expect(cli("search", "--handle", "' OR 1=1 --")).toMatchObject({ code: 0, rows: [] });
  });

  itMac("keeps the newest limited thread chronological and combines search filters", () => {
    expect(cli("thread", "--chat-id", "2", "--limit", "2").rows.map((r) => r.rowid)).toEqual([8, 3]);
    expect(cli("search", "--after-rowid", "4", "--order", "asc", "--limit", "2").rows.map((r) => r.rowid)).toEqual([5, 6]);
    expect(cli("search", "--chat-id", "1", "--handle", "15551234@s.whatsapp.net").rows).toHaveLength(2);
    expect(cli("search", "--chat-id", "1", "--handle", "15557777@s.whatsapp.net").rows).toEqual([]);
  });

  itMac("refuses app/store selectors and aliases after every allowed verb", () => {
    for (const verb of ["search", "thread", "chats", "unreplied"]) {
      for (const selector of [["--app", "imessage"], ["--app=imessage"], ["-a", "imessage"],
        ["--store", store], [`--store=${store}`], ["-s", store]]) {
        const result = cli(verb, ...selector);
        expect(result.code, `${verb} ${selector[0]}`).toBe(2);
        expect(result.stderr).toContain("unknown option");
        expect(result.rows).toEqual([]);
      }
    }
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
