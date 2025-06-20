import requests
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import os
from dotenv import load_dotenv
import base64
from typing import Any, Text, Dict, List
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent"

IMAGE_API_KEY = os.getenv("IMAGE_API_KEY")
EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
TO_EMAIL = "professionalbusinessadvisory@gmail.com"

class ActionFinancialAdvice(Action):
    def name(self) -> Text:
        return "action_financial_advice"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        user_message = tracker.latest_message.get('text', '')
        
        try:
            payload = {"contents": [{"role": "user", "parts": [{"text": f"As a financial advisor, please provide helpful advice for: {user_message}"}]}]}
            headers = {'Content-Type': 'application/json'}
            api_url_with_key = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
            
            response = requests.post(api_url_with_key, headers=headers, json=payload)
            response.raise_for_status()
            
            gemini_response = response.json()
            text_response = gemini_response['candidates'][0]['content']['parts'][0]['text']
            
            dispatcher.utter_message(text=text_response)
            
        except Exception as e:
            print(f"Error in financial advice: {e}")
            dispatcher.utter_message(text="I apologize, but I'm having trouble accessing my financial knowledge right now. Please try again in a moment.")
        
        return []

class ActionGenerateImage(Action):
    def name(self) -> Text:
        return "action_generate_image"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        user_message = tracker.latest_message.get('text', '')
        prompt = user_message.replace('/imagine', '').strip()
        
        if not prompt:
            dispatcher.utter_message(text="Please provide a prompt for image generation. Use '/imagine [your prompt]'")
            return []
        
        try:
            api_key = IMAGE_API_KEY
            if not api_key:
                raise ValueError("IMAGE_API_KEY not found in environment variables.")

            response = requests.post(
                "https://api.stability.ai/v1/generation/stable-diffusion-v1-6/text-to-image",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": f"Bearer {api_key}"
                },
                json={
                    "text_prompts": [{"text": prompt}],
                    "cfg_scale": 7,
                    "height": 512,
                    "width": 512,
                    "samples": 1,
                    "steps": 30,
                },
            )
            response.raise_for_status()
            data = response.json()
            
            image_b64 = data["artifacts"][0]["base64"]
            image_data = f"data:image/png;base64,{image_b64}"
            
            dispatcher.utter_message(text="Here's your generated image:", image=image_data)
            
        except Exception as e:
            print(f"Error generating image: {e}")
            dispatcher.utter_message(text="I apologize, but I'm having trouble generating images right now. Please try again in a moment.")
        
        return []

class ActionGetFAQ(Action):
    def name(self) -> Text:
        return "action_get_faq"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        faq_message = """Here are some frequently asked questions:

**Brand**
• What is Impact Ventures? - Impact Ventures is a brand that curates premium colognes and AI models, blending craftsmanship with cutting-edge innovation.
• Where are you based? - We operate online, serving customers worldwide with exclusive fragrances and AI-powered product recommendations.

**Ordering & Shipping**
• How can I place an order? - Simply browse our collection, select your favorite cologne, and proceed to checkout.
• Do you offer international shipping? - Yes! We ship globally. Shipping rates and delivery times vary based on location.

**Product**
• Are your colognes made with natural ingredients? - We prioritize high-quality, ethically sourced ingredients.
• How should I apply cologne for best results? - Apply to pulse points—wrists, neck, and behind the ears.

For more detailed FAQ information, please visit our FAQ page on the website."""
        
        dispatcher.utter_message(text=faq_message)
        return []

class ActionSubmitSuggestion(Action):
    def name(self) -> Text:
        return "action_submit_suggestion"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        user_message = tracker.latest_message.get('text', '')
        
        try:
            msg = MIMEMultipart()
            msg['From'] = EMAIL_ADDRESS
            msg['To'] = TO_EMAIL
            msg['Subject'] = "New Service Suggestion for PBASC"
            
            body = f"""
            <html><body>
            <h2 style="color: #014B7B;">New Service Suggestion</h2>
            <p style="font-size: 16px;">A new suggestion has been submitted via the PBASC chatbot:</p>
            <p style="font-size: 16px; color: #4CAF50;">"{user_message}"</p>
            </body></html>
            """
            
            msg.attach(MIMEText(body, 'html'))
            
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            text = msg.as_string()
            server.sendmail(EMAIL_ADDRESS, TO_EMAIL, text)
            server.quit()
            
            dispatcher.utter_message(text="Thank you for your suggestion! It has been sent to our team for review.")
            
        except Exception as e:
            print(f"Error sending suggestion email: {e}")
            dispatcher.utter_message(text="Thank you for your suggestion! I've noted it down for our team.")
        
        return []
