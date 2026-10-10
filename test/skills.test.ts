// Checks on what this repository publishes: the Agent Skills format (agentskills.io), links,
// the plugin manifests, the wording rules of the public site, and the sample programs.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { authorizeUrl } from "../skills/calmonkey-api/scripts/connect-flow.ts";
import { verifyHmac, verifySignature } from "../skills/calmonkey-api/scripts/verify-webhook.ts";

const ROOT = path.join(import.meta.dirname, "..");
const SKILLS = path.join(ROOT, "skills");
const MCP_URL = "https://mcp.calmonkey.com/mcp";

const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");
const json = (...parts: string[]) => JSON.parse(read(...parts)) as Record<string, unknown>;

function filesUnder(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? filesUnder(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]))
    .sort();
}

const skillNames = readdirSync(SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const skillFiles = filesUnder(SKILLS);
const markdownFiles = skillFiles.filter((file) => file.endsWith(".md"));

/** A file's text without its fenced code blocks: links and anchors are read from what is left. */
const prose = (text: string) => text.replace(/^([ >]*)(`{3,})[^\n]*\n[\s\S]*?\n\1\2[ ]*$/gm, "");
const linksOf = (text: string) => [...prose(text).matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!);
const anchorsOf = (text: string) => new Set([...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]!));

describe("the skills", () => {
  it("are the two this repository is for, each a folder with a SKILL.md", () => {
    assert.deepEqual(skillNames, ["calmonkey-api", "calmonkey-migration"]);
    for (const skill of skillNames) assert.ok(existsSync(path.join(SKILLS, skill, "SKILL.md")), skill);
  });

  for (const skill of skillNames) {
    it(`${skill}: frontmatter follows the Agent Skills specification`, () => {
      const text = read("skills", skill, "SKILL.md");
      const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
      assert.ok(m, "SKILL.md starts with YAML frontmatter");
      const front = parseYaml(m[1]!) as Record<string, unknown>;
      const allowed = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];
      assert.deepEqual(Object.keys(front).filter((key) => !allowed.includes(key)), [], "only the specification's fields");

      // name: 1 to 64 characters, a-z, 0-9 and single hyphens, the same as the folder.
      const name = front.name;
      assert.equal(name, skill, "name is the folder's name");
      assert.match(skill, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(skill.length <= 64);
      assert.doesNotMatch(skill, /anthropic|claude/);

      // description: what it does and when to use it, 1 to 1,024 characters.
      const description = front.description;
      assert.equal(typeof description, "string");
      assert.ok((description as string).trim().length > 0 && (description as string).length <= 1024, `description is ${(description as string).length} characters`);
      assert.match(description as string, /\bUse when\b/, "the description says when to use the skill");
      assert.doesNotMatch(description as string, /[<>]/);

      if ("compatibility" in front) assert.ok(typeof front.compatibility === "string" && front.compatibility.length <= 500);
      if ("metadata" in front) for (const [key, value] of Object.entries(front.metadata as object)) assert.equal(typeof value, "string", `metadata.${key}`);
      if ("license" in front) assert.equal(front.license, "MIT");
    });

    it(`${skill}: SKILL.md is under 500 lines and names every file beside it`, () => {
      const text = read("skills", skill, "SKILL.md");
      assert.ok(text.split("\n").length < 500, `${text.split("\n").length} lines`);
      for (const file of skillFiles.filter((f) => f.startsWith(`${skill}/`) && f !== `${skill}/SKILL.md`)) {
        assert.ok(text.includes(`](${file.slice(skill.length + 1)}`), `SKILL.md links to ${file}`);
      }
    });

    it(`${skill}: only SKILL.md, references/ and scripts/, one level deep`, () => {
      for (const file of skillFiles.filter((f) => f.startsWith(`${skill}/`))) assert.match(file.slice(skill.length + 1), /^(SKILL\.md|references\/[a-z-]+\.md|scripts\/[a-z-]+\.(ts|sh))$/, file);
    });
  }
});

describe("links", () => {
  it("every relative link in a skill leads to a file of that skill, and every fragment to an anchor in it", () => {
    let seen = 0;
    for (const name of markdownFiles) {
      const skill = name.split("/")[0]!;
      for (const link of linksOf(read("skills", name))) {
        if (/^(https?:|mailto:)/.test(link)) continue;
        seen++;
        const [target = "", fragment] = link.split("#");
        const file = target ? path.posix.normalize(path.posix.join(path.posix.dirname(name), target)) : name;
        assert.ok(file.startsWith(`${skill}/`), `${name}: ${link} leaves the skill`);
        assert.ok(skillFiles.includes(file), `${name}: ${link} leads nowhere`);
        if (fragment) assert.ok(anchorsOf(read("skills", file)).has(fragment), `${name}: ${link} has no such anchor`);
      }
    }
    assert.ok(seen > 150, `${seen} links checked`);
  });

  it("links out of a skill are https, to CalMonkey's own sites or to a page the documentation cites", () => {
    for (const name of markdownFiles) {
      for (const link of linksOf(read("skills", name))) {
        if (!/^[a-z]+:/.test(link)) continue;
        assert.match(link, /^(https:\/\/|mailto:[a-z]+@calmonkey\.com$)/, `${name}: ${link}`);
      }
    }
  });

  it("every relative link in the README leads to a file", () => {
    for (const link of linksOf(read("README.md"))) {
      if (/^(https?:|mailto:|#)/.test(link)) continue;
      assert.ok(existsSync(path.join(ROOT, link.split("#")[0]!)), `README.md: ${link}`);
    }
  });
});

describe("the plugin manifests", () => {
  const description = (value: unknown) => assert.ok(typeof value === "string" && value.length > 20 && value.length < 300);

  it(".claude-plugin/plugin.json names the plugin and leaves the version out, so every commit is an update", () => {
    const plugin = json(".claude-plugin", "plugin.json");
    assert.equal(plugin.name, "calmonkey");
    assert.ok(!("version" in plugin));
    description(plugin.description);
    assert.deepEqual(plugin.author, { name: "CalMonkey", url: "https://calmonkey.com" });
    assert.equal(plugin.repository, "https://github.com/calmonkey/skills");
    assert.equal(plugin.license, "MIT");
    assert.ok(Array.isArray(plugin.keywords) && plugin.keywords.every((k) => typeof k === "string"));
  });

  it(".claude-plugin/marketplace.json lists that plugin at the repository's root", () => {
    const marketplace = json(".claude-plugin", "marketplace.json");
    assert.equal(marketplace.name, "calmonkey");
    assert.equal((marketplace.owner as { name?: string }).name, "CalMonkey");
    description(marketplace.description);
    const plugins = marketplace.plugins as { name: string; source: string; description: string }[];
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0]!.name, json(".claude-plugin", "plugin.json").name);
    assert.equal(plugins[0]!.source, "./");
    description(plugins[0]!.description);
  });

  it(".mcp.json brings the CalMonkey MCP server with the plugin, as a remote http server", () => {
    assert.deepEqual(json(".mcp.json"), { mcpServers: { calmonkey: { type: "http", url: MCP_URL } } });
  });

  it("plugin.json and mcp.json are valid Agent Plugins 1.0.0 documents", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    for (const [file, schema] of [
      ["plugin.json", "agent-plugins-plugin.schema.json"],
      ["mcp.json", "agent-plugins-mcp.schema.json"],
    ] as const) {
      const validate = ajv.compile(json("test", "schemas", schema));
      assert.ok(validate(json(file)), `${file}: ${ajv.errorsText(validate.errors)}`);
      // The schemas refuse what they should, so the check is not a formality: a key they do not know, and a missing name.
      assert.equal(validate({ ...json(file), surprise: true }), false);
      assert.equal(validate({ $schema: json(file).$schema }), false);
    }
    assert.equal(json("plugin.json").name, json(".claude-plugin", "plugin.json").name);
    assert.deepEqual((json("mcp.json").mcpServers as Record<string, unknown>).calmonkey, { type: "streamable-http", url: MCP_URL });
  });

  it("the two formats describe one plugin", () => {
    const claude = json(".claude-plugin", "plugin.json");
    const { $schema: _schema, ...open } = json("plugin.json");
    assert.deepEqual(open, claude);
  });
});

describe("the README", () => {
  const readme = read("README.md");

  it("names both skills and every way to install them", () => {
    for (const skill of skillNames) assert.ok(readme.includes(`\`${skill}\``), skill);
    for (const line of ["npx calmonkey init", "npx skills add calmonkey/skills", "--skill calmonkey-api", "/plugin marketplace add calmonkey/skills", "/plugin install calmonkey@calmonkey"]) assert.ok(readme.includes(line), line);
    for (const agent of ["claude-code", "cursor", "codex", "github-copilot", "gemini-cli", "windsurf"]) assert.ok(readme.includes(`\`${agent}\``), agent);
    for (const url of ["https://calmonkey.com/docs", "https://calmonkey.com/llms.txt", "https://calmonkey.com/openapi.json"]) assert.ok(readme.includes(url), url);
  });

  it("says where the skills come from, and not to edit them here", () => {
    assert.match(readme, /generated from the documentation/);
    assert.match(readme, /Do not edit `skills\/` by hand/);
    assert.match(readme, /MIT/);
  });
});

