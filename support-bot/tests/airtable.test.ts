import { describe, expect, it } from "vitest";
import { AirtableMirror } from "../src/airtable.js";
import { Db } from "../src/db.js";
import { cfg } from "./helpers.js";

function seed(db: Db) {
  let t = db.insertTicket({
    reporter_id: "1",
    reporter_name: "carolina",
    source: "discord",
    contact_kind: "discord",
    contact_value: "1",
    description: "coffee machine won't turn on",
    location: "4F kitchen",
    context: "tried the switch",
    visibility: "private",
    visibility_source: null,
    status: "new",
  });
  t = db.updateTicket(t.id, {
    kind: "issue",
    title: "Coffee machine won't turn on",
    staff_summary: "Coffee machine in 4F won't power on",
    category: "appliance",
    assessed_priority: "P1",
    reported_priority: "P2",
    priority: "P1",
    priority_source: "ai_escalation",
    owner_key: "jake",
    routed_by: "category_map",
    thread_id: "1545214670070091999",
    status: "routed",
  });
  return t;
}

describe("Airtable field mapping", () => {
  it("maps a routed issue to the table's field names and option labels", () => {
    const db = new Db(":memory:", 100);
    const m = new AirtableMirror(undefined, cfg, db);
    m.assumeOptionalFields(["Routed by", "Owner reasoning", "Duplicate of", "Discord message"]);
    const f = m.fields(seed(db));
    expect(f).not.toHaveProperty("Discord message"); // no source message: leave whatever is there alone
    expect(f).toMatchObject({
      Name: "MOX-100 · Coffee machine won't turn on",
      "Ticket ID": "MOX-100",
      Kind: "Issue",
      Status: "Routed",
      Priority: "P1 Important",
      "Reported priority": "P2 No rush",
      "AI assessment": "P1 Important",
      Category: "Appliance",
      Owner: "Jake",
      "Routed by": "Category map",
      "Owner reasoning": null,
      "Duplicate of": [],
      Reporter: "carolina",
      Location: "4F kitchen",
      Visibility: "Private",
      Source: "Discord",
      "Discord thread": `https://discord.com/channels/${cfg.guild_id}/1545214670070091999`,
    });
    expect(f.Description).toContain("tried the switch");
    expect(f).not.toHaveProperty("Photos"); // attachments only ever go through the upload endpoint
    db.close();
  });

  it("links duplicates by record id and writes the reason into Resolution", () => {
    const db = new Db(":memory:", 100);
    const m = new AirtableMirror(undefined, cfg, db);
    m.assumeOptionalFields(["Duplicate of"]);
    const original = seed(db); // MOX-100
    const t = db.updateTicket(seed(db).id, { status: "duplicate", duplicate_of: original.id }); // MOX-101
    const f = m.fields(t, { duplicateRecordId: "recABCDEFGHIJKLMN" });
    expect(f["Duplicate of"]).toEqual(["recABCDEFGHIJKLMN"]);
    expect(f.Resolution).toBe("Duplicate of MOX-100");
    db.close();
  });

  it("chat captures carry a link to the original Discord message", () => {
    const db = new Db(":memory:", 100);
    const m = new AirtableMirror(undefined, cfg, db);
    m.assumeOptionalFields(["Discord message"]);
    const url = "https://discord.com/channels/1339404214081687675/1342558808639275008/1555232283953336512";
    const t = db.updateTicket(seed(db).id, { source: "chat", source_message_url: url });
    expect(m.fields(t)["Discord message"]).toBe(url);
    db.close();
  });

  it("ideas land as Idea / P3 Idea / Unassigned", () => {
    const db = new Db(":memory:", 100);
    const m = new AirtableMirror(undefined, cfg, db);
    const t = db.updateTicket(seed(db).id, { kind: "idea", priority: "P3", owner_key: "unassigned", status: "logged" });
    expect(m.fields(t)).toMatchObject({ Kind: "Idea", Priority: "P3 Idea", Owner: "Unassigned", Status: "New" });
    db.close();
  });

  it("never enqueues a question", () => {
    const db = new Db(":memory:", 100);
    const m = new AirtableMirror(undefined, cfg, db);
    const t = db.updateTicket(seed(db).id, { kind: "question" });
    m.enqueueUpsert(t);
    expect(db.mirrorQueueDepth()).toBe(0);
    db.close();
  });
});
