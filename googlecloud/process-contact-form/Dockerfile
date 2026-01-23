# Use the official Google-provided Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Install operating system dependencies.
# 'build-essential' is needed for some Python packages.
# 'sqlite3' and 'libsqlite3-dev' are the system libraries for SQLite.
RUN apt-get update && apt-get install -y \
    build-essential \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application's code into the container
COPY . .

# Define the command to run your app using the Functions Framework
# This will start the web server that listens for HTTP requests.
CMD exec functions-framework --target=process_http_request --port=8080