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
- "Generate a 3D model from this drawing"
- "Generate a turntable video of this product"
- "Upscale this render to 4x resolution"
- "Convert this 3D model to STL for printing"

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

- **modify_image** — Modify an existing image with a text prompt (source image fetched automatically from the drawing)
- **render_sketch** — Turn a sketch into a photorealistic render (source image fetched automatically, style defaults to "generalV2")
- **accept_result** — Apply a generation result to the source drawing (like clicking "Add" in the UI)
- **list_styles** — List available rendering styles

### Video
- **generate_video** — Generate a video from a drawing (turntable, motion, animation) using Kling, VEO2/3, or PixVerse

### 3D Models
- **generate_3d_model** — Generate a 3D model (GLB) from a drawing's image (basic/detailed_sharp/detailed_smooth/max quality)
- **convert_mesh_format** — Convert a 3D model to FBX, OBJ, STL (3D printing), or USDZ (Apple AR)
- **get_3d_status** — Check 3D generation progress and get mesh URLs for completed models
- **export_3d_model** — Get the full CDN URL for a 3D model file

### Enhancement
- **upscale_image** — AI upscale a drawing's image to 2x or 4x resolution (max 10,000px per side)

### Utility
- **get_drawing_image** — Get a drawing's CDN image URL and metadata
- **get_generation_status** — Check on an in-progress generation
- **export_image** — Get the full CDN URL for any image path
- **create_workbench** — Create a new workbench in a folder
- **create_drawing** — Upload an image or place a generated result as a new drawing on a workbench
