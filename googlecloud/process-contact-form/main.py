import functions_framework
import json
import os
import smtplib
import ssl
from email.message import EmailMessage
import google.generativeai as genai
from google.cloud import secretmanager
import requests
import sqlite3
import ftplib

# --- CONFIGURATION ---
PROJECT_ID = "895895945380"
SMTP_HOST = "mail.executivemind.io"
SMTP_PORT = 465 
SMTP_USER = "agent@executivemind.io"

# --- Secret Names ---
GEMINI_KEY_NAME = "gemini-api-key"
SMTP_PASSWORD_NAME = "smtp-password"
RECAPTCHA_KEY_NAME = "recaptcha-secret-key"
FTP_HOST_NAME = "ftp-host"
FTP_USER_NAME = "ftp-user"
FTP_PASSWORD_NAME = "ftp-password"
FTP_REMOTE_PATH_NAME = "ftp-remote-path"

# --- Database Path Correction ---
LOCAL_DB_PATH = "/tmp/nexus.db"
REMOTE_DB_FILENAME = "nexus.db"

# --- Global variables for secrets ---
# Initialize as None. They will be populated on startup.
GEMINI_API_KEY = None
SMTP_PASSWORD = None
RECAPTCHA_SECRET_KEY = None
FTP_HOST = None
FTP_USER = None
FTP_PASS = None
FTP_REMOTE_PATH = None

def access_secret_version(secret_id, version_id="latest"):
    """Accesses a secret version from Google Cloud Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{PROJECT_ID}/secrets/{secret_id}/versions/{version_id}"
    print(f"Attempting to access secret: {name}")
    response = client.access_secret_version(request={"name": name})
    print(f"Successfully accessed secret: {secret_id}")
    return response.payload.data.decode("UTF-8")

def load_secrets():
    """Load all necessary secrets from Secret Manager."""
    global GEMINI_API_KEY, SMTP_PASSWORD, RECAPTCHA_SECRET_KEY, FTP_HOST, FTP_USER, FTP_PASS, FTP_REMOTE_PATH
    try:
        GEMINI_API_KEY = access_secret_version(GEMINI_KEY_NAME)
        SMTP_PASSWORD = access_secret_version(SMTP_PASSWORD_NAME)
        RECAPTCHA_SECRET_KEY = access_secret_version(RECAPTCHA_KEY_NAME)
        FTP_HOST = access_secret_version(FTP_HOST_NAME)
        FTP_USER = access_secret_version(FTP_USER_NAME)
        FTP_PASS = access_secret_version(FTP_PASSWORD_NAME)
        FTP_REMOTE_PATH = access_secret_version(FTP_REMOTE_PATH_NAME)
        genai.configure(api_key=GEMINI_API_KEY)
        print("All secrets loaded successfully.")
        return True
    except Exception as e:
        print(f"FATAL: Could not load secrets on startup. Error: {e}")
        return False

# --- Load secrets when the function instance starts up ---
SECRETS_LOADED = load_secrets()

def download_db():
    """Downloads the SQLite DB from FTP to the local /tmp directory."""
    try:
        with ftplib.FTP_TLS(FTP_HOST, FTP_USER, FTP_PASS) as ftp:
            ftp.prot_p()
            ftp.cwd(FTP_REMOTE_PATH)
            with open(LOCAL_DB_PATH, 'wb') as local_file:
                ftp.retrbinary(f'RETR {REMOTE_DB_FILENAME}', local_file.write)
        print("Database downloaded successfully.")
        return True
    except Exception as e:
        if "550" in str(e):
             print("Database file not found on server. A new one will be created.")
             return True
        print(f"Error downloading database from FTP: {e}")
        return False

def upload_db():
    """Uploads the SQLite DB from the local /tmp directory back to FTP."""
    try:
        with ftplib.FTP_TLS(FTP_HOST, FTP_USER, FTP_PASS) as ftp:
            ftp.prot_p()
            ftp.cwd(FTP_REMOTE_PATH)
            with open(LOCAL_DB_PATH, 'rb') as local_file:
                ftp.storbinary(f'STOR {REMOTE_DB_FILENAME}', local_file)
        print("Database uploaded successfully.")
        return True
    except Exception as e:
        print(f"Error uploading database to FTP: {e}")
        return False

def query_or_log_db(question, agent_response=None):
    """Manages database operations."""
    try:
        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS knowledge (
                id INTEGER PRIMARY KEY,
                user_question TEXT UNIQUE NOT NULL,
                agent_answer TEXT,
                personnel_answer TEXT
            );
        """)
        if agent_response is None:
            cursor.execute("SELECT personnel_answer FROM knowledge WHERE user_question = ?", (question,))
            result = cursor.fetchone()
            conn.close()
            return result[0] if result and result[0] else None
        else:
            cursor.execute("INSERT OR IGNORE INTO knowledge (user_question, agent_answer) VALUES (?, ?)", (question, agent_response))
            conn.commit()
            conn.close()
            return True
    except Exception as e:
        print(f"Database operation failed: {e}")
        if 'conn' in locals() and conn:
            conn.close()
        return None

