# FredAi.io - Financial AI Advisor

A modern, distributed financial AI advisor application built with React.js frontend, Rasa conversational AI backend, WebSocket communication layer, and MySQL database.

## Architecture

- **Frontend**: React.js with Material-UI for responsive client-side rendering
- **Backend**: Rasa Pro for conversational AI with custom actions
- **Communication**: Socket.IO WebSocket server for real-time bidirectional communication
- **Database**: MySQL for persistent storage of chat history, suggestions, and FAQ data
- **APIs**: Gemini 1.5 Pro for financial advice, Stability AI for image generation

## Features

- 💬 Real-time chat with AI financial advisor
- 🖼️ AI-powered image generation with `/imagine` commands
- 📧 Suggestion submission with email notifications
- ❓ Comprehensive FAQ system
- 💾 Persistent chat history and session management
- 📱 Responsive design for all devices

## Quick Start

### Prerequisites

- Node.js 16+ and npm/yarn
- Python 3.10 or 3.11
- MySQL 8.0+
- API keys for Gemini and Stability AI

### Installation

1. **Clone the repository**
   ```bash
   git clone https://gitlab.com/pbasc/fredai.git
   cd fredai
   ```

2. **Set up MySQL Database**
   ```bash
   mysql -u root -p < database/init.sql
   ```

3. **Install and start WebSocket server**
   ```bash
   cd websocket-server
   npm install
   cp .env.example .env  # Configure your environment variables
   npm start
   ```

4. **Install and start Rasa backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   cp .env.example .env  # Configure your API keys
   rasa train
   rasa run --enable-api --cors "*" &
   rasa run actions &
   ```

5. **Install and start React frontend**
   ```bash
   cd frontend
   npm install
   cp .env.example .env  # Configure your endpoints
   npm start
   ```

### Environment Variables

Create `.env` files in each component directory:

**Frontend (.env)**
```
REACT_APP_WEBSOCKET_URL=ws://localhost:3001
REACT_APP_API_BASE_URL=http://localhost:3001
```

**WebSocket Server (.env)**
```
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=fredai_db
EMAIL_ADDRESS=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
WEBSOCKET_PORT=3001
RASA_SERVER_URL=http://localhost:5005
```

**Rasa Backend (.env)**
```
GEMINI_API_KEY=your_gemini_api_key
IMAGE_API_KEY=your_stability_ai_key
EMAIL_ADDRESS=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
```

## Usage

1. Open http://localhost:3000 in your browser
2. Start chatting with the financial AI advisor
3. Use `/imagine [prompt]` for image generation
4. Browse FAQ section for common questions
5. Submit suggestions through the dedicated form

## Development

### Project Structure
```
fredai/
├── frontend/          # React.js application
├── backend/           # Rasa conversational AI
├── websocket-server/  # Socket.IO communication layer
├── database/          # MySQL schema and initialization
└── README.md
```

### Key Components

- **ChatInterface**: Real-time chat with WebSocket integration
- **FAQ**: Dynamic FAQ system with categorized questions
- **SuggestionForm**: User feedback submission with email notifications
- **WebSocketContext**: React context for managing WebSocket connections

### API Endpoints

- `POST /api/suggestions` - Submit user suggestions
- `GET /api/faq` - Retrieve FAQ data
- WebSocket events: `user_message`, `bot_response`, `image_request`, `image_response`

## Deployment

The application is designed for containerized deployment with Docker Compose or Kubernetes. Each component can be scaled independently.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a merge request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please contact: professionalbusinessadvisory@gmail.com
