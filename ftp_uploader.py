import ftplib
import os

# --- Configuration: Replace with your actual details! ---
FTP_HOST = "ftp.executivemind.io"  # 👈 Your FTP Host
FTP_USER = "agent@executivemind.io"     # 👈 Your FTP Username
FTP_PASS = "3x3cut1veM1nd"     # 👈 Your FTP Password
REMOTE_PATH = "agent"      # 👈 The folder on the server (usually public_html)

# --- The Function our Agent will use ---
def upload_file_to_server(local_file_path, remote_file_name):
    """
    Connects to the FTP server using a secure TLS connection and uploads a single file.
    
    Args:
        local_file_path (str): The full path to the local file to upload.
        remote_file_name (str): The name the file should have on the server.
    """
    try:
        # Check if the local file exists
        if not os.path.exists(local_file_path):
            print(f"❌ Error: Local file not found at '{local_file_path}'")
            return

        # Use FTP_TLS for a secure connection
        ftp = ftplib.FTP_TLS(FTP_HOST)
        
        # Log in (this happens over the secure control connection)
        ftp.login(FTP_USER, FTP_PASS)
        print("✅ Secure control connection established and logged in.")
        
        # Switch to secure data connection
        # This encrypts the file content during transfer
        ftp.prot_p()
        print("✅ Data connection is now secure.")
            
        # Change to the correct remote directory
        ftp.cwd(REMOTE_PATH)
        print(f"✅ Changed directory to '{REMOTE_PATH}'.")
            
        # Open the local file in binary read mode
        with open(local_file_path, 'rb') as file:
            # Upload the file
            ftp.storbinary(f'STOR {remote_file_name}', file)
            
        print(f"🚀 Successfully uploaded '{local_file_path}' to '{remote_file_name}' on the server!")

        # Quit the FTP session
        ftp.quit()
        print("✅ FTP session closed.")

    except ftplib.all_errors as e:
        print(f"❌ FTP Error: {e}")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

# --- This part is for testing the script directly ---
if __name__ == "__main__":
    print("--- Running Secure FTP Uploader Test ---")
    
    local_file_to_upload = "index.html"
    remote_filename = "index.html"
    
    upload_file_to_server(local_file_to_upload, remote_filename)
    
    print("--- Test Complete ---")