@functions_framework.http
def process_http_request(request):
    if not SECRETS_LOADED:
        print("Halting execution because secrets were not loaded.")
        return ("Server configuration error. Check logs.", 500)

    if request.method == 'OPTIONS':
        headers = {'Access-Control-Allow-Origin': '*','Access-Control-Allow-Methods': 'POST','Access-Control-Allow-Headers': 'Content-Type'}
        return ('', 204, headers)
    headers = {'Access-Control-Allow-Origin': '*'}

    try:
        request_json = request.get_json(silent=True)
        recaptcha_token = request_json.get('g-recaptcha-response')
        verify_url = 'https://www.google.com/recaptcha/api/siteverify'
        payload = {'secret': RECAPTCHA_SECRET_KEY, 'response': recaptcha_token}
        response = requests.post(verify_url, data=payload)
        result = response.json()

        if not result.get('success') or result.get('score', 0.0) < 0.5:
            return (json.dumps({"error": "Failed bot verification."}), 403, headers)

        sender_name = request_json.get('name')
        sender_email = request_json.get('email')
        message_body = request_json.get('message')
        if not all([sender_name, sender_email, message_body]):
            return (json.dumps({"error": "Missing form data"}), 400, headers)
    except Exception as e:
        return (json.dumps({"error": f"Invalid request format: {e}"}), 400, headers)

    if not download_db():
        return (json.dumps({"error": "Failed to access knowledge base."}), 500, headers)
    
    personnel_answer = query_or_log_db(message_body, agent_response=None)

    was_deferred = False
    if personnel_answer:
        suggested_reply_body = personnel_answer
    else:
        unknown_answer_phrase = "I do not have the answer to that question in my knowledge base yet"
        prompt = f"""
        You are an AI assistant named Nexus. A client named {sender_name} asks: "{message_body}".
        Your task is to provide a helpful, professional reply.
        RULES:
        1. If you cannot answer, you MUST include the exact phrase: "{unknown_answer_phrase}".
        2. End EVERY message with the signature on new lines:
        Kind regards,
        Nexus (ExecutiveMind Webform Response Agent)
        """
        try:
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(prompt)
            suggested_reply_body = response.text
            if unknown_answer_phrase in suggested_reply_body:
                was_deferred = True
        except Exception as e:
            print(f"Error calling Gemini: {e}")
            suggested_reply_body = f"Hi {sender_name},\n\nThank you for your message. We have received your inquiry and a member of our team will be in touch with you shortly.\n\nKind regards,\nNexus (ExecutiveMind Webform Response Agent)"

    if not personnel_answer:
        answer_to_log = "unknown - deferred to personnel" if was_deferred else suggested_reply_body
        query_or_log_db(message_body, agent_answer=answer_to_log)
        upload_db()

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            
            reply_msg = EmailMessage()
            reply_msg.set_content(suggested_reply_body)
            reply_msg['Subject'] = "Thank you for contacting ExecutiveMind.io"
            reply_msg['From'] = f"Nexus at ExecutiveMind <{SMTP_USER}>"
            reply_msg['To'] = sender_email
            server.send_message(reply_msg)
            
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

    return (json.dumps({"success": True}), 200, headers)