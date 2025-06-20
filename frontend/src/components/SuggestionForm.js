import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Container,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Divider
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import axios from 'axios';

const SuggestionForm = () => {
  const [suggestion, setSuggestion] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [wantResponse, setWantResponse] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!suggestion.trim()) {
      setMessage({ type: 'error', text: 'Please enter a suggestion before submitting.' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const submissionData = {
        suggestion: suggestion.trim(),
        isAnonymous,
        wantResponse
      };

      if (!isAnonymous) {
        submissionData.name = name.trim();
        submissionData.email = email.trim();
      }

      const response = await axios.post('http://localhost:3001/api/suggestions', submissionData);

      if (response.data.success) {
        setMessage({ type: 'success', text: 'Thank you! Your suggestion has been sent successfully.' });
        setSuggestion('');
        setName('');
        setEmail('');
        setWantResponse(false);
        setIsAnonymous(false);
      } else {
        setMessage({ type: 'error', text: response.data.message || 'Failed to send suggestion.' });
      }
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || 'An error occurred while sending your suggestion. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      handleSubmit(event);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={2} sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Share Your Suggestions
        </Typography>
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
          We value your feedback! Share your ideas and suggestions to help us improve our services. You can submit anonymously or provide contact information if you'd like a response.
        </Typography>

        {message.text && (
          <Alert 
            severity={message.type} 
            sx={{ mb: 3 }}
            onClose={() => setMessage({ type: '', text: '' })}
          >
            {message.text}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            multiline
            rows={6}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Tell us about your ideas, feature requests, or any improvements you'd like to see..."
            variant="outlined"
            disabled={loading}
            sx={{ mb: 3 }}
            inputProps={{
              maxLength: 1000
            }}
            helperText={`${suggestion.length}/1000 characters | Press Ctrl+Enter to submit`}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                disabled={loading}
              />
            }
            label="Submit anonymously"
            sx={{ mb: 2 }}
          />

          {!isAnonymous && (
            <>
              <Divider sx={{ mb: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Contact Information (Optional)
                </Typography>
              </Divider>

              <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <TextField
                  fullWidth
                  label="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  variant="outlined"
                  disabled={loading}
                  placeholder="Enter your name"
                />
                <TextField
                  fullWidth
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  variant="outlined"
                  disabled={loading}
                  placeholder="Enter your email"
                />
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={wantResponse}
                    onChange={(e) => setWantResponse(e.target.checked)}
                    disabled={loading}
                  />
                }
                label="I would like to receive a response to my suggestion"
                sx={{ mb: 3 }}
              />
            </>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || !suggestion.trim()}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
              sx={{ minWidth: 200 }}
            >
              {loading ? 'Sending...' : 'Send Suggestion'}
            </Button>
          </Box>
        </Box>

        <Box sx={{ mt: 4, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="h6" gutterBottom>
            What kind of suggestions are we looking for?
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            <ul>
              <li>New features or improvements to our AI advisor</li>
              <li>Better user experience suggestions</li>
              <li>Additional financial tools or calculators</li>
              <li>Integration ideas with other services</li>
              <li>Any other ideas to enhance our platform</li>
            </ul>
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default SuggestionForm;
