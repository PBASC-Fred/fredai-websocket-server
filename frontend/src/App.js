import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import ChatInterface from './components/ChatInterface';
import FAQ from './components/FAQ';
import SuggestionForm from './components/SuggestionForm';
import Header from './components/Header';
import { WebSocketProvider } from './context/WebSocketContext';
import './App.css';

const theme = createTheme({
  palette: {
    primary: {
      main: '#014B7B',
    },
    secondary: {
      main: '#4CAF50',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <WebSocketProvider>
        <Router>
          <div className="App">
            <Header />
            <Routes>
              <Route path="/" element={<ChatInterface />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/suggestions" element={<SuggestionForm />} />
            </Routes>
          </div>
        </Router>
      </WebSocketProvider>
    </ThemeProvider>
  );
}

export default App;
