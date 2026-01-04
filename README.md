# Video Chat Application

A real-time video chat application with audio and live text messaging capabilities, built with WebRTC and Socket.io.

## Features

- 🎥 **Video Chat**: Real-time peer-to-peer video communication
- 🎤 **Audio Chat**: Crystal clear audio communication
- 💬 **Live Chat**: Real-time text messaging
- 🔒 **Room-based**: Join or create rooms for private conversations
- 📱 **Responsive**: Works on desktop and mobile devices
- 🎨 **Modern UI**: Beautiful and intuitive user interface

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- A modern web browser with WebRTC support (Chrome, Firefox, Safari, Edge)

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Application

1. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

## How to Use

1. **Enter Your Name**: Type your name in the input field
2. **Join a Room**: 
   - Leave the Room ID field empty to create a new room
   - Enter an existing Room ID to join that room
3. **Share the Room ID**: Share the Room ID with others to let them join your room
4. **Video/Audio Controls**: Use the camera and microphone buttons to toggle your video/audio
5. **Chat**: Type messages in the chat box and press Enter or click Send
6. **Leave Room**: Click the "Leave Room" button to exit

## Technical Details

- **Backend**: Node.js with Express and Socket.io
- **Frontend**: Vanilla JavaScript with WebRTC API
- **Signaling**: Socket.io for WebRTC signaling
- **STUN Servers**: Google's public STUN servers for NAT traversal
- **Real-time Communication**: Socket.io for instant messaging

## Browser Permissions

The application requires camera and microphone permissions. Make sure to allow these permissions when prompted by your browser.

## Troubleshooting

- **No video/audio**: Check browser permissions for camera and microphone
- **Can't connect**: Ensure you're using the same Room ID and the server is running
- **Firewall issues**: Make sure port 3000 is not blocked by your firewall

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions to various platforms including:

- **Render** (Recommended - Free tier available)
- **Railway** (Easy deployment with free tier)
- **Heroku** (Popular platform)
- **Vercel** (Serverless platform)
- **Docker** (Deploy anywhere)

### Quick Deploy to Render

1. Push your code to GitHub
2. Sign up at [render.com](https://render.com)
3. Create a new Web Service
4. Connect your GitHub repository
5. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Deploy!

Your app will be live at `https://your-app-name.onrender.com`

## Notes

- For production use, you may want to add TURN servers for better connectivity behind restrictive NATs
- The application uses public STUN servers which are fine for development but may need dedicated servers for production
- HTTPS is required for camera/microphone access in modern browsers (most deployment platforms provide this automatically)

## License

MIT

