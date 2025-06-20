# FredAi - Trusted AI Advisor

A modern, distributed financial AI advisor application built with React.js frontend, WebSocket communication layer, and PostgreSQL database.

## Architecture

- **Frontend**: React.js with Material-UI for responsive client-side rendering
- **Backend**: WebSocket server with direct API integrations
- **Communication**: Native WebSocket for real-time bidirectional communication
- **Database**: PostgreSQL for persistent storage of chat history, suggestions, and FAQ data
- **APIs**: Gemini AI for financial advice, Stability AI for image generation

## Features

- 💬 Real-time chat with AI financial advisor focused on taxes, budgeting, and savings
- 🖼️ AI-powered image generation for finance-related visuals
- 📧 Enhanced suggestion submission with optional contact information
- ❓ Comprehensive FAQ system
- 💾 Persistent chat history and session management
- 📱 Responsive design for all devices

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- API keys for Gemini AI and Stability AI

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/PBASC-Fred/fredai-websocket-server.git
   cd fredai-websocket-server
   ```

2. **Install and start WebSocket server**
   ```bash
   cd websocket-server
   npm install
   cp .env.example .env  # Configure your environment variables
   npm start
   ```

3. **Install and start React frontend**
   ```bash
   cd frontend
   npm install
   cp .env.example .env  # Configure your endpoints
   npm start
   ```

### Environment Variables

⚠️ **Do not commit real credentials. Replace the values below in your .env file and add it to .gitignore.**

Copy `.env.example` to `.env` and fill in your own values:

```bash
cp websocket-server/.env.example websocket-server/.env
cp frontend/.env.example frontend/.env
```

See `.env.example` files for required environment variables.

## Usage

1. Open http://localhost:3000 in your browser
2. Start chatting with the trusted AI advisor about taxes, budgeting, and savings
3. Use `/imagine [prompt]` for finance-related image generation
4. Browse FAQ section for common questions
5. Submit suggestions with optional contact information

## Development

### Project Structure
```
fredai-websocket-server/
├── frontend/          # React.js application
├── websocket-server/  # WebSocket communication server
├── package.json       # Root package configuration
├── railway.toml       # Railway deployment configuration
└── README.md
```

### Key Components

- **ChatInterface**: Real-time chat with WebSocket integration
- **FAQ**: Dynamic FAQ system with categorized questions
- **SuggestionForm**: Enhanced user feedback submission with contact options
- **WebSocketContext**: React context for managing WebSocket connections

### API Endpoints

- `POST /api/suggestions` - Submit user suggestions
- `GET /api/faq` - Retrieve FAQ data
- WebSocket events: `chat`, `bot`, `image`

## Railway Deployment

This application is configured for Railway deployment using their GitHub integration:

1. **Push to GitHub**: Code is pushed to GitHub repository
2. **Railway Project**: Create new project from GitHub repo
3. **PostgreSQL Plugin**: Add PostgreSQL database as a plugin
4. **Environment Variables**: Configure required API keys and credentials
5. **Automatic Deployment**: Railway builds and deploys automatically

### GitHub Repository Setup:
The application is configured for Railway's "Deploy from GitHub Repo" workflow:
1. Push code to GitHub repository
2. Connect Railway project to GitHub repository
3. Add PostgreSQL plugin to Railway project
4. Configure environment variables in Railway dashboard
5. Deploy automatically via Railway's GitHub integration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Live Deployment
- **Frontend**: https://fredai-pbasc-trustedadvisor-project-2025-kfzj7qzsn.vercel.app
- **Backend**: Railway deployment in progress
- **Status**: Migrated from Socket.IO + Rasa to simplified WebSocket + PostgreSQL architecture for Railway deployment
