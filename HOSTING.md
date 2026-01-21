# 🌐 Hosting Guide for AudioPorter

This guide provides detailed instructions for deploying AudioPorter on various free hosting platforms.

## 📋 Prerequisites

Before deploying, make sure you have:
- A GitHub account
- Your AudioPorter code pushed to a GitHub repository
- Basic understanding of Git and command line (for some platforms)

## 🚀 Deployment Options

---

## 1. Render (Recommended) ⭐

**Best for**: Production use, reliable uptime
**Free Tier**: Yes (with auto-sleep after 15 min inactivity)
**WebSocket Support**: ✅ Yes

### Step-by-Step Deployment:

1. **Create Account**
   - Go to https://render.com
   - Sign up with GitHub (easiest option)

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the AudioPorter repository

3. **Configure Service**
   - **Name**: `audioporter` (or your choice)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Select "Free"

4. **Environment Variables** (Optional)
   - Add `PORT=3000` if needed (Render auto-assigns port)

5. **Deploy**
   - Click "Create Web Service"
   - Wait 2-5 minutes for deployment
   - Your app will be live at `https://audioporter-xxxx.onrender.com`

6. **Important Notes**
   - Free tier sleeps after 15 minutes of inactivity
   - First request after sleep takes ~30 seconds to wake up
   - Upgrade to paid plan ($7/month) for always-on service

---

## 2. Railway 🚂

**Best for**: Quick deployment, developer-friendly
**Free Tier**: $5 credit/month (no card required)
**WebSocket Support**: ✅ Yes

### Step-by-Step Deployment:

1. **Create Account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your AudioPorter repository

3. **Auto-Detection**
   - Railway automatically detects Node.js
   - No configuration needed!

4. **Get Your URL**
   - Go to "Settings" → "Domains"
   - Click "Generate Domain"
   - Your app is live!

5. **Monitor Usage**
   - Check your $5 monthly credit usage in dashboard
   - Typical usage: ~$2-3/month for moderate use

---

## 3. Cyclic 🔄

**Best for**: Serverless deployment, auto-scaling
**Free Tier**: Yes, generous limits
**WebSocket Support**: ✅ Yes

### Step-by-Step Deployment:

1. **Create Account**
   - Go to https://www.cyclic.sh
   - Sign in with GitHub

2. **Deploy Repository**
   - Click "Link Your Own"
   - Select your AudioPorter repository
   - Click "Connect"

3. **Automatic Deployment**
   - Cyclic automatically builds and deploys
   - No configuration needed

4. **Access Your App**
   - URL provided: `https://your-app.cyclic.app`
   - Deployment takes 1-2 minutes

5. **Features**
   - Auto-scales based on traffic
   - No sleep time (unlike Render free tier)
   - Unlimited deployments

---

## 4. Glitch 🎨

**Best for**: Quick prototyping, live editing
**Free Tier**: Yes, unlimited projects
**WebSocket Support**: ✅ Yes

### Step-by-Step Deployment:

1. **Create Account**
   - Go to https://glitch.com
   - Sign up (email or GitHub)

2. **Import from GitHub**
   - Click "New Project" → "Import from GitHub"
   - Paste your repository URL
   - Click "OK"

3. **Auto-Setup**
   - Glitch reads `package.json` and starts your app
   - Live at `https://your-project.glitch.me`

4. **Keep Alive** (Important!)
   - Free projects sleep after 5 minutes
   - Use a service like UptimeRobot (free) to ping your app every 5 minutes
   - Or upgrade to Glitch Pro ($8/month) for always-on

5. **Live Editing**
   - Edit code directly in browser
   - Changes auto-deploy instantly

---

## 5. Fly.io 🪰

**Best for**: Global deployment, low latency
**Free Tier**: 3 shared VMs (generous)
**WebSocket Support**: ✅ Yes

### Step-by-Step Deployment:

1. **Install Fly CLI**
   ```bash
   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex
   
   # Mac/Linux
   curl -L https://fly.io/install.sh | sh
   ```

2. **Sign Up**
   ```bash
   fly auth signup
   ```

3. **Navigate to Project**
   ```bash
   cd path/to/AudioPorter
   ```

