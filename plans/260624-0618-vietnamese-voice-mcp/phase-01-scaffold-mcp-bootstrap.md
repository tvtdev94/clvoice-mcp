---
phase: 1
title: Scaffold & MCP bootstrap
status: completed
priority: P1
dependencies: []
effort: S
---

# Phase 1: Scaffold & MCP bootstrap

## Overview
Dựng project TypeScript ESM + MCP server stdio chạy được, đăng ký 1 tool placeholder để verify Claude Code nhận tool.

## Requirements
- Functional: `node dist/index.js` khởi động MCP server qua stdio, expose tool `voice_listen` (tạm trả stub) để verify kết nối.
- Non-functional: TS strict, ESM, build bằng `tsc`, Node ≥ 18.

## Architecture
```
clvoice-mcp/
├── src/
│   └── index.ts          # McpServer bootstrap + StdioServerTransport + đăng ký tool (stub)
├── package.json          # type: module, bin, scripts (build/start)
├── tsconfig.json         # ESM, strict, outDir dist
└── .gitignore
```
- `@modelcontextprotocol/sdk`: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"`, `import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"`.
- `zod` cho inputSchema.

## Related Code Files
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/index.ts`

## Implementation Steps
1. `npm init -y`; set `"type": "module"`, `"bin": { "clvoice-mcp": "dist/index.js" }`, scripts: `build: "tsc"`, `start: "node dist/index.js"`.
2. Cài deps: `@modelcontextprotocol/sdk`, `zod`, `@google/genai` (chuẩn bị cho Phase 3); devDeps: `typescript`, `@types/node`.
3. `tsconfig.json`: `target ES2022`, `module NodeNext`, `moduleResolution NodeNext`, `strict true`, `outDir dist`, `rootDir src`.
4. `src/index.ts`: tạo `McpServer({name:"clvoice-mcp", version:"0.1.0"})`, đăng ký `voice_listen` stub (`inputSchema: z.object({ seconds: z.number().optional(), language: z.string().optional() })`) trả `{ content:[{type:"text", text:"stub"}] }`, connect `StdioServerTransport`. Thêm shebang `#!/usr/bin/env node`.
5. `npm run build` → verify `dist/index.js` tồn tại, không lỗi tsc.

## Success Criteria
- [ ] `npm run build` chạy sạch, sinh `dist/index.js`.
- [ ] Server khởi động qua stdio không crash.
- [ ] Tool `voice_listen` (stub) đăng ký thành công.

## Risk Assessment
- ESM + NodeNext import phải có đuôi `.js` trong import nội bộ → tuân thủ ngay từ đầu.
- Mitigation: giữ import path đúng chuẩn NodeNext.