describe("what is published says only what works today", () => {
  // The rule of the public site, which these files are part of.
  const FORBIDDEN =
    /not yet|not done(?!: confirmation needed)|\bplanned\b|coming soon|in development|in testing|final testing|early access|unverified|launch pricing|opens soon|no independent|SOC 2|ISO 27001|single region|status page|placeholder|\bdraft\b|roadmap|\bbeta\b|\balpha\b|\bpreview\b|work in progress|\bwip\b|\btodo\b|under review|not built|not supported yet|will be (?:available|added|supported)|in the future|experimental/i;
  const UNMENTIONED = /find_time|runtime token|per-end-user token|end-user token|\bregistry\b|\bdirectory listing/i;
  const published = [...skillFiles.map((file) => `skills/${file}`), "README.md", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "plugin.json"];

  for (const file of published) {
    it(`${file} has none of the wording the public site must not have`, () => {
      const text = read(file);
      for (const rule of [FORBIDDEN, UNMENTIONED]) {
        const hit = rule.exec(text);
        assert.equal(hit ? `${hit[0]}: ...${text.slice(Math.max(0, hit.index - 60), hit.index + 60)}...` : null, null);
      }
      assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, "no emoji");
      assert.doesNotMatch(text, /localhost:30[89]0|\/Users\//, "nothing of the machine it was made on");
    });
  }

  it("holds no secret: token-shaped strings are the documentation's made-up examples, each inside an example", () => {
    const TOKEN = /\b(?:cmsec|cmat|cmrt|cmac|cmlt|cmmat|cmmrt|cmmac|cmds|cminv|whsec)_[A-Za-z0-9_-]{16,}/g;
    for (const file of published) {
      const text = read(file);
      assert.doesNotMatch(text, /-----BEGIN [A-Z ]*PRIVATE KEY|\bAKIA[0-9A-Z]{16}\b|\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|\bgh[pousr]_[A-Za-z0-9]{30,}|\bxox[abp]-[A-Za-z0-9-]{20,}/, file);
      // Outside the reference files (the documentation's own examples) nothing looks like a token at all.
      if (!file.includes("/references/")) assert.deepEqual(text.match(TOKEN) ?? [], [], file);
    }
  });
});

