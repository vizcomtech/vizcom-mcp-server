# Vizcom MCP Server — Design Document

**Date:** 2026-02-24
**Status:** Approved

## Overview

A standalone npm package (`@vizcom/mcp-server`) that exposes Vizcom's creative workflow to LLM agents via the Model Context Protocol. Users install it locally and connect it to Claude, Cursor, or any MCP-compatible client to browse projects and generate/modify designs through conversation.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repo | Standalone npm package | Industry standard for MCP servers (Linear, Slack, etc.) |
| Transport | stdio | No hosting needed, user runs locally |
| Auth | Email/password via GraphQL login mutation | Zero Vizcom code changes, works today |
| SSO users | Set password via forgot-password flow | One-time setup, no backend changes |
| Hero tool | Modify / Modify Pro | Most-used Vizcom feature, core creative value |
| Result delivery | Poll GraphQL every 2s, up to 2 min | Works with public API, no WebSocket needed |
| Ephemeral ops | Deferred to phase 2/3 | Need to verify feasibility without WebSocket |
| Type safety | Phase 2 codegen from public schema | Same benefit as internal mutation registry, standalone-compatible |
| Infra | None | Runs on user's machine |

## User Setup

```json
{
  "mcpServers": {
    "vizcom": {
      "command": "npx",
      "args": ["-y", "@vizcom/mcp-server"],
      "env": {
        "VIZCOM_API_URL": "https://app.vizcom.ai/api/v1"
      }
    }
  }
}
```

First-time auth:
```
$ npx @vizcom/mcp-server login
Email: user@example.com
Password: ********
✓ Logged in as User Name
```

For Google/SSO-only users without a password:
```
$ npx @vizcom/mcp-server login
Email: user@example.com
Password:
✗ No password set. You signed up with Google.

To use the CLI, set a password:
  1. Go to https://app.vizcom.ai/forgot-password
  2. Enter your email to receive a reset link
  3. Set a password, then run this command again
```

Credentials stored at `~/.vizcom/credentials.json`:
```json
{
  "apiUrl": "https://app.vizcom.ai/api/v1",
  "authToken": "eyJ...",
  "organizationId": "uuid",
  "userId": "uuid",
  "email": "user@example.com",
  "expiresAt": "2026-03-01T00:00:00Z"
}
```

## Project Structure

```
vizcom-mcp-server/
├── src/
│   ├── index.ts              # Entry point, stdio transport
│   ├── auth/
│   │   ├── login.ts          # CLI login flow (email/password via GraphQL)
│   │   └── credentials.ts    # Read/write ~/.vizcom/credentials.json
│   ├── client.ts             # HTTP client for Vizcom GraphQL API
│   ├── tools/
│   │   ├── browse.ts         # Teams, folders, workbenches, drawings
│   │   ├── modify.ts         # Modify / Modify Pro (hero feature)
│   │   ├── render.ts         # Sketch-to-render
│   │   ├── generate.ts       # Text-to-image / Inspire
│   │   ├── operations.ts     # Background removal, new view
│   │   └── export.ts         # Download/export images
│   └── utils/
│       └── polling.ts        # Poll for job results
├── package.json
├── tsconfig.json
└── README.md
```

Tech stack:
- TypeScript
- `@modelcontextprotocol/sdk` — MCP protocol
- `zod` — tool input validation
- No heavy dependencies; just HTTP calls to the Vizcom GraphQL API

## Tools

### Browsing

| Tool | Description | Inputs |
|------|-------------|--------|
| `get_current_user` | Get authenticated user and their organizations | none |
| `list_teams` | List teams in the organization | none |
| `list_folders` | List subfolders and workbenches in a folder | `folderId` |
| `get_workbench` | Get workbench details with its drawings | `workbenchId` |
| `get_drawing` | Get a drawing with layers and generation history | `drawingId` |

### Creative

