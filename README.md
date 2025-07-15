# 🧠 Executive Mind: AI-Powered Business & Web Automation

Welcome to the central repository and knowledge base for the **Executive Mind** project. This vault contains all the documentation, code snippets, strategic plans, and operational guides for our suite of AI-driven tools.

This repository is managed as an [Obsidian Vault](https://obsidian.md/ "null") and a [GitHub Repo](https://github.com/ "null"). It is critical to keep this documentation synchronized and regularly backed up.

## 🚀 Getting Started

If you are new to the project, follow these steps to get set up:

1. **Clone the Repository**: Get a local copy of the project on your machine.
2. **Open as Obsidian Vault**: Point Obsidian to the cloned folder to use its full linking and knowledge management capabilities.
3. **Review the Architecture**: Read the `Project Architecture` section below to understand how the different components fit together.
4. **Check the Guides**: Dive into the detailed guides in the `Quick Access Links` section for specific setup instructions.
    

## 🛠️ Technology Stack

This project leverages a variety of platforms and tools. Here is a summary:

|   |   |   |
|---|---|---|
|**Category**|**Technology / Platform**|**Purpose**|
|**Cloud Platform**|Google Cloud Platform (GCP)|Hosting the Nexus Email Agent and managing secrets.|
|**AI & Machine Learning**|Gemini 2.5 Pro, ViCoder LLM|Powering the email agent and the HTML coding agent.|
|**Orchestration**|Langflow|Designing the logic and workflows for the coding agent.|
|**Databases**|PostgreSQL (Cloud SQL), SQLite|Storing knowledge base data for the Nexus agent.|
|**Web Hosting**|VentraIP (with FTP)|Hosting the `executivemind.io` website files.|
|**Documentation**|Obsidian, GitHub|Managing project notes and version control.|

## 🏛️ Project Architecture

The Executive Mind initiative is comprised of several interconnected projects designed to automate communications and web development.

|   |   |   |   |
|---|---|---|---|
|**Component**|**Emoji**|**Purpose & Key Technologies**|**Status & Notes**|
|**Nexus Email Agent**|📧|An automated email response system that processes inquiries from `executivemind.io`.|Deployed on **Google Cloud Platform (GCP)**.|
|**Knowledge Base**|🗃️|Stores inquiry data to improve agent responses over time.|Two versions exist: **Cloud PostgreSQL** and **Webhosted SQLite**.|
|**HTML Coding Agent**|💻|A local agent for building and modifying the `executivemind.io` website.|Uses the local **ViCoder LLM**, orchestrated by **Langflow**.|
|**Content Generation**|📜|Scripts and prompts for creating marketing and video content.|Utilizes **Gemini 2.5 Pro** for creative tasks.|

## 📜 Governance & Synchronization

To ensure the integrity and history of this project, all contributors must adhere to the following governance procedures.

### ✨ Guiding Principles

1. **Document Everything**: Every new process, architectural change, or decision must be documented in this vault.
2. **Commit Regularly**: Small, frequent commits are better than large, infrequent ones.
3. **Write Clear Commit Messages**: Explain _what_ changed and _why_ to maintain a clear history.

### 🔄 Backup & Synchronization Procedure

All changes made within the local Obsidian vault must be regularly pushed to GitHub.

|                       |                                |           |                                                                                       |
| --------------------- | ------------------------------ | --------- | ------------------------------------------------------------------------------------- |
| **Step**              | **Command**                    | **Emoji** | **Description**                                                                       |
| **1. Stage Changes**  | `git add .`                    | ➕         | Prepares all new or modified files for backup.                                        |
| **2. Commit Changes** | `git commit -m "Your message"` | ✍️        | Saves a snapshot of your files. **Replace `"Your message"`** with a clear summary.    |
| **3. Push to GitHub** | `git push origin main`         | 🚀        | Uploads your saved snapshot to the GitHub repository, creating a secure cloud backup. |

#### ✅ Recommended Backup Cadence

- **Daily Push**: At the end of each workday.
- **After Major Changes**: Immediately after completing a significant task.

## 🔗 Quick Access Links

Use these links to quickly navigate to the detailed documentation for each project component.

- [suspicious link removed]
    
- [suspicious link removed]
    
- [suspicious link removed]
    
- [suspicious link removed]
    
- [suspicious link removed]