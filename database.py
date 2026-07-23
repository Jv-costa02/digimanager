import sqlite3
import re

DB_NAME = 'sales.db'

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def extract_duration_from_name(product_name):
    """Extrai a duração em dias do nome do produto.
    Ex: '15 ДНЯ' -> 15, '1 МЕСЯЦ' -> 30, '7 ДНЕЙ' -> 7, '30 days' -> 30
    """
    if not product_name:
        return 7  # fallback padrão
    
    name = product_name.upper()
    
    # Padrão: número + dias (russo ou inglês)
    # ДНЯ, ДНЕЙ, ДНІ = dias em russo
    match = re.search(r'(\d+)\s*(?:ДН[ЯЕІЕЙ]+|DAYS?|DIAS?|Д\.)', name)
    if match:
        return int(match.group(1))
    
    # Padrão: número + mês/meses (russo ou inglês)
    # МЕСЯЦ, МЕСЯЦА, МЕСЯЦЕВ = mês em russo
    match = re.search(r'(\d+)\s*(?:МЕСЯЦ[А-Я]*|MONTH[S]?|MES(?:ES)?|М\.)', name)
    if match:
        return int(match.group(1)) * 30
    
    # Padrão: número + semanas
    match = re.search(r'(\d+)\s*(?:НЕДЕЛ[А-Я]*|WEEK[S]?|SEMANA[S]?)', name)
    if match:
        return int(match.group(1)) * 7
    
    # Padrão: número + ano
    match = re.search(r'(\d+)\s*(?:ГОД[А-Я]*|YEAR[S]?|ANO[S]?)', name)
    if match:
        return int(match.group(1)) * 365
    
    return 7  # fallback padrão

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
    
    # Migração: adicionar colunas novas se não existem
    try:
        cursor.execute("SELECT duration_days FROM sales LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE sales ADD COLUMN duration_days INTEGER DEFAULT 7")
        conn.commit()
    
    try:
        cursor.execute("SELECT source FROM sales LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE sales ADD COLUMN source TEXT DEFAULT 'digiseller'")
        conn.commit()
    
    # Migração: corrigir registros antigos que não têm duration_days ou source
    cursor.execute("SELECT id, product_name, account_details, sale_date, duration_days FROM sales WHERE duration_days IS NULL OR duration_days = 7")
    rows = cursor.fetchall()
    for row in rows:
        product_name = row['product_name'] or ''
        account_details = row['account_details'] or ''
        duration = extract_duration_from_name(product_name)
        
        # Detectar source pelo account_details
        if 'GGSel' in account_details:
            source = 'ggsel'
        else:
            source = 'digiseller'
        
        # Recalcular expiration_date
        if row['sale_date']:
            cursor.execute(
                "UPDATE sales SET duration_days = ?, source = ?, expiration_date = datetime(sale_date, '+' || ? || ' days') WHERE id = ?",
                (duration, source, duration, row['id'])
            )
    
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized.")
