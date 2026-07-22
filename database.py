import sqlite3

DB_NAME = 'sales.db'

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL,
            product_name TEXT,
            account_details TEXT,
            buyer_email TEXT,
            sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            expiration_date DATETIME,
            status TEXT DEFAULT 'active' 
        )
    ''')
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized.")
