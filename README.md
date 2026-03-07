# @vizcom/mcp-server

MCP server for [Vizcom](https://www.vizcom.com) — connect AI assistants to Vizcom's creative design tools via the [Model Context Protocol](https://modelcontextprotocol.io).

Lets LLM agents render sketches, modify images, generate 3D models, create videos, upscale images, and manage workbenches — all through natural language.

## Requirements

- **Node.js 20+**
- A **Vizcom account** with email/password authentication
- An MCP-compatible client: [Claude Desktop](https://claude.ai/download), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.sh), or any MCP client

> **SSO users:** If you signed up with Google or SSO, you'll need to set a password first at https://app.vizcom.com/forgot-password

## Quick Start

### 1. Log in

```bash
npx @vizcom/mcp-server login
```

You'll be prompted for your email and password. Credentials are saved locally to `~/.vizcom/credentials.json` (file permissions: owner-only read/write).

### 2. Connect to your AI client

**Claude Code:**

```bash
claude mcp add vizcom -- npx @vizcom/mcp-server
```

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

**Cursor** — add the same config in Settings > MCP Servers.

### 3. Start designing

Ask your AI assistant:

- *"Show me my Vizcom workbenches"*
- *"Render this sketch as a modern desk lamp in white ceramic"*
- *"Modify this design — try 4 color variations"*
- *"Generate a 3D model from this drawing"*
- *"Create a turntable video of this product"*
- *"Upscale this render to 4x resolution"*
- *"Convert this 3D model to STL for 3D printing"*

## Tools (20)

### Browsing

| Tool | Description |
|------|-------------|
| `get_current_user` | Get your profile and organizations |
| `list_teams` | List teams in your organization |
| `list_folders` | Browse folders and workbenches (paginated) |
| `get_workbench` | Get workbench details and its drawings |
| `get_drawing` | Get drawing layers and generation history |

### Rendering

| Tool | Description |
|------|-------------|
| `render_sketch` | Turn a sketch into a photorealistic render. Supports style presets, influence control, and 1-4 output variations |
| `list_styles` | List available rendering style presets |

### Editing

| Tool | Description |
|------|-------------|
| `modify_image` | Modify an existing image with a text prompt. Supports optional mask for targeted edits and 1-4 output variations |

### 3D Models

| Tool | Description |
|------|-------------|
| `generate_3d_model` | Generate a 3D model (GLB) from a drawing. Quality: basic / detailed_sharp / detailed_smooth / max |
| `get_3d_status` | Check 3D generation progress and get mesh URLs |
| `export_3d_model` | Get CDN download URL for a 3D model file |
| `convert_mesh_format` | Convert a 3D model to FBX, OBJ, STL, or USDZ |

### Video

| Tool | Description |
|------|-------------|
| `generate_video` | Generate video from a drawing — Kling v1.6/v2.5, VEO2, VEO3, or PixVerse turntable. 5 or 10 seconds |

### Enhancement

| Tool | Description |
|------|-------------|
| `upscale_image` | AI upscale to 2x or 4x resolution (max 10,000px per side) |

### Utility

| Tool | Description |
|------|-------------|
| `get_drawing_image` | Get a drawing's CDN image URL and metadata |
| `get_generation_status` | Check on an in-progress generation |
| `export_image` | Get CDN URL for any image path |
| `create_workbench` | Create a new workbench in a folder |
| `create_drawing` | Upload an image or place a generated result as a new drawing |
| `accept_result` | Apply a generation result to the source drawing (like clicking "Add" in the UI) |

## Advanced Configuration

### Environment variables

For CI, automation, or cases where the login command isn't practical:

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

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VIZCOM_AUTH_TOKEN` | Yes (if no login) | — | JWT auth token |
| `VIZCOM_ORGANIZATION_ID` | Yes (if no login) | — | Organization UUID |
| `VIZCOM_API_URL` | No | `https://app.vizcom.com/api/v1` | API endpoint |

### Install from GitHub

If the npm package isn't available in your environment, install directly from GitHub:

```bash
npx github:vizcomtech/vizcom-mcp-server
```

Or clone and build locally:

```bash
git clone https://github.com/vizcomtech/vizcom-mcp-server.git
cd vizcom-mcp-server
npm install
npm run build
node dist/index.js login
```

Then point your MCP client at the local build:

```json
{
  "mcpServers": {
    "vizcom": {
      "command": "node",
      "args": ["/path/to/vizcom-mcp-server/dist/index.js"]
    }
  }
}
```

## Security

- **Credentials** are stored in `~/.vizcom/credentials.json` with `0600` permissions (owner read/write only)
- **Authentication** uses JWT tokens issued by the Vizcom API. Tokens are long-lived but will expire — re-run `login` if you see authentication errors
- **No data leaves Vizcom** — the MCP server talks directly to `app.vizcom.com`. It does not proxy through third-party services
- **Organization-scoped** — all operations are scoped to the organization selected during login. Users can only access workbenches and drawings they have permission to view in Vizcom

## Network Requirements

For enterprise environments with firewall restrictions, allow outbound HTTPS (443) to:

| Host | Purpose |
|------|---------|
| `app.vizcom.com` | API requests |
| `storage.vizcom.com` | Image and 3D model CDN |
| `registry.npmjs.org` | Package installation (one-time) |

## Troubleshooting

**"Not authenticated" error**
Run `npx @vizcom/mcp-server login` to re-authenticate.

**"Your session has expired"**
JWT token has expired. Re-run the login command.

**SSO/Google users can't log in**
The MCP server uses email/password auth. Set a password at https://app.vizcom.com/forgot-password first.

**Generation times out**
3D models (especially high quality) and videos can take 1-5 minutes. The server polls automatically, but very long generations may hit the timeout. Use `get_3d_status` or `get_generation_status` to check progress manually.

**"File not available" after generation**
The generated file may still be uploading to CDN. Wait a moment and retry with `export_image` or `export_3d_model`.

## How It Works

The MCP server communicates with Vizcom's GraphQL API using persisted queries (pre-registered operation hashes). It authenticates as your user account and has the same permissions you do in the Vizcom UI.

```
AI Client (Claude/Cursor)  <-->  MCP Server (local)  <-->  Vizcom API (app.vizcom.com)
                                      |
                                 ~/.vizcom/credentials.json
```

All image generation, 3D modeling, and video generation happens server-side on Vizcom's infrastructure. The MCP server submits jobs and polls for results — no GPU or heavy compute is needed locally.
