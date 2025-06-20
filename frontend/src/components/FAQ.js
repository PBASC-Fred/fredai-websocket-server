import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Container,
  Paper,
  Chip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import axios from 'axios';

const FAQ = () => {
  const [faqData, setFaqData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFAQ = async () => {
      try {
        const response = await axios.get('/api/faq');
        setFaqData(response.data);
      } catch (err) {
        const staticFAQ = [
          {
            "category": "Brand",
            "faqs": [
              {
                "question": "What is Impact Ventures?",
                "answer": "Impact Ventures is a brand that curates premium colognes and AI models, blending craftsmanship with cutting-edge innovation. We celebrate timeless elegance, luxury, and quality."
              },
              {
                "question": "Where are you based?",
                "answer": "We operate online, serving customers worldwide with exclusive fragrances and AI-powered product recommendations."
              }
            ]
          },
          {
            "category": "Ordering & Shipping",
            "faqs": [
              {
                "question": "How can I place an order?",
                "answer": "Simply browse our collection, select your favorite cologne, and proceed to checkout. We accept major payment methods for a seamless experience."
              },
              {
                "question": "Do you offer international shipping?",
                "answer": "Yes! We ship globally. Shipping rates and delivery times vary based on location."
              },
              {
                "question": "How long does shipping take?",
                "answer": "Orders are processed within 1-2 business days. Delivery typically takes 5-10 business days, depending on your location."
              }
            ]
          },
          {
            "category": "Product",
            "faqs": [
              {
                "question": "Are your colognes made with natural ingredients?",
                "answer": "We prioritize high-quality, ethically sourced ingredients. Each fragrance is carefully crafted with a blend of natural and refined synthetics for longevity and depth."
              },
              {
                "question": "How should I apply cologne for best results?",
                "answer": "Apply to pulse points—wrists, neck, and behind the ears—for a lasting, well-balanced scent. Avoid rubbing the fragrance after application."
              },
              {
                "question": "Do you have a loyalty program?",
                "answer": "Yes! Our members enjoy exclusive discounts, early access to new releases, and personalized recommendations from our AI model based on their fragrance preferences."
              },
              {
                "question": "Do you offer samples?",
                "answer": "We do not provide sample packs right now"
              }
            ]
          },
          {
            "category": "Returns & Support",
            "faqs": [
              {
                "question": "Can I return or exchange a cologne?",
                "answer": "We accept returns within 30 days of purchase if the product is unopened and unused. Contact our support team for assistance."
              },
              {
                "question": "My order arrived damaged. What should I do?",
                "answer": "If your package arrives damaged, please reach out to us with photos, and we'll arrange a replacement or refund."
              }
            ]
          }
        ];
        setFaqData(staticFAQ);
        console.warn('Using static FAQ data due to API error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFAQ();
  }, []);

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Loading FAQ...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom color="error">
          Error loading FAQ
        </Typography>
        <Typography variant="body1">{error}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={2} sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Frequently Asked Questions
        </Typography>
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
          Find answers to common questions about our products and services
        </Typography>

        {faqData.map((category, categoryIndex) => (
          <Box key={categoryIndex} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Chip
                label={category.category}
                color="primary"
                variant="outlined"
                sx={{ mr: 2 }}
              />
              <Typography variant="h6" component="h2">
                {category.category}
              </Typography>
            </Box>

            {category.faqs.map((faq, faqIndex) => (
              <Accordion
                key={faqIndex}
                sx={{
                  mb: 1,
                  '&:before': {
                    display: 'none',
                  },
                }}
                elevation={1}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  aria-controls={`panel${categoryIndex}-${faqIndex}-content`}
                  id={`panel${categoryIndex}-${faqIndex}-header`}
                >
                  <Typography variant="subtitle1" fontWeight="medium">
                    {faq.question}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body1" color="text.secondary">
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        ))}
      </Paper>
    </Container>
  );
};

export default FAQ;
