### Setup Step 1: 🗃️Create Knowledge Base (Webhosted SQLite)###

- **Create the SQLite Database File:** You'll need to create an SQLite database file (e.g., `nexus.db`) on your website. You can do this manually using an SQLite client or programmatically within your Cloud Run function (we'll do it programmatically in the next step).
1) **Create the Database:**
python
```python
    import sqlite3
    
    DATABASE_FILE = "executivemind.db"
    
    try:
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS knowledge (
                inquiry TEXT PRIMARY KEY,
                agent_response TEXT,
                personnel_response TEXT
            )
        """)
        conn.commit()
        conn.close()
        print(f"Database '{DATABASE_FILE}' created successfully.")
    except Exception as e:
        print(f"Error creating database: {e}")
    ```
- Save this code as a Python file (e.g., `create_db.py`) and run it. It will create an empty SQLite database file named `executivemind.db` in the same directory.
2. **Upload to FTP:** Use an FTP client (like FileZilla) to upload the `executivemind.db` file to the `agent` directory on your website.

3. **Setting FTP Secrets in Google Cloud Secret Manager**

- Go to Google Cloud Secret Manager in the Google Cloud Console.
- Click "Create Secret."
	- For the "Name" field, enter `ftp-host`.
	- In the "Secret value" field, enter your FTP host (`ftp.executivemind.io`).
	 - Click "Create Secret."
	- Repeat steps 2-5 for the following secrets:
    - Name: `ftp-user`, Value: `agent@executivemind.io`
    - Name: `ftp-password`, Value: `<the ftp password>`
    - Name: `ftp-remote-path`, Value: `agent`

### Setup Step 2: 🪜Deployment Steps 
 
1) **Build Custom Image:** Create an Artifact Registry repository to store the image
```
gcloud artifacts repositories create process-contact-image \
    --repository-format=docker \
    --location=australia-southeast1 \
    --description="Image with sqlite3 library." \
    --immutable-tags \
    --async
```
- To check it was created use `gcloud artifacts repositories describe process-contact-image --location=australia-southeast1

2) **Create Custom Container Image Build Files (Dockerfile & cloudbuild.yaml)**
- Use the Cloud Shell command line or access from your local machine (with the [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) installed)
- In the editor create two files for `Dockerfile` (capital D) and cloudbuild.yaml

2) Add the main.py and requirements.txt from the PostgreSQL version to the same root folder
- When accessing the nexus.db SQLite database from within GCP all folders are read only, except the /tmp folder - the database file is downloaded to this location where the program can edit it save it and send the modified db back to the webhost

3) **Build the modified image:** use `gcloud builds submit --config cloudbuild.yaml .`
4) **Create Service:** Deploy one revision from an existing container image
- Once successfully built the image can be deployed from the console -> Cloud Run
- Container image URL -> Select -> locate australia-southeast1-docker.pkg.dev/executivemind/process-contact-image - nexus-agent - 38e5d6ad47:sqlite
	- Configure according to this table

| Setting              | Your Selection ✅                                                                  |
| :------------------- | :-------------------------------------------------------------------------------- |
| **Service Name**     | `process-contact-form`                                                            |
| **Region**           | `australia-southeast1`                                                            |
| **Authentication**   | **Allow unauthenticated invocations**                                             |
|                      | _Expand "Container(s), volumes, networking, security"_                            |
| **Execution env.**   | **Second generation**                                                             |
|                      | _Click the "SOURCE" tab in the inline editor_                                     |
| **main.py**          | Paste the full, correct `main.py` code (from our previous message).               |
| **requirements.txt** | Paste the correct dependencies (from our previous message).                       |
| **Entry Point**      | `process_http_request` **<-- This must exactly match your Python function name!** |
| **Service account**  | Use the default (`...-compute@developer.gserviceaccount.com`).                    |
- **Deploy the Modified Cloud Run Function:** Deploy the updated code to your Cloud Run service.
- **Upload the Initial Database:** Upload the `nexus.db` file you created to your website's `agent` directory via FTP.
- **Test:** Submit a contact form on your website and verify that:
	- The email is sent to the customer with a CC to `admin@executivemind.io`.
	- The inquiry is processed correctly.
	- The database is updated with the new inquiry (you can download the database file from FTP to check).
### Setup Step 4: 🔗 Connect Your Website

1. **Wait for Deployment:** Wait for the new service to show a green checkmark ✅. This means it deployed successfully!
2. **Copy the URL:** Click on your `process-contact-form` service. The URL will be at the top. **Copy this URL.**
3. **Update Your Website:** Go to your website's HTML file and paste this URL into the `functionUrl` variable in your JavaScript code.

# Rebuilding the container image

**Changing the Container Image:** If changes are required to any files baked into the image such as main.py it must be rebuilt.

1) GCP -> Cloud Run -> Enter the command line (or use Google Cloud SDK Shell)
2) Make changes as needed to file
3) Ensure to update cloudbuild.yaml with a new tag to the container (ie `latest')
	- Do not use a "-" in the tag as this causes an error
4) Run `gcloud builds submit --config cloudbuild.yaml .` from the CLI

**Now redploy the container:** 

1) +Create a service -> Deploy one revision from an existing container image
2) Select the Container image URL you just created
3) Use the table to complete the setup datails

| Setting               | Your Selection ✅                                       |
| :-------------------- | :----------------------------------------------------- |
| **Service Name**      | `process-contact-form`                                 |
| **Region**            | `australia-southeast1`                                 |
| **Authentication**    | **Allow unauthenticated invocations**                  |
|                       | _Expand "Container(s), volumes, networking, security"_ |
| **Execution env.**    | **Second generation**                                  |
| **Startup CPU Boost** | I have been ticking this                               |
4) **CREATE** 🚀

*Note:* To clean the old container image files navigate in the GCP console to Cloud Storage -> Buckets -> executivemind_cloudbuild 