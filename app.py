from flask import Flask, request, jsonify, render_template
import sqlite3
import datetime
import os
import hashlib
import time
import requests
import json
from database import init_db, get_db

app = Flask(__name__)
init_db()

@app.route('/')
def index():
    return render_template('index.html')

def get_digiseller_token():
    api_key = os.environ.get('DIGISELLER_API_KEY')
    seller_id = os.environ.get('DIGISELLER_SELLER_ID')
    
    if not api_key or not seller_id:
        return None
        
    timestamp = int(time.time())
    sign_str = f"{api_key}{timestamp}"
    sign = hashlib.sha256(sign_str.encode('utf-8')).hexdigest()
    
    url = "https://api.digiseller.com/api/apilogin"
    payload = {
        "seller_id": seller_id,
        "timestamp": timestamp,
        "sign": sign
    }
    
    try:
        resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
        if resp.status_code == 200:
            data = resp.json()
            if data.get('retval') == 0:
                return data.get('token')
    except Exception as e:
        print("Erro ao gerar token:", e)
    return None

@app.route('/api/webhook/ggsel', methods=['POST'])
def ggsel_webhook():
    data = request.json if request.is_json else request.form.to_dict()
    order_id = data.get('order_id') or data.get('id_order') or data.get('inv_id')
    
    if not order_id:
        if 'TESTE' in str(data):
            order_id = 'TESTE-' + str(int(time.time()))
        else:
            return jsonify({"error": "No order_id provided"}), 400
            
    product_name = data.get('product_name') or data.get('name_goods') or 'Produto Desconhecido (GGSel)'
    buyer_email = data.get('buyer_email') or data.get('email') or 'N/A'
    account_details = data.get('account_details') or data.get('goods_content') or str(data)

    days_to_expire = 7
    combined_info = (product_name + " " + account_details).lower()
    if '1 mes' in combined_info or '30 dias' in combined_info:
        days_to_expire = 30
    elif '15 dias' in combined_info:
        days_to_expire = 15
        
    now = datetime.datetime.now()
    expiration_date = now + datetime.timedelta(days=days_to_expire)
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM sales WHERE order_id = ?', (order_id,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"status": "ignored", "message": "Sale already exists"}), 200
        
    cursor.execute('INSERT INTO sales (order_id, product_name, account_details, buyer_email, sale_date, expiration_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)', (order_id, product_name, account_details, buyer_email, now.strftime('%Y-%m-%d %H:%M:%S'), expiration_date.strftime('%Y-%m-%d %H:%M:%S'), 'active'))
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "GGSel sale recorded"}), 200

@app.route('/api/webhook/digiseller', methods=['POST'])
def digiseller_webhook():
    data = request.json if request.is_json else request.form.to_dict()
    order_id = data.get('order_id') or data.get('id_order') or data.get('inv_id')
    
    if not order_id:
        # Se for apenas um teste, vamos aceitar com ID fixo
        if 'TESTE' in str(data):
            order_id = 'TESTE-' + str(int(time.time()))
        else:
            return jsonify({"error": "No order_id provided"}), 400
            
    api_key = os.environ.get('DIGISELLER_API_KEY')
    
    if api_key:
        # MODO SEGURO: Verificar venda na API Digiseller
        token = get_digiseller_token()
        if not token:
            return jsonify({"error": "Authentication failed with Digiseller"}), 500
            
        url = f"https://api.digiseller.com/api/purchase/info/{order_id}?token={token}"
        try:
            resp = requests.get(url)
            if resp.status_code == 200:
                p_info = resp.json()
                
                # Checar se existe (retval == 0) e se está pago (invoice_state == 3)
                if p_info.get('retval') != 0:
                    return jsonify({"error": "Purchase not found on Digiseller"}), 404
                    
                # Digiseller pode retornar 'invoice_state' na raiz ou dentro de 'inv'/'invoice'
                state = p_info.get('invoice_state')
                if state is None and 'inv' in p_info:
                    state = p_info['inv'].get('state')
                    
                if str(state) != '3':
                    return jsonify({"error": f"Invoice not paid. State: {state}"}), 400
                
                product_name = p_info.get('name_goods') or data.get('product_name') or data.get('name_goods') or 'Produto Desconhecido'
                buyer_email = p_info.get('email') or data.get('buyer_email') or data.get('email') or 'N/A'
                
                # Juntamos tudo para não perder nenhum dado de acesso (pois pode estar nos 'options' ou 'goods' da API)
                account_details = f"WEBHOOK:\n{str(data)}\n\nAPI_INFO:\n{json.dumps(p_info, ensure_ascii=False)}"
            else:
                return jsonify({"error": "API request failed"}), 500
        except Exception as e:
            print("Erro API Digiseller:", e)
            return jsonify({"error": "Internal error verifying purchase"}), 500
    else:
        # MODO DE COMPATIBILIDADE (Fallback)
        product_name = data.get('product_name') or data.get('name_goods') or 'Produto Desconhecido'
        buyer_email = data.get('buyer_email') or data.get('email') or 'N/A'
        account_details = data.get('account_details') or data.get('goods_content') or str(data)

    days_to_expire = 7
    combined_info = (product_name + " " + account_details).lower()
    if '1 mes' in combined_info or '30 dias' in combined_info:
        days_to_expire = 30
    elif '15 dias' in combined_info:
        days_to_expire = 15
        
    now = datetime.datetime.now()
    expiration_date = now + datetime.timedelta(days=days_to_expire)
    
    # Prevenir duplicidade do order_id
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM sales WHERE order_id = ?', (order_id,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"status": "ignored", "message": "Sale already exists"}), 200
        
    cursor.execute('INSERT INTO sales (order_id, product_name, account_details, buyer_email, sale_date, expiration_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)', (order_id, product_name, account_details, buyer_email, now.strftime('%Y-%m-%d %H:%M:%S'), expiration_date.strftime('%Y-%m-%d %H:%M:%S'), 'active'))
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
        sales.append({"id": row['id'], "order_id": row['order_id'], "product_name": row['product_name'], "account_details": row['account_details'], "buyer_email": row['buyer_email'], "sale_date": row['sale_date'], "expiration_date": row['expiration_date'], "status": row['status']})
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

@app.route('/api/clear-all', methods=['DELETE'])
def clear_all():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM sales')
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "All data cleared"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
