import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  List,
  ListItem,
  Avatar,
  Chip,
  CircularProgress
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ImageIcon from '@mui/icons-material/Image';
import { useWebSocket } from '../context/WebSocketContext';

const ChatInterface = () => {
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const { connected, messages, sendMessage, sendImageRequest } = useWebSocket();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !connected) return;

    setIsLoading(true);
    
    if (inputMessage.startsWith('/imagine')) {
      const prompt = inputMessage.replace('/imagine', '').trim();
      sendImageRequest(prompt);
    } else {
      sendMessage(inputMessage);
    }
    
    setInputMessage('');
    setTimeout(() => setIsLoading(false), 1000);
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const renderMessage = (message) => {
    const isUser = message.type === 'user';
    const isImage = message.type === 'image';

    return (
      <ListItem
        key={message.id}
        sx={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          mb: 1
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            maxWidth: '70%',
            flexDirection: isUser ? 'row-reverse' : 'row'
          }}
        >
          <Avatar
            sx={{
              bgcolor: isUser ? 'primary.main' : 'secondary.main',
              mx: 1
            }}
          >
            {isUser ? <PersonIcon /> : <SmartToyIcon />}
          </Avatar>
          <Paper
            elevation={2}
            sx={{
              p: 2,
              bgcolor: isUser ? 'primary.light' : 'grey.100',
              color: isUser ? 'white' : 'text.primary'
            }}
          >
            {isImage ? (
              <Box>
                <img
                  src={message.content}
                  alt="Generated"
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                    borderRadius: '8px'
                  }}
                />
              </Box>
            ) : (
              <Typography variant="body1">{message.content}</Typography>
            )}
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mt: 1,
                opacity: 0.7
              }}
            >
              {message.timestamp.toLocaleTimeString()}
            </Typography>
          </Paper>
        </Box>
      </ListItem>
    );
  };

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Chip
          label={connected ? 'Connected' : 'Disconnected'}
          color={connected ? 'success' : 'error'}
          size="small"
        />
        <Typography variant="h6" sx={{ mt: 1 }}>
          Financial AI Advisor Chat
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Ask questions about financial advice or use "/imagine [prompt]" for image generation
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        <List>
          {messages.length === 0 && (
            <ListItem>
              <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', width: '100%' }}>
                Welcome! Start a conversation with your Financial AI Advisor.
              </Typography>
            </ListItem>
          )}
          {messages.map(renderMessage)}
          <div ref={messagesEndRef} />
        </List>
      </Box>

      <Paper
        elevation={3}
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider'
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message or '/imagine [prompt]' for image generation..."
            disabled={!connected || isLoading}
            variant="outlined"
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!connected || !inputMessage.trim() || isLoading}
            sx={{ minWidth: 'auto', px: 2 }}
          >
            {isLoading ? (
              <CircularProgress size={24} color="inherit" />
            ) : inputMessage.startsWith('/imagine') ? (
              <ImageIcon />
            ) : (
              <SendIcon />
            )}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default ChatInterface;
