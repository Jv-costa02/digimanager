import sqlite3
import re

DB_NAME = 'sales.db'

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def extract_duration_from_text(text):
    """Extrai a duração em dias de qualquer texto.
    Procura padrões como: '15 ДНЯ', '1 МЕСЯЦ', '30 ДНЕЙ', '7 days', etc.
    """
    if not text:
        return None
    
    name = str(text).upper()
    
    # Padrão: número + dias (russo ou inglês)
    match = re.search(r'(\d+)\s*(?:ДН[ЯЕІЕЙ]+|DAYS?|DIAS?|Д\.)', name)
    if match:
        return int(match.group(1))
    
    # Padrão: número + mês/meses (russo ou inglês)
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
    
    return None

def extract_duration_from_sale(sale_dict, product_name=''):
    """Extrai duração procurando em TODOS os campos do sale.
    Primeiro tenta o product_name, depois options, depois o JSON inteiro.
    """
    # 1. Tentar pelo nome do produto
    duration = extract_duration_from_text(product_name)
    if duration:
        return duration
    
    if isinstance(sale_dict, dict):
        # 2. Tentar pelo campo 'options' (variantes do produto)
        options = sale_dict.get('options', [])
        if isinstance(options, list):
            for opt in options:
                if isinstance(opt, dict):
                    for val in opt.values():
                        duration = extract_duration_from_text(str(val))
                        if duration:
                            return duration
                else:
                    duration = extract_duration_from_text(str(opt))
                    if duration:
                        return duration
        elif isinstance(options, str):
            duration = extract_duration_from_text(options)
            if duration:
                return duration
        
        # 3. Tentar por campos específicos que podem ter a info do plano
        for key in ['option_name', 'variant', 'variant_name', 'sub_product', 'plan', 'product_option', 'goods_name', 'name_option']:
            val = sale_dict.get(key, '')
            if val:
                duration = extract_duration_from_text(str(val))
                if duration:
                    return duration
        
        # 4. Última tentativa: converter o objeto inteiro para texto e procurar
        full_text = str(sale_dict)
        duration = extract_duration_from_text(full_text)
        if duration:
            return duration
    
    return 7  # fallback padrão

# Manter compatibilidade com o nome antigo
def extract_duration_from_name(product_name):
    return extract_duration_from_text(product_name) or 7

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
    
    # Migração: corrigir registros antigos
    cursor.execute("SELECT id, product_name, account_details, sale_date, duration_days FROM sales WHERE duration_days IS NULL OR duration_days = 7")
    rows = cursor.fetchall()
    for row in rows:
        product_name = row['product_name'] or ''
        account_details = row['account_details'] or ''
        
        # Tentar extrair duração do account_details (que tem o JSON completo da venda)
        duration = extract_duration_from_text(account_details)
        if not duration:
            duration = extract_duration_from_text(product_name)
        if not duration:
            duration = 7
        
        # Detectar source
        if 'GGSel' in account_details or 'ggsel' in account_details:
            source = 'ggsel'
        else:
            source = 'digiseller'
        
        # Recalcular expiration_date
        cursor.execute(
            "UPDATE sales SET duration_days = ?, source = ?, expiration_date = datetime(sale_date, '+' || ? || ' days') WHERE id = ?",
            (duration, source, duration, row['id'])
        )
    
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized.")