describe("the sample programs", () => {
  const raw = Buffer.from('{"notification":{"type":"verification"},"channel":{"channel_id":"chn_633d9797c6e79a681d8ba688","callback_url":"https://yourapp.example/calmonkey/notifications","filters":{}}}');
  const signingSecret = "whsec_for-this-test-only";
  const clientSecret = "cmsec_for-this-test";
  const now = Date.UTC(2026, 9, 8, 2, 0, 0);
  const t = now / 1000;
  // The documented algorithm, written out again here.
  const signature = `t=${t},v1=${createHmac("sha256", signingSecret).update(`${t}.`).update(raw).digest("hex")}`;
  const hmac = createHmac("sha256", clientSecret).update(raw).digest("base64");

  it("verify-webhook.ts accepts a notification signed the documented way", () => {
    assert.equal(verifySignature(raw, signature, signingSecret, now), true);
    assert.equal(verifyHmac(raw, hmac, clientSecret), true);
    assert.equal(verifyHmac(raw, `another-value, ${hmac}`, clientSecret), true, "one value per active secret during a rotation");
  });

  it("verify-webhook.ts refuses a wrong secret, a changed body, an old timestamp and a missing header", () => {
    assert.equal(verifySignature(raw, signature, "whsec_another", now), false);
    assert.equal(verifySignature(Buffer.concat([raw, Buffer.from(" ")]), signature, signingSecret, now), false);
    assert.equal(verifySignature(raw, signature, signingSecret, now + 301_000), false);
    assert.equal(verifySignature(raw, signature, signingSecret, now - 301_000), false);
    assert.equal(verifySignature(raw, undefined, signingSecret, now), false);
    assert.equal(verifySignature(raw, "v1=00", signingSecret, now), false);
    assert.equal(verifyHmac(raw, hmac, "cmsec_another"), false);
    assert.equal(verifyHmac(raw, undefined, clientSecret), false);
  });

  it("connect-flow.ts builds the authorize link on the app host", () => {
    const url = new URL(authorizeUrl({ clientId: "client-1", redirectUri: "https://yourapp.example/calendar/callback", state: "4f1c2a9e7b", provider: "google" }));
    assert.equal(`${url.origin}${url.pathname}`, "https://app.calmonkey.com/oauth/authorize");
    assert.deepEqual(Object.fromEntries(url.searchParams), { response_type: "code", client_id: "client-1", redirect_uri: "https://yourapp.example/calendar/callback", scope: "read_write", state: "4f1c2a9e7b", provider_name: "google" });
  });

  it("the shell sample is executable and starts with a shebang", () => {
    const file = path.join(SKILLS, "calmonkey-api/scripts/quickstart.sh");
    assert.ok(statSync(file).mode & 0o111, "executable");
    assert.ok(readFileSync(file, "utf8").startsWith("#!/usr/bin/env bash\n"));
  });

  it("the samples default to production's hosts and take credentials only from the environment", () => {
    for (const file of skillFiles.filter((f) => f.includes("/scripts/"))) {
      const text = read("skills", file);
      assert.doesNotMatch(text, /localhost:30[89]0/, file);
      for (const [, variable] of text.matchAll(/\b(CALMONKEY_[A-Z_]+)\b/g)) {
        assert.ok(["CALMONKEY_CLIENT_ID", "CALMONKEY_CLIENT_SECRET", "CALMONKEY_API_URL", "CALMONKEY_APP_URL", "CALMONKEY_REDIRECT_URI", "CALMONKEY_REFRESH_TOKEN", "CALMONKEY_CHANNEL_SIGNING_SECRET"].includes(variable!), `${file}: ${variable}`);
      }
    }
  });
});
