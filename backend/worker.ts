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
import { WorkersProviderRegistry } from "./providers/workers-registry.ts";
import { globalImageHandler } from "./utils/imageHandling.ts";
import { handleChatRequest } from "./handlers/workers-chat.ts";
import { handleMultiAgentChatRequest } from "./handlers/workers-multi-agent.ts";
import { handleAbortRequest } from "./handlers/abort.ts";
import type { AppConfig } from "./types.ts";

// Create Workers-specific registry instance (no Claude Code provider)
const workersRegistry = new WorkersProviderRegistry();

// Export for handlers to use - they expect "globalRegistry"
export { workersRegistry as globalRegistry };

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

/**
 * Initialize Workers-specific provider registry
 * Only includes API-based providers (no local Claude Code)
 */
function initializeWorkersRegistry(env: Env): void {
  if (workersRegistry.isInitialized()) {
    return;
  }

  try {
    // Initialize providers with API keys
    workersRegistry.initializeProviders({
      openaiApiKey: env.OPENAI_API_KEY,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
    });

    // Create default agents
    workersRegistry.createDefaultAgents();

    console.log("[Workers] Initialized with agents:",
      workersRegistry.getAllAgents().map(a => ({ id: a.id, provider: a.provider }))
    );

    workersRegistry.markAsInitialized();
  } catch (error) {
    console.error("[Workers] Failed to initialize:", error);
  }
}

// Workers export
export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    // Initialize on first request
    initializeWorkersRegistry(env);

    // Initialize image handler
    if (env.OPENAI_API_KEY) {
      await globalImageHandler.initialize().catch(error => {
        console.warn("Failed to initialize image handler:", error);
      });
    }

    // Store env in request for handlers
    return app.fetch(request, { ...env });
  },
};
