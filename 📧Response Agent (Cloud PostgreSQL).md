# 🏢Building In Google Cloud Platform (GCP)

This guide outlines the deployment, configuration, and operation of the ExecutiveMind automated email response system, Nexus, on Google Cloud Platform. The system processes inquiries from `executivemind.io`'s contact form, delivers them to `agent@executivemind.io`, and simultaneously triggers a Cloud Function, leverages Gemini 2.5 Pro for intelligent responses, and sends replies via `agent@executivemind.io` using SMTP while 'cc'ing the reply to admin@executivemind.io.
### 🚀 ExecutiveMind AI Agent: Final Deployment Guide 🤖

### Setup Step 1: 🤫 Secrets & Keys

First, let's get all secret credentials and store them securely.

1. **Get Google reCAPTCHA Keys:**
    
    - Go to the [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin/create).
    - Choose **reCAPTCHA v3**.
    - You will get a **SITE KEY** (for the website) and a **SECRET KEY** (for the server).
2. **Lock Everything in Secret Manager:**
    
    - In the GCP Console, go to **Secret Manager**.
    - Create the following three secrets. Make sure the names are exact!

|Secret Name 🔑|What to put in "Secret value" 📝|
|:--|:--|
|`gemini-api-key`|Your API key for the Gemini/Vertex AI service.|
|`smtp-password`|The password for your `agent@executivemind.io` email account.|
|`recaptcha-secret-key`|The **SECRET KEY** you got from the reCAPTCHA setup.|
### Setup Step 2: 🧠 Deploy the Brain (The Cloud Function)

This is the core of the project. This guide now uses the correct **HTTPS Trigger**.

- Go to **Cloud Run** in the GCP Console.
- Click **CREATE SERVICE**.
- Select "Deploy one revision from an existing container image" and then click **[...]Use an inline editor to create a function**.
- Configure it using this table:

| Setting              | Your Selection ✅                                                                  |
| :------------------- | :-------------------------------------------------------------------------------- |
| **Service Name**     | `process-contact-form`                                                            |
| **Region**           | `australia-southeast1`                                                            |
| **Runtime**          | Python 3.x (Using 3.12)                                                           |
| **Trigger**          | Http                                                                              |
| **Authentication**   | **Allow unauthenticated invocations**                                             |
|                      | _Expand "Container(s), volumes, networking, security"_                            |
| **Execution env.**   | **Second generation**                                                             |
|                      | _Click the "SOURCE" tab in the inline editor_                                     |
| **main.py**          | Paste the full, correct `main.py` code (from our previous message).               |
| **requirements.txt** | Paste the correct dependencies (from our previous message).                       |
| **Entry Point**      | `process_http_request` **<-- This must exactly match your Python function name!** |
| **Service account**  | Use the default (`...-compute@developer.gserviceaccount.com`).                    |
- **Permissions Check!** 👮‍♀️ Before deploying, go to **IAM & Admin** and ensure the Service Account has these two roles: `Secret Manager Secret Accessor` and `Vertex AI User`.
- Click **CREATE**.
### Setup Step 3: 🗃️Create Knowledge Base (Cloud PostgreSQL)

1) **Create a Cloud SQL Instance:**
    - In the GCP Console, go to **SQL**.
    - Click **CREATE INSTANCE** and choose **PostgreSQL**.
    - Give it an **Instance ID** (e.g., `nexus-knowledge-base`).
    - Generate a secure password and **save it immediately**.
    - Choose a region (e.g., `australia-southeast1`).
    - Click **CREATE INSTANCE**. This will take a few minutes.
2) **Create the Database & Table:**
    - Once the instance is ready, go to the **Databases** tab and create a new database named `knowledge_base`.
    - Go to the **Users** tab and create a new user (e.g., `nexus-agent`) with a secure password.
3) **Add the Database Password to Secret Manager:**
    - Go to **Secret Manager** and create a new secret named `db-password`.
    - For the value, paste the password for the `nexus-agent` database user you just created.
4) **Grant Permissions:**
    - Go to **IAM & Admin** > **IAM**.
    - Find your Cloud Function's service account (`...-compute@developer.gserviceaccount.com`).
    - Add the role **Cloud SQL Client**. This allows the function to connect to the database.