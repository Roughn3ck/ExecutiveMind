# 🎫Dream Ticket Items
- Integrate MCP Server with VSCode
- Get a webscraper agent / integrate with builder so we can say build like this, agent scrapes and builder builds 🧱🧱🧱

I went looking for an HTML specialised agent and found # VICODER HTML 32B
## **🤗HuggingFace REPO:** https://huggingface.co/vicharai/ViCoder-html-32B-preview-GGUF
## Download from hugging face##

^9fe127

1) Make sure huggingface-cli is installed `pip install -U "huggingface_hub[cli]"`
	- Might need admin
2) Clone into local destination `huggingface-cli download vicharai/ViCoder-html-32B-preview-GGUF ViCoder-32B-Q3_K_M.gguf --local-dir . --local-dir-use-symlinks False`
	- Model root folder will go into the existing location, not the files

(Using `gitclone` would download all the models quantizations)

## Setting Project Instructions to an LLM

I used this prompt to hire Google AI Studio's Gemini 2.5 Pro Preview (which has no retained memory between sessions):

I have downloaded a local model ViCoder-html-32B-preview-GGUF to B:\Github\Models\
. Now how could we incorporate this tool into Langflow and give it the ability to actually interact with my hosted website and implement code changes? I am using VentraIP, and though I have a wordpress hosting package, I would actually like to not use wordpress so we can build a more custom look and feel to the "Executive Mind" website. The website is located at executivemind.io - I will get the FTP fetails so the model could access that way, might that be the easiest? Would you like to help me with this project?

