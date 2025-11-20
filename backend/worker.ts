/**
 * Cloudflare Workers entry point for Agentrooms API
 *
 * This module adapts the Hono application to work with Cloudflare Workers.
 * Note: Features requiring local file system access (history, projects) are disabled.
 * Only API-based chat functionality (Anthropic, OpenAI providers) is available.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { globalRegistry } from "./providers/registry.ts";
import { globalImageHandler } from "./utils/imageHandling.ts";
import { handleChatRequest } from "./handlers/chat.ts";
import { handleMultiAgentChatRequest } from "./handlers/multiAgentChat.ts";
import { handleAbortRequest } from "./handlers/abort.ts";
import type { AppConfig } from "./types.ts";

// Store AbortControllers for each request
const requestAbortControllers = new Map<string, AbortController>();

// Create Hono app with environment typing
type Env = {
  DEBUG_MODE?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

type Variables = {
  config: AppConfig;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Enhanced CORS middleware for Workers
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With"
    ],
    maxAge: 600,
    credentials: false,
  }),
);

// Error handling middleware with CORS headers
app.onError((error, c) => {
  console.error('Worker Error:', error);

  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  return c.json(
    {
      error: 'Internal Server Error',
      message: error.message
    },
    500
  );
});

// Configuration middleware for Workers
app.use("*", createMiddleware(async (c, next) => {
  // Create a minimal config for Workers environment
  const config: AppConfig = {
    debugMode: c.env?.DEBUG_MODE === 'true' || false,
    runtime: null as any, // No runtime for Workers (API-only mode)
    claudePath: '', // No local Claude CLI in Workers
  };

  c.set('config', config);
  await next();
}));

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the current status of the Agentrooms Workers API
 */
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "agentrooms-workers",
    version: "0.1.41",
    environment: "cloudflare-workers"
  });
});

/**
 * @swagger
 * /api/abort/{requestId}:
 *   post:
 *     summary: Abort ongoing chat request
 */
app.post("/api/abort/:requestId", (c) =>
  handleAbortRequest(c, requestAbortControllers),
);

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: Main chat endpoint for Claude Code SDK integration
 *     description: Sends messages to configured AI providers (Anthropic, OpenAI)
 */
app.post("/api/chat", (c) => handleChatRequest(c, requestAbortControllers));

/**
 * @swagger
 * /api/multi-agent-chat:
 *   post:
 *     summary: Multi-agent chat endpoint
 *     description: Handles orchestrated conversations between multiple agents
 */
app.post("/api/multi-agent-chat", (c) =>
  handleMultiAgentChatRequest(c, requestAbortControllers)
);

// Explicit preflight OPTIONS handler
app.options("*", (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  c.header('Access-Control-Max-Age', '600');
  return new Response('', { status: 204 });
});

// Catch-all for undefined routes
app.all("*", (c) => {
  return c.json(
    {
      error: "Not Found",
      message: "The requested endpoint does not exist",
      path: c.req.path
    },
    404
  );
});

// Workers export
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // Initialize multi-agent system on first request
    if (!globalRegistry.isInitialized()) {
      try {
        // Initialize image handler
        await globalImageHandler.initialize().catch(error => {
          console.warn("Failed to initialize image handler:", error);
        });

        // Initialize providers with environment variables
        globalRegistry.initializeDefaultProviders({
          openaiApiKey: env.OPENAI_API_KEY,
          anthropicApiKey: env.ANTHROPIC_API_KEY,
          claudePath: null, // No local Claude CLI in Workers
        });

        // Create default agents
        globalRegistry.createDefaultAgents();

        console.log("[Workers] Initialized with agents:",
          globalRegistry.getAllAgents().map(a => ({ id: a.id, provider: a.provider }))
        );

        globalRegistry.markAsInitialized();
      } catch (error) {
        console.error("[Workers] Failed to initialize:", error);
      }
    }

    // Store env in request for handlers
    return app.fetch(request, { ...env });
  },
};
