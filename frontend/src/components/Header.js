import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import ChatIcon from '@mui/icons-material/Chat';
import HelpIcon from '@mui/icons-material/Help';
import SuggestionIcon from '@mui/icons-material/Lightbulb';

const Header = () => {
  const location = useLocation();

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          FredAi.io - Financial AI Advisor
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            color="inherit"
            component={Link}
            to="/"
            startIcon={<ChatIcon />}
            variant={location.pathname === '/' ? 'outlined' : 'text'}
          >
            Chat
          </Button>
          <Button
            color="inherit"
            component={Link}
            to="/faq"
            startIcon={<HelpIcon />}
            variant={location.pathname === '/faq' ? 'outlined' : 'text'}
          >
            FAQ
          </Button>
          <Button
            color="inherit"
            component={Link}
            to="/suggestions"
            startIcon={<SuggestionIcon />}
            variant={location.pathname === '/suggestions' ? 'outlined' : 'text'}
          >
            Suggestions
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
