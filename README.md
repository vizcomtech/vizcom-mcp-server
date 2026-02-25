# @vizcom/mcp-server

MCP server for [Vizcom](https://vizcom.ai) — connect your AI assistant to Vizcom's creative design tools.

## Quick Start

### Step 1: Log in to your Vizcom account

```bash
npx @vizcom/mcp-server login
```

You'll be prompted for your email and password. That's it — your credentials are saved locally.

> **Signed up with Google/SSO?** You'll need to set a password first:
> go to https://app.vizcom.com/forgot-password, enter your email, and set a password.

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
- "Modify this render — try 4 different color options"

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
        "VIZCOM_API_URL": "https://app.vizcom.com/api/v1"
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

> **Note:** Vizcom is image-to-image — you always need a source image (sketch, photo, or blank canvas) to get started. You can upload one with `create_drawing` or draw in the Vizcom UI.

- **modify_image** — Modify an existing image with a text prompt (supports masks and pro quality)
- **render_sketch** — Turn a sketch into a photorealistic render (requires a style, defaults to "generalV2")
- **list_styles** — List available rendering styles
- **get_drawing_image** — Download a drawing's image as base64 (needed to iterate: get result → modify → repeat)

### Utility
- **get_generation_status** — Check on an in-progress generation
- **export_image** — Get the full CDN URL for any image
- **create_workbench** — Create a new workbench
- **create_drawing** — Upload an image or place a generated result as a new drawing on a workbench
