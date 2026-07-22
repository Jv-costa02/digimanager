import sqlite3
import datetime
from database import init_db, get_db

init_db()
conn = get_db()
cursor = conn.cursor()

now = datetime.datetime.now()

mock_data = [
    ('ORD-001', 'Conta Netflix 7 Dias', 'login: user1@email.com\npass: 1234', 'cliente1@gmail.com', now - datetime.timedelta(days=1), now + datetime.timedelta(days=6), 'active'),
    ('ORD-002', 'Spotify Premium', 'login: user2@email.com\npass: 1234', 'cliente2@gmail.com', now - datetime.timedelta(days=7), now, 'active'), # Expira hoje
    ('ORD-003', 'Conta Netflix 7 Dias', 'login: user3@email.com\npass: 1234', 'cliente3@gmail.com', now - datetime.timedelta(days=10), now - datetime.timedelta(days=3), 'active'), # Expirada
    ('ORD-004', 'Conta HBO Max', 'login: user4@email.com\npass: 1234', 'cliente4@gmail.com', now - datetime.timedelta(days=12), now - datetime.timedelta(days=5), 'revoked'),
]

cursor.executemany('''
    INSERT INTO sales (order_id, product_name, account_details, buyer_email, sale_date, expiration_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
''', mock_data)

conn.commit()
conn.close()
print("Mock data inserted.")
