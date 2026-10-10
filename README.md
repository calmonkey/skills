# CalMonkey skills

Agent Skills for building on [CalMonkey](https://calmonkey.com), one calendar API for Google Calendar, Microsoft 365, Outlook.com and Apple iCloud. A skill is a folder of instructions an AI coding tool reads when the work calls for it.

| Skill | Use it for |
| --- | --- |
| [`calmonkey-api`](skills/calmonkey-api/SKILL.md) | Calendar sync, free/busy, booking and scheduling features on the CalMonkey API: connecting people's calendars, reading availability and events, writing events with guests, repeating events and meeting links, and receiving signed webhooks. It comes with reference files for each part of the API and four sample programs. |
| [`calmonkey-migration`](skills/calmonkey-migration/SKILL.md) | Moving an existing calendar integration to CalMonkey: what is compatible, what differs, the settings to change and a checklist. |

## Install

### With one command, as part of setting up CalMonkey

```sh
npx calmonkey init
```

Run in a project folder, it signs you in, picks or creates a test-mode application, writes your environment file, and installs `calmonkey-api` into the project by itself, with a short section in `AGENTS.md`. Your AI coding agent then works by running the `calmonkey` command line tool, which the skill teaches first ([every command](https://calmonkey.com/docs/cli)). The MCP server is for tools that cannot run a command. It installs `calmonkey-migration` only when asked: `npx skills add calmonkey/skills --skill calmonkey-migration`. See [AI coding tools](https://calmonkey.com/docs/ai).

### Any tool, with the open skills installer

```sh
npx skills add calmonkey/skills
```

It asks which skills to install and for which tools. To answer on the command line:

```sh
npx skills add calmonkey/skills --skill calmonkey-api   # one skill
npx skills add calmonkey/skills -a claude-code          # one tool
npx skills add calmonkey/skills --list                  # only show what is here
```

| Tool | `-a` | Reads the skills from |
| --- | --- | --- |
| Claude Code | `claude-code` | `.claude/skills/` |
| Cursor | `cursor` | `.agents/skills/` |
| Codex | `codex` | `.agents/skills/` |
| GitHub Copilot | `github-copilot` | `.agents/skills/` |
| Gemini CLI | `gemini-cli` | `.agents/skills/` |
| Windsurf | `windsurf` | `.windsurf/skills/` |

The skills are written to `.agents/skills/` in the project. Claude Code and Windsurf get a link to them in their own folder; `--copy` writes copies in place of links.

`-a` can be given more than once, `-g` installs for your user instead of the project, and `-y` asks no questions. The installer is the `skills` package on npm; `DISABLE_TELEMETRY=1` switches off its usage reporting.

### Claude Code, as a plugin

The plugin holds both skills and the CalMonkey MCP server (`https://mcp.calmonkey.com/mcp`), so one install gives Claude Code the instructions and the tools.

```
/plugin marketplace add calmonkey/skills
/plugin install calmonkey@calmonkey
```

The first time a tool uses the MCP server it opens a browser tab where you sign in to CalMonkey and choose what the tool may do.

### By hand

Copy a folder from [`skills/`](skills) into the place your tool reads skills from (for example `.claude/skills/` or `.agents/skills/` in a project).

## Where the skills come from

Everything under `skills/` is generated from the documentation at [calmonkey.com/docs](https://calmonkey.com/docs): the reference files are the documentation's own sections, cut by topic, and the sample programs are run against the API before they are published.

**Do not edit `skills/` by hand.** A change made here is overwritten by the next build. Changes go to the documentation; if something in a skill is wrong or unclear, [open an issue](https://github.com/calmonkey/skills/issues) or write to [support@calmonkey.com](mailto:support@calmonkey.com).

## The documentation, for programs

- [calmonkey.com/llms.txt](https://calmonkey.com/llms.txt): what CalMonkey is, the quickest working path, and every page of the documentation as Markdown.
- [calmonkey.com/llms-full.txt](https://calmonkey.com/llms-full.txt): all of the documentation in one file.
- [calmonkey.com/openapi.json](https://calmonkey.com/openapi.json): every endpoint with its request and response schemas (OpenAPI 3.1).
- [calmonkey.com/docs](https://calmonkey.com/docs): the documentation. Add `.md` to a page's address for its Markdown.

## This repository

```
skills/                      the two skills (generated)
.claude-plugin/              the Claude Code plugin and its marketplace entry
.mcp.json                    the MCP server the Claude Code plugin brings with it
plugin.json, mcp.json        the same plugin in the Agent Plugins format
test/, tools/                checks: the skill format, links, manifests, the samples
```

```sh
npm ci
npm run lint && npm run typecheck && npm test
```

## Licence

[MIT](LICENSE). Copyright 2026 Swixy Pty Ltd.
