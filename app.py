from flask import Flask, request, jsonify, render_template
import sqlite3
import datetime
import os
from database import init_db, get_db

app = Flask(__name__)

# Inicializar BD no startup
init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/webhook/digiseller', methods=['POST'])
@app.route('/api/webhook/ggsel', methods=['POST'])
def digiseller_webhook():
    # O Digiseller ou GGSel pode enviar como JSON ou form-urlencoded
    data = request.json if request.is_json else request.form.to_dict()
    
    # Extração de campos prováveis ou genéricos
    order_id = data.get('order_id') or data.get('id_order') or data.get('inv_id') or 'N/A'
    product_name = data.get('product_name') or data.get('name_goods') or 'Produto Desconhecido'
    buyer_email = data.get('buyer_email') or data.get('email') or 'N/A'
    
    # Vamos armazenar o payload inteiro como account details se não acharmos algo específico
    account_details = data.get('account_details') or data.get('goods_content') or str(data)

    # Calcular expiração (7, 15 ou 30 dias baseado no nome ou dados)
    days_to_expire = 7 # Padrão
    combined_info = (product_name + " " + account_details).lower()
    
    if '1 mes' in combined_info or '1 mês' in combined_info or '30 dias' in combined_info:
        days_to_expire = 30
    elif '15 dias' in combined_info:
        days_to_expire = 15
    elif '7 dias' in combined_info:
        days_to_expire = 7

    now = datetime.datetime.now()
    expiration_date = now + datetime.timedelta(days=days_to_expire)
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO sales (order_id, product_name, account_details, buyer_email, sale_date, expiration_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (order_id, product_name, account_details, buyer_email, now.strftime('%Y-%m-%d %H:%M:%S'), expiration_date.strftime('%Y-%m-%d %H:%M:%S'), 'active'))
    
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "message": "Sale recorded"}), 200

@app.route('/api/sales', methods=['GET'])
def get_sales():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM sales ORDER BY sale_date DESC')
    rows = cursor.fetchall()
    
    sales = []
    for row in rows:
        sales.append({
            "id": row['id'],
            "order_id": row['order_id'],
            "product_name": row['product_name'],
            "account_details": row['account_details'],
            "buyer_email": row['buyer_email'],
            "sale_date": row['sale_date'],
            "expiration_date": row['expiration_date'],
            "status": row['status']
        })
    
    conn.close()
    return jsonify(sales)

@app.route('/api/sales/<int:sale_id>/status', methods=['PUT'])
def update_status(sale_id):
    data = request.json
    new_status = data.get('status')
    
    if new_status not in ['active', 'revoked']:
        return jsonify({"error": "Invalid status"}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE sales SET status = ? WHERE id = ?', (new_status, sale_id))
    conn.commit()
    
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"error": "Sale not found"}), 404
        
    conn.close()
    return jsonify({"status": "success", "message": "Status updated"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
