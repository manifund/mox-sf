import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ConfigError, findPlaceholders, loadConfigFromString, staffMap } from "../src/config.js";

describe("config loader — E30", () => {
  const yaml = fs.readFileSync("config.yaml", "utf8");
  it("the shipped config.yaml loads", () => {
    const cfg = loadConfigFromString(yaml);
    expect(cfg.owners.jake?.delivery).toBe("thread");
    expect(staffMap(cfg)[cfg.users.jake!]).toBe("jake");
  });
  it("refuses to start on a placeholder and names the key", () => {
    const broken = yaml.replace(/team_carolina:\s+"\d+"/, 'team_carolina: "<<CHANNEL_TEAM_CAROLINA>>"');
    expect(() => loadConfigFromString(broken)).toThrow(ConfigError);
    expect(() => loadConfigFromString(broken)).toThrow(/channels\.team_carolina/);
  });
  it("findPlaceholders sees NONE and <<...>> anywhere", () => {
    expect(findPlaceholders({ a: { b: ["x", "<<Y>>"] }, c: "NONE" })).toEqual(["config.a.b[1]", "config.c"]);
  });
  it("cross-checks delivery shapes", () => {
    const broken = yaml.replace(/claudio:\n\s+display_name: "Claudio"\n\s+mention_user_ids: \["\d+"\]\n\s+delivery: channel\s+#[^\n]*\n\s+channel_id: "\d+"/, 'claudio:\n    display_name: "Claudio"\n    mention_user_ids: []\n    delivery: channel');
    expect(() => loadConfigFromString(broken)).toThrow(/channel_id/);
  });
});
