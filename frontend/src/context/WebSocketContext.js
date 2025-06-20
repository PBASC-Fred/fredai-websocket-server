import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const WebSocketContext = createContext();

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:5005');
    
    newSocket.on('connect', () => {
      setConnected(true);
      console.log('Connected to WebSocket server');
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from WebSocket server');
    });

    newSocket.on('bot_response', (data) => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'bot',
        content: data.text,
        timestamp: new Date()
      }]);
    });

    newSocket.on('image_response', (data) => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'image',
        content: data.image_url,
        timestamp: new Date()
      }]);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const sendMessage = (message) => {
    if (socket && connected) {
      const userMessage = {
        id: Date.now(),
        type: 'user',
        content: message,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, userMessage]);
      socket.emit('user_message', { message });
    }
  };

  const sendImageRequest = (prompt) => {
    if (socket && connected) {
      const userMessage = {
        id: Date.now(),
        type: 'user',
        content: `/imagine ${prompt}`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, userMessage]);
      socket.emit('image_request', { prompt });
    }
  };

  const value = {
    socket,
    connected,
    messages,
    sendMessage,
    sendImageRequest,
    clearMessages: () => setMessages([])
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
