import sqlite3

DATABASE_FILE = "nexus.db"

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