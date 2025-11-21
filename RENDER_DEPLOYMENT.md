# Render Deployment Guide - Full Claude Code Backend

Deploy your Agentrooms backend with **complete Claude Code functionality** on Render's free tier.

## Why Render Over Cloudflare Workers?

| Feature | Cloudflare Workers | Render Free |
|---------|-------------------|-------------|
| Claude Code SDK | ❌ Not supported | ✅ **Full support** |
| File system | ❌ No | ✅ Yes |
| Tool use (Read/Write/Bash) | ❌ No | ✅ Yes |
| Cost | Free | Free |
| Cold start | Instant | ~30 sec |

## Quick Start

### 1. Push to GitHub

```bash
git add render.yaml RENDER_DEPLOYMENT.md
git commit -m "add Render deployment config"
git push origin main
```

### 2. Deploy on Render

1. Go to https://render.com/ and sign up (free)
2. Click **New +** → **Web Service**
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` ✨
5. Click **Create Web Service**

### 3. Add API Key

In Render dashboard:
1. Go to your service → **Environment** tab
2. Add secret:
   - Key: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-...` (your key)

### 4. Your Backend is Live!

URL: `https://agentrooms-api-XXXX.onrender.com`

Test it:
```bash
curl https://your-app.onrender.com/api/health
```

### 5. Update Frontend

Edit `frontend/src/config/api.ts`:
```typescript
const baseUrl = orchestratorEndpoint || "https://your-app.onrender.com";
```

Redeploy frontend on Cloudflare Pages.

## What You Get

✅ **Full Claude Code SDK** - All tools work
✅ **Multi-agent orchestration** - Complete functionality  
✅ **Conversation history** - File system access
✅ **Auto-deploy** - Push to main → auto-deploys
✅ **SSL/HTTPS** - Built-in
✅ **Free** - 750 hours/month

## Free Tier Limitations

- **Spins down** after 15 min inactivity
- **Restarts** in ~30 seconds on next request
- **Ephemeral storage** - Conversations may not persist between restarts

**For production**: Upgrade to $7/month for always-on + persistent disk.

## Manual Configuration (if needed)

If auto-detection fails:

**Build Command**:
```bash
cd backend && npm install && npm run build
```

**Start Command**:
```bash
cd backend && npm start
```

**Environment Variables**:
- `PORT`: `8080`
- `HOST`: `0.0.0.0`
- `NODE_ENV`: `production`
- `ANTHROPIC_API_KEY`: (your key)

## Troubleshooting

**Build fails**: Check Logs tab in Render dashboard

**Cold start slow**: Normal on free tier (first request after spin-down)

**Environment variables not working**: Set in Render dashboard, not in code

## Documentation

Full guide: [./DEPLOYMENT.md](./DEPLOYMENT.md)
Render docs: https://render.com/docs