Then when completed we can advertise the website as being Agent Built! (loud cheer from the crowd)`
### 🧑‍✈️Strategic Plan: From Idea to "Agent Built"
**Phase 1: The Foundation - Local Code Generation**  
Goal: Prove the AI can write and save website code to your local computer.

**Phase 2: The Agent's Toolkit - File I/O & FTP**  
Goal: Give the AI "hands" by creating tools it can use to read local files and upload them to your server.

**Phase 3: The Brain - Langflow Orchestration**  
Goal: Use Langflow to connect the AI's "brain" (the ViCoder model) to its "hands" (the tools), allowing it to execute multi-step tasks.

**Phase 4: The Feedback Loop - Making the Agent "Smart"**  
Goal: Create a way for the agent to "see" the live website, get feedback (from you), and make corrections.
### 🤿Deep Dive: How We'll Tackle This
#### 1. Your Hosting & Website (VentraIP & No-WordPress)

Your decision to **not use WordPress is a brilliant one** for this project. A custom site built with static HTML, CSS, and JavaScript files is infinitely easier for an AI agent to manage than a complex WordPress installation with databases and PHP.

- **FTP is the perfect method for deployment.** It's simple and direct. The agent's process will be: Generate Code -> Save File Locally -> Upload File via FTP. We can build a Python tool for this that the agent can call.
#### 2. The Role of the ViCoder LLM

The ViCoder model running on your machine is the **Code Generation Engine**. It's not a thinking being. Its job is to take a detailed prompt and output high-quality code.

- **It CAN:** "Write the HTML and CSS for a hero section with a dark background, a centered headline 'Welcome to Executive Mind', and a call-to-action button."
- **It CANNOT (by itself):** "Log into my FTP server and update the index.html file."

This is the most important concept. The LLM produces text. We need to build a system around it to turn that text into action.
#### 3. The Role of Langflow (The Most Important Part)

Langflow is our **Orchestrator or "Agent Brain"**. This is where we will design the logic flow. A simplified flow in Langflow would look something like this:

1. **User Input:** You give a task, e.g., "Change the headline on the homepage to 'AI-Powered Business Strategy'."
2. **LLM (Planner):** A powerful LLM (we might need to use a small cloud model like GPT-4o for the planning part) breaks down the task:
    - "I need to read the current index.html file."
    - "I need to instruct the ViCoder model to modify the HTML."
    - "I need to save the new HTML."
    - "I need to upload the new file via FTP."
3. **Tool Executor:** Langflow then calls the necessary tools in order:
    - **File Reader Tool:** A custom Python function we write that reads B:\path\to\website\index.html.
    - **ViCoder LLM (Code Generator):** Langflow takes the file content and your prompt and sends it to your locally running ViCoder model to get the new code.
    - **File Writer Tool:** Another Python function that saves the new code back to index.html.
    - **FTP Uploader Tool:** A final Python function that takes your FTP details and uploads the modified file to executivemind.io
### 🪜Steps 
1) **Set up a Local Web Dev Environment:**
    - Create a folder for your website project, e.g., B:\Websites\ExecutiveMind
    - Inside that folder, create a simple index.html and a style.css file
    - Install a local web serverVS Code's "Live Server" extension
	    a) Open Visual Studio Code
	    b) Access the extensions view `ctrl + shift + X`
	    c) Search for Live Server by Ritwick Dey and install
	    d) Restart VSCode for the changes to take effect
	- You now have an application that shows you changes to code in real time 😊

# **✅Phase 2 - ViCoder 👷‍♂️**
1) Use a tool like **LM Studio** or **Oobabooga's text-generation-webui**. These are the easiest ways to serve a local GGUF model and give it an API endpoint that Langflow can talk to
2) Go to lmstudio.ai to get LM Studio, run once installed
3) If you already downloaded the model [[#^9fe127]] clip skip top right
4) Click the folder📂 icon on the top left 3 icons down
5) Next to that, a little above change the `📁Models Directory` to your model
6) Load the ViCoder-32B-Q3_K_M.gguf model
7) **Crucially, offload as many layers to your 1050 Ti as you can!** Use the -ngl (number of GPU layers) setting. Experiment to find the max number before you run out of VRAM. This is the single biggest factor for speed
8) **Manual Test (The "Hello World" of our Agent):**
    - Start the server in LM Studio (could use Oobabooga but hate the name📛) 
    - Give it a simple prompt: Create a basic HTML5 boilerplate for a website titled "Executive Mind"
    - Copy the code it generates, paste it into your index.html, and see if it works with your Live Server
9. **Connect to webhost via FTP
	- VentraIP (my host) uses FTP over TLS (FTPS), so create the script to manage this (See in folder file called ftp_uploader.py) **Before sharing to any repo create example and use gitignore as file contains password info**
	- The root of the FTP folder is deliberately set to ./agent/ for branding purposes. This means all future links will need to consider this. *Note:* all files have to be in the "storeroom" at public_html to be outward facing so the root is actually /home/executiv/public_html
	- As I'm hosting the website in a subfolder an .htaccess file is required at the root to tell the server to forward any visitors silently to the ./agent/index.html location
# **✅Phase 3 - Langflow🧠 Mouth and Eyes 👄👀** 
1. **Connect Langflow 🧬** to your set up. There are full instructions located at https://github.com/Roughn3ck/LangFlow_baremetal
2. Created a custom component called file_writer_component.py. Place this in the CustomComponents directory
3. Created a custom component called file_reader_component.py. Place this in the CustomComponents directory

### **Notes on Quantized Versions**

#### ViCoder-html-32B-preview-GGUF Models

| Quantization | Size (GB) | Expected Quality                            | Filename (for huggingface-cli) | Developer Notes                                                    |
| ------------ | --------- | ------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| Q8_0         | 34.8      | 🟢 Very good – nearly full precision        | ViCoder-32B-Q8_0.gguf          | 8-bit quantization, very close to full precision for most tasks.   |
| Q6_K         | 26.9      | 🟢 Good – retains most performance          | ViCoder-32B-Q6_K.gguf          | 6-bit quantization, high quality, efficient for most applications. |
| Q4_K_M       | 19.9      | 🟡 Moderate – usable with minor degradation | ViCoder-32B-Q4_K_M.gguf        | 4-bit quantization, good tradeoff between quality and size.        |
| Q3_K_M       | 15.9      | 🟠 Lower – may lose accuracy                | ViCoder-32B-Q3_K_M.gguf        | 3-bit quantization, lower quality, best for minimal memory use.    |
