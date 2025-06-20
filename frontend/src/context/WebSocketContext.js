import React, { createContext, useContext, useEffect, useState } from 'react';

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
    const wsUrl = process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:3000';
    const newSocket = new WebSocket(wsUrl);
    
    newSocket.onopen = () => {
      setConnected(true);
      console.log('Connected to WebSocket server');
    };

    newSocket.onclose = () => {
      setConnected(false);
      console.log('Disconnected from WebSocket server');
    };

    newSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'welcome') {
          setMessages(prev => [...prev, {
            id: Date.now(),
            type: 'bot',
            content: data.content,
            timestamp: new Date(data.timestamp)
          }]);
        } else if (data.type === 'bot') {
          setMessages(prev => [...prev, {
            id: Date.now(),
            type: 'bot',
            content: data.content,
            timestamp: new Date(data.timestamp)
          }]);
        } else if (data.type === 'image') {
          setMessages(prev => [...prev, {
            id: Date.now(),
            type: 'image',
            content: data.content,
            timestamp: new Date(data.timestamp)
          }]);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

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
      socket.send(JSON.stringify({
        type: 'chat',
        message: message
      }));
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
      socket.send(JSON.stringify({
        type: 'chat',
        message: `/imagine ${prompt}`
      }));
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
