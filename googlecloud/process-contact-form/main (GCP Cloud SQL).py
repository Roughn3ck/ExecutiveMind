import functions_framework
import json
import os
import smtplib
import ssl
from email.message import EmailMessage
import google.generativeai as genai
from google.cloud import secretmanager
import requests

# --- CONFIGURATION ---
PROJECT_ID = "895895945380" # Your GCP Project ID
SMTP_HOST = "mail.executivemind.io" # Your SMTP server
SMTP_PORT = 465 # Usually 465 for SSL
SMTP_USER = "agent@executivemind.io"

# --- Secret Names (as they appear in Secret Manager) ---
GEMINI_KEY_NAME = "gemini-api-key"
SMTP_PASSWORD_NAME = "smtp-password"
RECAPTCHA_KEY_NAME = "recaptcha-secret-key"

def access_secret_version(secret_id, version_id="latest"):
    """Accesses a secret version from Google Cloud Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{PROJECT_ID}/secrets/{secret_id}/versions/{version_id}"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

# --- Fetch secrets once when the function instance starts ---
try:
    GEMINI_API_KEY = access_secret_version(GEMINI_KEY_NAME)
    SMTP_PASSWORD = access_secret_version(SMTP_PASSWORD_NAME)
    RECAPTCHA_SECRET_KEY = access_secret_version(RECAPTCHA_KEY_NAME)
    genai.configure(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"FATAL: Could not load secrets on startup. {e}")
    GEMINI_API_KEY = SMTP_PASSWORD = RECAPTCHA_SECRET_KEY = None


@functions_framework.http
def process_http_request(request):
    if not RECAPTCHA_SECRET_KEY:
        print("ERROR: Function is not configured with secrets.")
        return ("Server configuration error.", 500)

    # Set CORS headers
    if request.method == 'OPTIONS':
        headers = {'Access-Control-Allow-Origin': '*','Access-Control-Allow-Methods': 'POST','Access-Control-Allow-Headers': 'Content-Type'}
        return ('', 204, headers)
    headers = {'Access-Control-Allow-Origin': '*'}

    # 1. PARSE & VALIDATE SPAM
    try:
        request_json = request.get_json(silent=True)
        recaptcha_token = request_json.get('g-recaptcha-response')
        
        verify_url = 'https://www.google.com/recaptcha/api/siteverify'
        payload = {'secret': RECAPTCHA_SECRET_KEY, 'response': recaptcha_token}
        response = requests.post(verify_url, data=payload)
        result = response.json()

        if not result.get('success') or result.get('score', 0.0) < 0.5:
            print(f"reCAPTCHA verification failed: {result}")
            return (json.dumps({"error": "Failed bot verification."}), 403, headers)

        sender_name = request_json.get('name')
        sender_email = request_json.get('email')
        message_body = request_json.get('message')
        if not all([sender_name, sender_email, message_body]):
            return (json.dumps({"error": "Missing form data"}), 400, headers)
    except Exception as e:
        return (json.dumps({"error": f"Invalid request format: {e}"}), 400, headers)

    # 2. ANALYZE THE MESSAGE WITH GEMINI (with new, improved prompt)
    prompt = f"""
    You are an AI assistant for ExecutiveMind.io. Your name is Nexus.
    A potential client named {sender_name} has sent a message.
    Your task is to draft a professional, friendly, and helpful reply.

    RULES:
    1.  If the user asks a question you cannot answer from general knowledge (e.g., about company size, pricing, specific services), you MUST respond with EXACTLY this phrase: "I do not have the answer to that question in my knowledge base yet, but one of our team of personnel will be in contact with you as soon as possible during business hours to personally respond!" Do not try to make up an answer.
    2.  If the user's message is a general inquiry you can answer, provide a brief, helpful response.
    3.  Always address the user by their name, {sender_name}.
    4.  End EVERY message with the following signature on new lines:
        Kind regards,
        Nexus (ExecutiveMind Webform Response Agent)

    Here is the user's message:
    ---
    {message_body}
    ---
    """
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)
        suggested_reply_body = response.text
    except Exception as e:
        print(f"Error calling Gemini: {e}")
        # Create a fallback response if the AI fails
        suggested_reply_body = f"Hi {sender_name},\n\nThank you for your message. We have received your inquiry and a member of our team will be in touch with you shortly.\n\nKind regards,\nNexus (ExecutiveMind Webform Response Agent)"

    # 3. SEND EMAILS VIA SMTP
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            
            # Email 1: Reply to customer
            reply_msg = EmailMessage()
            reply_msg.set_content(suggested_reply_body)
            reply_msg['Subject'] = "Thank you for contacting ExecutiveMind.io"
            reply_msg['From'] = f"ExecutiveMind Agent <{SMTP_USER}>"
            reply_msg['To'] = sender_email
            reply_msg['Cc'] = "admin@executivemind.io"  # Add CC header
            server.send_message(reply_msg)
            
            # Email 2: Internal record
            record_content = f"New contact form submission:\n\nName: {sender_name}\nEmail: {sender_email}\n\nMessage:\n{message_body}"
            record_msg = EmailMessage()
            record_msg.set_content(record_content)
            record_msg['Subject'] = f"New Contact Form Lead: {sender_name}"
            record_msg['From'] = f"ExecutiveMind System <{SMTP_USER}>"
            record_msg['To'] = SMTP_USER
            server.send_message(record_msg)

    except Exception as e:
        print(f"An error occurred while sending email(s): {e}")
        return (json.dumps({"error": "Failed to send email"}), 500, headers)

    # 4. RETURN A SUCCESS RESPONSE TO THE WEBSITE
    return (json.dumps({"success": True}), 200, headers)
