# AudioPorter - Seamless Audio Streaming

Stream high-quality audio from your PC to your phone with low latency using WebRTC.

## 🚀 Features

- **Real-time Audio Streaming**: Low-latency WebRTC-based audio streaming
- **Cross-Platform**: Works on Windows, Mac, Linux (PC) and Android/iOS (Mobile)
- **Easy Setup**: Simple step-by-step onboarding for both PC and mobile users
- **Background Streaming**: Android foreground service keeps audio playing even when app is in background
- **Audio Source Selection**: Choose which audio input to stream from your PC
- **Volume Control**: Adjust volume on the receiving device

## 📱 How to Use

### For PC Users (Sender)

1. **Open AudioPorter** in your browser
2. Click on **"PC / Sender"**
3. **Click the help button (💡)** to see detailed setup instructions
4. Find your PC's IP address:
   - **Windows**: Press `Win + R`, type `cmd`, press Enter, then type `ipconfig`
   - **Mac**: Open Terminal and type `ifconfig | grep inet`
   - **Linux**: Open Terminal and type `ip addr show`
   - Look for "IPv4 Address" - it usually starts with `192.168.x.x`
5. Share this IP address with your phone
6. Wait for your phone to connect (you'll see a confirmation popup)
7. Select your audio source and click **"Start Audio Stream"**

### For Mobile Users (Receiver)

1. **Open AudioPorter** on your phone
2. Click on **"Phone / Receiver"**
3. **Click the help button (💡)** to see detailed setup instructions
4. Make sure you're on the **same Wi-Fi network** as your PC
5. Enter your PC's IP address in the input field
6. Click **"Connect to IP"**
7. Once connected, tap on your PC from the list to start streaming
8. Adjust volume using the slider

## 🌐 Hosting Options (Free & No Card Required)

Here are several free hosting platforms where you can deploy AudioPorter:

### 1. **Render** (Recommended)
- **URL**: https://render.com
- **Free Tier**: Yes, with automatic sleep after inactivity
- **Pros**: Easy deployment, supports WebSocket, auto-deploys from GitHub
- **Cons**: Free tier sleeps after 15 minutes of inactivity
- **Setup**:
  1. Create account on Render
  2. Connect your GitHub repository
  3. Create a new "Web Service"
  4. Set build command: `npm install`
  5. Set start command: `node server.js`
  6. Deploy!

### 2. **Railway**
- **URL**: https://railway.app
- **Free Tier**: $5 free credit per month (no card required initially)
- **Pros**: Very easy setup, great for Node.js apps, supports WebSocket
- **Cons**: Limited free credits
- **Setup**:
  1. Sign up with GitHub
  2. Click "New Project" → "Deploy from GitHub repo"
  3. Select your AudioPorter repository
  4. Railway auto-detects Node.js and deploys

### 3. **Cyclic**
- **URL**: https://www.cyclic.sh
- **Free Tier**: Yes, generous free tier
- **Pros**: Unlimited apps, serverless, auto-scaling
- **Cons**: May have cold starts
- **Setup**:
  1. Sign in with GitHub
  2. Click "Link Your Own" → Select repository
  3. Deploy automatically

### 4. **Glitch**
- **URL**: https://glitch.com
- **Free Tier**: Yes, unlimited projects
- **Pros**: Live code editing, instant deployment, great for prototyping
- **Cons**: Projects sleep after 5 minutes of inactivity
- **Setup**:
  1. Create account
  2. Click "New Project" → "Import from GitHub"
  3. Paste your repository URL
  4. Glitch automatically runs your app

### 5. **Fly.io**
- **URL**: https://fly.io
- **Free Tier**: Yes, generous free tier (3 shared VMs)
- **Pros**: Global deployment, supports WebSocket, very fast
- **Cons**: Requires CLI installation
- **Setup**:
  1. Install Fly CLI: `npm install -g flyctl`
  2. Sign up: `fly auth signup`
  3. In your project directory: `fly launch`
  4. Deploy: `fly deploy`

### 6. **Vercel** (For Static Hosting Only)
- **URL**: https://vercel.com
- **Free Tier**: Yes, unlimited projects
- **Pros**: Extremely fast, great for static sites
- **Cons**: Serverless functions have limitations for WebSocket
- **Note**: You'll need to use an external signaling server (like the one on Render)

## 🔒 Privacy & Security

- **Local Network**: Works best on the same Wi-Fi network
- **No Data Collection**: All streaming happens peer-to-peer via WebRTC
- **Secure**: Uses STUN servers only for connection establishment
- **Open Source**: All code is visible and auditable

## 🛠️ Technical Details

- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Backend**: Node.js with WebSocket (for signaling)
- **Streaming**: WebRTC (peer-to-peer)
- **Mobile**: Capacitor for Android/iOS apps

## 📝 Development

### Running Locally

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   node server.js
   ```
4. Open `http://localhost:3000` in your browser

### Building Android APK

1. Install Capacitor:
   ```bash
   npm install @capacitor/core @capacitor/cli
   ```
2. Sync with Android:
   ```bash
   npx cap sync android
   ```
3. Open in Android Studio:
   ```bash
   npx cap open android
   ```
4. Build APK from Android Studio

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🆘 Troubleshooting

### Can't find PC on phone?
- Make sure both devices are on the same Wi-Fi network
- Check your PC's firewall settings
- Try entering the IP address manually

### No audio playing?
- Check browser permissions for microphone/audio
- Make sure the correct audio source is selected
- Try refreshing both devices

### Connection drops frequently?
- Check your Wi-Fi signal strength
- Reduce distance between devices and router
- Close other bandwidth-heavy applications

## 📧 Support

For issues or questions, please open an issue on GitHub.

---

Made with ❤️ for seamless audio streaming
