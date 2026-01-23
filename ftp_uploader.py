import ftplib
import os

# --- Configuration ---
FTP_HOST = "ftp.executivemind.io"
FTP_USER = "agent@executivemind.io"
FTP_PASS = "3x3cut1veM1nd"
# No remote path needed, as the login defaults to the correct directory.

# --- File Deployment Plan ---
# Files to be placed in the ROOT (public_html)
ROOT_FILES = [
    "articles.html",
    "join.html"
]
# Directories to be placed in the ROOT (public_html)
ROOT_DIRS = [
    "articles",
    "assets"
]
# Files to be placed in the AGENT subfolder (public_html/agent)
AGENT_FILES = [
    "index.html"
]

# --- The Main Agent Function ---
def upload_website():
    """
    Connects to the FTP server once and uploads all specified files and directories.
    """
    try:
        ftp = ftplib.FTP_TLS(FTP_HOST)
        ftp.login(FTP_USER, FTP_PASS)
        print("✅ Secure connection established.")
        ftp.prot_p()
        
        # --- 1. DEPLOY TO THE ROOT (public_html) ---
        print("✅ Operating from default root directory (public_html).")

        # Upload individual files to the root
        for filename in ROOT_FILES:
            if os.path.exists(filename):
                print(f"  Uploading to root: {filename}...")
                with open(filename, 'rb') as file:
                    ftp.storbinary(f'STOR {filename}', file)
                print(f"  🚀 Success: '{filename}' uploaded.")
            else:
                print(f"  ❌ Warning: Local file '{filename}' not found. Skipping.")
        
        # Upload contents of directories to the root
        for dirname in ROOT_DIRS:
            if os.path.isdir(dirname):
                print(f"\n  Processing directory: {dirname}/")
                # Create remote directory if it doesn't exist
                if dirname not in ftp.nlst():
                    ftp.mkd(dirname)
                    print(f"  🛠 Created remote directory '{dirname}'.")
                
                # Upload files within the directory
                for item in os.listdir(dirname):
                    local_path = os.path.join(dirname, item)
                    if os.path.isfile(local_path):
                        remote_filepath = f"{dirname}/{item}"
                        print(f"    Uploading to {remote_filepath}...")
                        with open(local_path, 'rb') as file:
                            ftp.storbinary(f'STOR {remote_filepath}', file)
                        print(f"    🚀 Success.")
            else:
                print(f"  ❌ Warning: Local directory '{dirname}' not found. Skipping.")

        # --- 2. DEPLOY TO THE AGENT SUBFOLDER ---
        print(f"\n✅ Changing to AGENT subfolder...")
        # Check for and create the 'agent' directory if needed
        if 'agent' not in ftp.nlst():
            ftp.mkd('agent')
            print("  🛠 Created remote directory 'agent'.")
        ftp.cwd('agent')
        print("✅ Now in 'public_html/agent'.")

        for filename in AGENT_FILES:
            if os.path.exists(filename):
                print(f"  Uploading to agent/: {filename}...")
                with open(filename, 'rb') as file:
                    ftp.storbinary(f'STOR {filename}', file)
                print(f"  🚀 Success: '{filename}' uploaded.")
            else:
                print(f"  ❌ Warning: Local file '{filename}' not found. Skipping.")

        ftp.quit()
        print("\n✅ All operations complete. FTP session closed.")

    except ftplib.all_errors as e:
        print(f"❌ FTP Error: {e}")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

# --- This part runs the main function ---
if __name__ == "__main__":
    print("--- Initializing Executive Mind Multi-Directory Upload Protocol ---")
    upload_website()
    print("--- Protocol Complete ---")