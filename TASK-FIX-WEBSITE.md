# Aria — Website Fix Task for executivemind.io

## Context
Site is live on Cloudflare Pages at https://executivemind.io/
Source files at: /mnt/b/Websites/ExecutiveMind/
Deploy command: cd /mnt/b/Websites/ExecutiveMind && npx wrangler pages deploy . --project-name=executivemind-io

## Task 1: Fix Missing Images

The index.html references these images from /assets/ — check each one:
1. `/assets/executive_mind.png` — CHECK if exists at root (/mnt/b/Websites/ExecutiveMind/executive_mind.png) and COPY to /assets/
2. `/assets/em_logo.png` — CHECK root, if missing create a simple green "EM" text SVG
3. `/assets/AI_business_view.avif` — CHECK root (/mnt/b/Websites/ExecutiveMind/AI_business_view.avif) and COPY to /assets/
4. `/assets/kris_racette.png` — CHECK root, if missing create placeholder
5. `/assets/AI_strategy.jpg` — CHECK root (/mnt/b/Websites/ExecutiveMind/AI_strategy.jpg) and COPY
6. `/assets/AI_implementation.jpg` — CHECK root and COPY
7. `/assets/AI_workshops.jpg` — CHECK root and COPY

Agent profile pics already exist in /assets/: nexus_profile.png, mercury_profile.png, janus_profile.png, argus_profile.png, ouroboros_profile.png — DO NOT touch these.

## Task 2: Fix Articles Page
- /mnt/b/Websites/ExecutiveMind/articles.html EXISTS in root
- /mnt/b/Websites/ExecutiveMind/articles/ directory has 5 HTML articles
- Verify the articles.html links point to correct paths (should be /articles/filename.html)
- Check each article HTML for broken image references too

## Task 3: Deploy
Run: cd /mnt/b/Websites/ExecutiveMind && npx wrangler pages deploy . --project-name=executivemind-io

## Task 4: Verify
After deploy, check these URLs return 200 and images load:
1. https://executivemind.io/
2. https://executivemind.io/articles.html
3. https://executivemind.io/articles/AI_bubble_turns_to_water.html

## Important
- Log every action and result
- Note any failures for the agent cost success tally (Veritas audit)
- DO NOT modify the site design/layout — only fix paths and missing files
