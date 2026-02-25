# @vizcom/mcp-server

MCP server for [Vizcom](https://vizcom.ai) — connect your AI assistant to Vizcom's creative design tools.

## Setup

### 1. Authenticate

```bash
npx @vizcom/mcp-server login
```

Enter your Vizcom email and password. If you signed up with Google/SSO, you'll need to set a password first via https://app.vizcom.ai/forgot-password.

### 2. Configure your MCP client

**Claude Desktop / Claude Code:**

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

**With environment variables (advanced):**

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

## Examples

> "Show me my recent workbenches"

> "Take this sketch and render it as a modern desk lamp in white ceramic"

> "Modify this design — make the handle more ergonomic and add a matte black finish"

> "Generate 4 concept variations of a minimalist desk lamp"
