# Cloudflare Workers Deployment Guide

This guide explains how to deploy the Agentrooms backend to Cloudflare Workers.

## Prerequisites

1. Cloudflare account (free tier is sufficient to start)
2. Wrangler CLI installed (already added to devDependencies)
3. API keys for AI providers:
   - Anthropic API key (required for orchestrator functionality)
   - OpenAI API key (optional, for OpenAI-based agents)

## Architecture

### Deployed Components
- **Backend API**: Cloudflare Workers (this deployment)
- **Frontend**: Cloudflare Pages (already deployed)

### Workers Limitations
The Workers deployment focuses on API-based chat functionality only:
- ✅ Chat API endpoints (`/api/chat`, `/api/multi-agent-chat`)
- ✅ Anthropic API provider (for orchestrator)
- ✅ OpenAI API provider (for specialized agents)
- ✅ Health check endpoint
- ❌ Local file system operations (history, projects)
- ❌ Local Claude CLI execution

## Setup Steps

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

This will open your browser for authentication.

### 3. Configure Environment Variables

Set your API keys as Cloudflare secrets:

```bash
# Set Anthropic API key (required for orchestrator)
npx wrangler secret put ANTHROPIC_API_KEY
# When prompted, paste your Anthropic API key

# Set OpenAI API key (optional)
npx wrangler secret put OPENAI_API_KEY
# When prompted, paste your OpenAI API key
```

### 4. Test Locally

Run the Workers development server:

```bash
npm run workers:dev
```

This starts a local server at `http://localhost:8787`

Test the health endpoint:
```bash
curl http://localhost:8787/api/health
```

### 5. Deploy to Staging

Deploy to the staging environment first:

```bash
npm run workers:deploy:staging
```

After deployment, Wrangler will display your Worker URL, e.g.:
```
https://agentrooms-api-staging.your-subdomain.workers.dev
```

Test the deployed endpoint:
```bash
curl https://agentrooms-api-staging.your-subdomain.workers.dev/api/health
```

### 6. Deploy to Production

Once staging is verified, deploy to production:

```bash
npm run workers:deploy:production
```

### 7. Update Frontend Configuration

Update the frontend to use your new backend URL:

1. Open `frontend/src/config/api.ts`
2. Update the `baseUrl` in the `getApiUrl` function:
   ```typescript
   const baseUrl = orchestratorEndpoint || "https://agentrooms-api.your-subdomain.workers.dev";
   ```

3. Rebuild and redeploy the frontend on Cloudflare Pages

## Monitoring and Debugging

### View Logs

Watch real-time logs from your Worker:

```bash
npm run workers:tail
```

### Check Deployment Status

List your Workers:

```bash
npx wrangler deployments list
```

### Rollback (if needed)

Rollback to a previous deployment:

```bash
npx wrangler rollback
```

## Configuration

### wrangler.toml

The `wrangler.toml` file in the project root contains:
- Worker name and entry point
- Environment configurations (dev, staging, production)
- Build settings

Key settings:
```toml
name = "agentrooms-api"
main = "backend/worker.ts"
compatibility_date = "2024-01-01"
node_compat = true
```

### Environment Variables

Available environment variables in Workers:
- `DEBUG_MODE`: Set to "true" for verbose logging
- `ANTHROPIC_API_KEY`: Your Anthropic API key (secret)
- `OPENAI_API_KEY`: Your OpenAI API key (secret)

## Testing the Deployment

### 1. Health Check

```bash
curl https://your-worker-url.workers.dev/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-20T...",
  "service": "agentrooms-workers",
  "version": "0.1.41",
  "environment": "cloudflare-workers"
}
```

### 2. Chat API Test

```bash
curl -X POST https://your-worker-url.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, how are you?",
    "requestId": "test-123"
  }'
```

## Costs

Cloudflare Workers pricing:
- **Free tier**: 100,000 requests/day
- **Paid tier**: $5/month + $0.50 per million requests

For most development use cases, the free tier is sufficient.

## Troubleshooting

### "Module not found" errors

Ensure all imports use relative paths with `.ts` extensions:
```typescript
import { foo } from "./bar.ts"; // ✅ Correct
import { foo } from "./bar";    // ❌ Wrong
```

### "Global is not defined" errors

Add to `wrangler.toml`:
```toml
node_compat = true
```

### CORS errors from frontend

Check that CORS headers are properly set in `worker.ts`. The current configuration allows all origins (`*`).

### API key not working

Verify secrets are set correctly:
```bash
npx wrangler secret list
```

To update a secret:
```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

## Next Steps

1. Configure custom domain (optional)
2. Set up CI/CD pipeline for automatic deployments
3. Configure rate limiting for production use
4. Monitor usage in Cloudflare dashboard

## Support

For issues:
- GitHub Issues: https://github.com/sugyan/claude-code-webui/issues
- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
