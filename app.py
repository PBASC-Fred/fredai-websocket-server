import requests
from flask import Flask, render_template, jsonify, request
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import os
from dotenv import load_dotenv
from flask_cors import CORS

app = Flask(__name__)

# Load environment variables
load_dotenv()

# Initialize CORS for your app
CORS(app, resources={r"/*": {"origins": "*"}})

app.secret_key = os.getenv("SECRET_KEY")

# SMTP Email Configurations
EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
TO_EMAIL = "professionalbusinessadvisory@gmail.com"

# Gemini API configuration - UPDATED to use Gemini 1.5 Pro
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# UPDATED MODEL: Using gemini-1.5-pro-latest. "2.5 pro" is not yet available.
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent"

# --- NEW: Placeholder for an Image Generation API ---
# You will need to replace these with a real text-to-image API service.
# For example, from OpenAI (DALL-E), Stability AI, or another provider.
IMAGE_API_KEY = os.getenv("IMAGE_API_KEY", "YOUR_IMAGE_API_KEY_HERE")
IMAGE_API_URL = os.getenv("IMAGE_API_URL", "YOUR_IMAGE_GENERATION_API_ENDPOINT_HERE")


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/submit_suggestion', methods=['POST'])
def submit_suggestion():
    data = request.get_json()
    suggestion = data.get('suggestion', '').strip()
    print(f"Received suggestion: {suggestion}")
    try:
        send_email(suggestion)
        return jsonify({'success': True, 'message': 'Thank you! Your suggestion has been sent.'}), 200
    except Exception as e:
        print(f"Error in submitting suggestion: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to send the suggestion: {str(e)}'}), 500


def send_email(suggestion):
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_ADDRESS
        msg['To'] = TO_EMAIL
        msg['Subject'] = 'New Service Suggestion for PBASC'
        body = f"""
        <html><body>
            <h2 style="color: #014B7B;">New Service Suggestion</h2>
            <p style="font-size: 16px;">A new suggestion has been submitted via the PBASC chatbot:</p>
            <p style="font-size: 16px; color: #4CAF50;">"{suggestion}"</p>
        </body></html>
        """
        msg.attach(MIMEText(body, 'html'))
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.sendmail(EMAIL_ADDRESS, TO_EMAIL, msg.as_string())
        print("Email sent successfully!")
    except Exception as e:
        print(f"Failed to send email: {str(e)}")
        raise e


@app.route('/chat_gemini', methods=['POST'])
def chat_gemini():
    user_message = request.json.get('message', '').strip()
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    try:
        payload = {"contents": [{"role": "user", "parts": [{"text": user_message}]}]}
        headers = {'Content-Type': 'application/json'}
        api_url_with_key = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
        response = requests.post(api_url_with_key, headers=headers, json=payload)
        response.raise_for_status()
        gemini_response = response.json()
        text_response = gemini_response['candidates'][0]['content']['parts'][0]['text']
        # UPDATED: Return a structured response with a type
        return jsonify({'response': text_response, 'type': 'text'})
    except Exception as e:
        print(f"An unexpected error occurred in chat_gemini: {e}")
        return jsonify({'error': 'An unexpected error occurred', 'details': str(e)}), 500


# --- NEW: Route for Image Generation ---
@app.route('/generate_image', methods=['POST'])
def generate_image():
    user_prompt = request.json.get('message', '').replace('/imagine', '').strip()
    if not user_prompt:
        return jsonify({'error': 'No prompt provided for image generation'}), 400

    print(f"Received image prompt: {user_prompt}")

    try:
        # --- THIS IS THE SECTION TO REPLACE ---
        # The line below is the placeholder you must remove:
        # image_url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(user_prompt)}"

        # Replace it with a real API call like this one for Stability AI:
        api_key = os.getenv("IMAGE_API_KEY")
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
                "text_prompts": [{"text": user_prompt}],
                "cfg_scale": 7,
                "height": 512,
                "width": 512,
                "samples": 1,
                "steps": 30,
            },
        )
        response.raise_for_status()
        data = response.json()
        
        # The response from Stability AI is the image data itself, not a URL.
        # We need to save it to a file and serve it, or encode it.
        # For simplicity, let's encode it directly into the HTML response.
        import base64
        image_b64 = data["artifacts"][0]["base64"]
        image_url = f"data:image/png;base64,{image_b64}"
        # --- END OF REPLACEMENT ---

        return jsonify({'response': image_url, 'type': 'image'})

    except Exception as e:
        print(f"An unexpected error occurred in generate_image: {e}")
        return jsonify({'error': 'An unexpected error occurred', 'details': str(e)}), 500

    except Exception as e:
        print(f"An unexpected error occurred in generate_image: {e}")
        return jsonify({'error': 'An unexpected error occurred', 'details': str(e)}), 500
