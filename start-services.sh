#!/bin/bash

echo "Starting FredAi.io services..."

echo "Starting MySQL database..."
sudo service mysql start

echo "Starting WebSocket server..."
cd websocket-server
npm install
npm start &
WEBSOCKET_PID=$!
cd ..

echo "Starting Rasa backend..."
cd backend
pip install -r requirements.txt
rasa train
rasa run --enable-api --cors "*" --port 5005 &
RASA_PID=$!
rasa run actions --port 5055 &
ACTIONS_PID=$!
cd ..

echo "Starting React frontend..."
cd frontend
npm install
npm start &
FRONTEND_PID=$!
cd ..

echo "All services started!"
echo "Frontend: http://localhost:3000"
echo "WebSocket Server: http://localhost:3001"
echo "Rasa API: http://localhost:5005"
echo "Rasa Actions: http://localhost:5055"

echo "Process IDs:"
echo "WebSocket: $WEBSOCKET_PID"
echo "Rasa: $RASA_PID"
echo "Actions: $ACTIONS_PID"
echo "Frontend: $FRONTEND_PID"

read -p "Press Enter to stop all services..."

echo "Stopping services..."
kill $WEBSOCKET_PID $RASA_PID $ACTIONS_PID $FRONTEND_PID
echo "All services stopped."
