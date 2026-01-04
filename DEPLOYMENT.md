# Deployment Guide

This guide covers deploying the Video Chat Application to various platforms.

## Quick Deploy Options

### 1. Render (Recommended - Free Tier Available)

Render is a great option with a free tier for web services.

#### Steps:

1. **Create a GitHub repository** and push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Sign up/Login to Render**: Go to [render.com](https://render.com)

3. **Create a New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: videochat-app (or your preferred name)
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Plan**: Free (or paid for better performance)
   - Click "Create Web Service"

4. **Your app will be deployed** at: `https://your-app-name.onrender.com`

**Note**: Free tier services spin down after 15 minutes of inactivity, but will wake up when accessed.

---

### 2. Railway

Railway offers easy deployment with a generous free tier.

#### Steps:

1. **Install Railway CLI** (optional but recommended):
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **Deploy via Railway Dashboard**:
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your repository
   - Railway will auto-detect Node.js and deploy

3. **Or deploy via CLI**:
   ```bash
   railway init
   railway up
   ```

Your app will be available at a Railway-provided URL.

---

### 3. Vercel

Vercel supports Node.js backends with serverless functions, but for Socket.io, you may need Vercel Pro.

#### Steps:

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **For production**:
   ```bash
   vercel --prod
   ```

**Note**: Socket.io requires persistent connections. Consider using Vercel Pro or alternative platforms for WebSocket support.

---

### 4. Heroku

Heroku requires a credit card even for free tier (no charges for free tier usage).

#### Steps:

1. **Install Heroku CLI**: Download from [heroku.com/cli](https://devcenter.heroku.com/articles/heroku-cli)

2. **Login and create app**:
   ```bash
   heroku login
   heroku create your-app-name
   ```

3. **Deploy**:
   ```bash
   git push heroku main
   ```

4. **Open your app**:
   ```bash
   heroku open
   ```

---

### 5. Docker Deployment

Deploy anywhere Docker is supported (DigitalOcean, AWS EC2, Azure, etc.).

#### Build and Run Locally:

```bash
# Build the image
docker build -t videochat-app .

# Run the container
docker run -p 3000:3000 videochat-app
```

#### Deploy to Docker Hub:

```bash
# Tag your image
docker tag videochat-app yourusername/videochat-app

# Push to Docker Hub
docker push yourusername/videochat-app
```

#### Deploy to DigitalOcean App Platform:

1. Push code to GitHub
2. Go to DigitalOcean → Create App
3. Connect GitHub repository
4. Select Dockerfile option
5. Deploy

---

## Environment Variables

You can set environment variables on most platforms:

- `PORT`: Server port (usually auto-set by platform, defaults to 3000)
- `NODE_ENV`: Set to `production` in production

---

## Post-Deployment Checklist

- [ ] Test video/audio functionality
- [ ] Test chat functionality
- [ ] Test room creation and joining
- [ ] Verify HTTPS is enabled (required for camera/microphone access)
- [ ] Check that WebSocket connections are working
- [ ] Test on multiple browsers
- [ ] Test with multiple users simultaneously

---

## Important Notes

### HTTPS Requirement
Modern browsers require HTTPS to access camera and microphone. Most deployment platforms provide HTTPS by default, but ensure your deployment URL uses HTTPS.

### WebSocket Support
Socket.io requires WebSocket support. Most modern platforms support this, but verify:
- Render: ✅ Supports WebSockets
- Railway: ✅ Supports WebSockets
- Vercel: ⚠️ Requires Pro plan for WebSockets
- Heroku: ✅ Supports WebSockets
- Docker: ✅ Depends on hosting platform

### STUN/TURN Servers
The app uses public STUN servers (Google's). For production with users behind restrictive NATs, consider:
- Adding TURN servers for better connectivity
- Using services like Twilio, Xirsys, or custom TURN servers

### Scaling Considerations
- Current implementation stores rooms in memory (volatile)
- For production scaling, consider:
  - Redis for room/state management
  - Database for persistent storage
  - Multiple server instances with Socket.io adapter (Redis adapter)

---

## Troubleshooting Deployment

### Connection Issues
- Verify WebSocket support on your platform
- Check firewall settings
- Ensure HTTPS is enabled

### Build Failures
- Check Node.js version compatibility (requires Node 14+)
- Verify all dependencies are listed in `package.json`
- Check build logs for specific errors

### Runtime Errors
- Check platform logs
- Verify PORT environment variable
- Ensure static files are being served correctly

---

## Recommended Platforms by Use Case

- **Free/Personal Projects**: Render (free tier) or Railway
- **Production Apps**: Render (paid) or Railway (paid)
- **Enterprise**: AWS, Google Cloud, or Azure with Docker
- **Development/Testing**: Local deployment or Railway free tier

