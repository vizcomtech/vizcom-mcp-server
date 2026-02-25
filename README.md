# @vizcom/mcp-server

MCP server for [Vizcom](https://vizcom.ai) — connect your AI assistant to Vizcom's creative design tools.

## Quick Start

### Step 1: Log in to your Vizcom account

```bash
npx @vizcom/mcp-server login
```

You'll be prompted for your email and password. That's it — your credentials are saved locally.

> **Signed up with Google/SSO?** You'll need to set a password first:
> go to https://app.vizcom.ai/forgot-password, enter your email, and set a password.

### Step 2: Add it to Claude

**Claude Code (terminal):**

```bash
claude mcp add vizcom -- npx @vizcom/mcp-server
```

**Claude Desktop:** Add this to your config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "vizcom": {
      "command": "npx",
      "args": ["-y", "@vizcom/mcp-server"]
    }
  }
}
```

**Cursor:** Add the same config in Cursor Settings > MCP Servers.

### Step 3: Start using it

Open a new conversation and ask things like:

- "Show me my Vizcom workbenches"
- "Render this sketch as a modern desk lamp in white ceramic"
- "Modify this design — make the handle more ergonomic"
- "Generate 4 concept variations of a minimalist desk lamp"

## Advanced Setup

If you prefer environment variables over the login command:

```json
{
  "mcpServers": {
    "vizcom": {
      "command": "npx",
      "args": ["-y", "@vizcom/mcp-server"],
      "env": {
        "VIZCOM_AUTH_TOKEN": "<your-jwt>",
        "VIZCOM_ORGANIZATION_ID": "<your-org-id>",
        "VIZCOM_API_URL": "https://app.vizcom.ai/api/v1"
      }
    }
  }
}
```

## Available Tools

### Browsing
- **get_current_user** — Get your profile and organizations
- **list_teams** — List teams in your organization
- **list_folders** — Browse folders and workbenches
- **get_workbench** — Get workbench details and drawings
- **get_drawing** — Get drawing layers and generation history

### Creative
- **modify_image** — Modify an existing image with a text prompt (supports masks and pro quality)
- **render_sketch** — Turn a sketch into a photorealistic render
- **generate_image** — Generate an image from text alone

### Utility
- **get_generation_status** — Check on an in-progress generation
- **export_image** — Get the URL for a generated image
- **create_workbench** — Create a new workbench
