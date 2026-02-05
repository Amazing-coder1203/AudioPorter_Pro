# AudioPorter - Seamless Audio Streaming

Stream high-quality audio from your PC to your phone with low latency using WebRTC.

TRY IT NOW! : https://audioporter-pro.onrender.com/

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