4. **Launch App**
   ```bash
   fly launch
   ```
   - Answer prompts:
     - App name: `audioporter` (or your choice)
     - Region: Choose closest to you
     - Database: No
     - Deploy now: Yes

5. **Access Your App**
   - URL: `https://audioporter.fly.dev`
   - Deployment takes 2-3 minutes

6. **Future Deployments**
   ```bash
   fly deploy
   ```

---

## 6. Vercel (Static + External Signaling) ⚡

**Best for**: Static frontend hosting
**Free Tier**: Yes, unlimited
**WebSocket Support**: ❌ Limited (use external server)

### Setup:

1. **Deploy Frontend**
   - Go to https://vercel.com
   - Import GitHub repository
   - Deploy `public` folder as static site

2. **Use External Signaling Server**
   - Deploy signaling server (`server.js`) on Render/Railway
   - Update `app.js` to point to external server:
     ```javascript
     const DEFAULT_SERVER = 'your-signaling-server.onrender.com';
     ```

3. **Best of Both Worlds**
   - Ultra-fast static hosting on Vercel
   - Reliable WebSocket on Render/Railway

---

## 🔧 Configuration Tips

### Environment Variables

Most platforms support environment variables. Add these if needed:

```
PORT=3000
NODE_ENV=production
```

### Custom Domain

All platforms support custom domains:
1. Buy domain from Namecheap, Google Domains, etc.
2. Add CNAME record pointing to your hosting URL
3. Configure in hosting platform's domain settings

### SSL/HTTPS

All platforms provide free SSL certificates automatically!

---

## 📊 Comparison Table

| Platform | Free Tier | Sleep Time | WebSocket | Ease of Use | Best For |
|----------|-----------|------------|-----------|-------------|----------|
| **Render** | ✅ Yes | 15 min | ✅ Yes | ⭐⭐⭐⭐ | Production |
| **Railway** | $5/mo credit | None | ✅ Yes | ⭐⭐⭐⭐⭐ | Quick deploy |
| **Cyclic** | ✅ Yes | None | ✅ Yes | ⭐⭐⭐⭐ | Serverless |
| **Glitch** | ✅ Yes | 5 min | ✅ Yes | ⭐⭐⭐⭐⭐ | Prototyping |
| **Fly.io** | ✅ Yes (3 VMs) | None | ✅ Yes | ⭐⭐⭐ | Global apps |
| **Vercel** | ✅ Yes | None | ❌ No | ⭐⭐⭐⭐⭐ | Static only |

---

## 🛡️ Security Considerations

### For Production Use:

1. **Use HTTPS** (all platforms provide this)
2. **Add Rate Limiting** to prevent abuse
3. **Implement Authentication** if needed
4. **Monitor Usage** to stay within free tier limits

### Example: Add Rate Limiting

```javascript
// In server.js
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
```

---

## 🔍 Monitoring & Uptime

### Free Uptime Monitoring:

1. **UptimeRobot** (https://uptimerobot.com)
   - Free plan: 50 monitors
   - Ping your app every 5 minutes
   - Prevents sleep on Glitch/Render

2. **Freshping** (https://www.freshworks.com/website-monitoring/)
   - Free plan: 50 checks
   - Email alerts on downtime

3. **StatusCake** (https://www.statuscake.com)
   - Free plan: 10 monitors
   - Global monitoring locations

---

## 💡 Pro Tips

1. **Use Railway or Cyclic** for no sleep time on free tier
2. **Use Render + UptimeRobot** for reliable free hosting
3. **Deploy to multiple platforms** for redundancy
4. **Use environment variables** for configuration
5. **Enable auto-deploy** from GitHub for easy updates

---

## 🆘 Troubleshooting

### "Application Error" on Render
- Check build logs in Render dashboard
- Ensure `package.json` has correct start script
- Verify Node version compatibility

### WebSocket Connection Failed
- Ensure platform supports WebSocket (all listed do)
- Check if using `wss://` for HTTPS sites
- Verify firewall/network settings

### App Sleeping Too Often
- Use UptimeRobot to ping every 5 minutes
- Or upgrade to paid plan ($7-10/month)
- Consider Railway (no sleep with free credits)

---

## 📞 Need Help?

- Check platform documentation
- Join platform Discord/Slack communities
- Open issue on AudioPorter GitHub

---

**Happy Hosting! 🚀**