| Tool | Description | Inputs |
|------|-------------|--------|
| `modify_image` | Describe changes to an existing image, optionally with a mask for targeted edits. Supports standard and pro quality. | `drawingId`, `prompt`, `sourceImageBase64`, `mask?`, `qualityMode?`, `outputsCount?` |
| `render_sketch` | Turn a sketch into a rendered visualization | `drawingId`, `prompt`, `sourceImageBase64`, `influenceLevel?`, `outputsCount?` |
| `generate_image` | Text-to-image generation, no source sketch needed | `drawingId`, `prompt`, `outputsCount?` |
| `create_new_view` | Generate a new angle/perspective of an existing design | `drawingId`, `prompt`, `sourceImageBase64` |

### Utility

| Tool | Description | Inputs |
|------|-------------|--------|
| `remove_background` | Remove background from an image | `workbenchId`, `imageBase64` |
| `get_generation_status` | Check status of an in-progress generation | `promptId` |
| `export_image` | Download a generated image by its storage path | `imagePath` |
| `create_workbench` | Create a new workbench in a folder | `folderId`, `name` |

### How creative tools work

All creative tools follow the same pattern:
1. **Submit** — call the appropriate GraphQL mutation (`createEditPrompt` for modify, `createPrompt` for render)
2. **Poll** — query prompt status every 2s until complete or failed
3. **Return** — return output image URL(s)

The tool blocks until the result is ready (up to ~2 min). `get_generation_status` exists as a fallback if something times out.

### GraphQL mutations referenced

| Tool | Mutation | Notes |
|------|----------|-------|
| `modify_image` | `createEditPrompt` | Uses `vizcom-edit` / `vizcom-edit_pro` queues |
| `render_sketch` | `createPrompt` with `imageInferenceType: RENDER` | Uses `vizcom-inference` queue |
| `generate_image` | `createPrompt` with `imageInferenceType: RAW_GENERATION` | Uses `vizcom-inference` queue |
| `create_new_view` | `createPrompt` with `imageInferenceType: INSPIRE` | Uses `vizcom-inference` queue |
| `remove_background` | `removeBackground` | Ephemeral job — may need WebSocket bridge |

## Error Handling

**Auth errors:**
- Token expired → "Your session has expired. Run `npx @vizcom/mcp-server login` to re-authenticate"
- Permission denied → "You don't have access to this resource"

**Generation failures:**
- Timeout (>2 min) → return partial status with prompt ID for manual follow-up
- Prompt blocked (offensive content, artist name, org denylist) → return specific error code so LLM can suggest a revised prompt
- Quota exceeded → "You've hit your generation limit. Check your plan at app.vizcom.ai"

**Ephemeral operations:**
- Background removal and similar ops use Redis mailboxes internally
- If they can't work via public API alone, they're marked "not yet supported" with a clear message

## Phased Roadmap

### Phase 1 — MVP
- Standalone npm package
- CLI login with email/password
- Browsing tools (user, teams, folders, workbenches, drawings)
- Modify / Modify Pro
- Render sketch
- Generate image (text-to-image)
- Polling-based result delivery
- Export/download image

### Phase 2 — Expand
- New view generation
- Background removal (if feasible without WebSocket)
- Create workbench
- GraphQL schema codegen for type safety (mutation registry from public schema introspection, inspired by internal `mutationRegistry.ts` pattern)

### Phase 3 — Polish
- PAT support (when Vizcom ships API keys — replaces CLI login)
- Token auto-refresh
- Hosted remote server with OAuth (if demand for zero-install UX)
- Additional tools: enhance, magic erase, color palette, material transfer

## Reference

- Muhsin's `mutationRegistry.ts` on `muhsin/agentic-v0-improvements` branch documents the full mutation surface area and pipeline groupings — useful as a map for which GraphQL mutations exist and how they relate to user-facing features
- Vizcom API runs at `https://app.vizcom.ai/api/v1/graphql`
- Auth: JWT via `Authorization: Bearer <token>` + `x-organization-id` header
- File uploads use the `graphql-upload` multipart spec
