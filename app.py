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

def get_ggsel_token():
    api_key = os.environ.get('GGSEL_API_KEY')
    seller_id = os.environ.get('GGSEL_SELLER_ID')
    
    if not api_key or not seller_id:
        return None
        
    timestamp = int(time.time())
    sign_str = f"{api_key}{timestamp}"
    sign = hashlib.sha256(sign_str.encode('utf-8')).hexdigest()
    
    url = "https://seller.ggsel.com/api_sellers/api/apilogin"
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
        print("Erro ao gerar token GGSel:", e)
    return None

@app.route('/api/webhook/ggsel', methods=['POST'])
def ggsel_webhook():
    data = request.json if request.is_json else request.form.to_dict()
    
    # GGSel usa ID_I como número da fatura
    order_id = data.get('ID_I') or data.get('id_i') or data.get('order_id') or data.get('id_order') or data.get('inv_id')
    
    if not order_id:
        if 'TESTE' in str(data):
            order_id = 'TESTE-' + str(int(time.time()))
        else:
            return jsonify({"error": "No order_id provided"}), 400
            
    ggsel_api_key = os.environ.get('GGSEL_API_KEY')
    ggsel_seller_id = os.environ.get('GGSEL_SELLER_ID')
    
    if ggsel_api_key and ggsel_seller_id:
        # MODO SEGURO GGSEL
        token = get_ggsel_token()
        if not token:
            return jsonify({"error": "Authentication failed with GGSel"}), 500
            
        url = f"https://seller.ggsel.com/api_sellers/api/purchase/info/{order_id}?token={token}"
        try:
            resp = requests.get(url)
            if resp.status_code == 200:
                p_info = resp.json()
                
                if p_info.get('retval') != 0:
                    return jsonify({"error": "Purchase not found on GGSel"}), 404
                    
                content = p_info.get('content', {})
                state = content.get('invoice_state')
                owner = str(content.get('owner'))
                
                if owner != str(ggsel_seller_id):
                    return jsonify({"error": "Purchase does not belong to this seller"}), 403
                    
                if str(state) not in ['3', '4']:
                    return jsonify({"error": f"Invoice not paid. State: {state}"}), 400
                
                product_name = content.get('name') or data.get('product_name') or f"GGSel Produto (ID: {content.get('item_id')})"
                buyer_email = data.get('email') or 'N/A'
                account_details = f"WEBHOOK:\n{str(data)}\n\nAPI_INFO:\n{json.dumps(p_info, ensure_ascii=False)}"
            else:
                return jsonify({"error": "API request failed"}), 500
        except Exception as e:
            print("Erro API GGSel:", e)
            return jsonify({"error": "Internal error verifying purchase"}), 500
    else:
        # MODO DE COMPATIBILIDADE (Fallback) GGSel
        product_id = data.get('ID_D') or data.get('id_d') or 'Desconhecido'
        product_name = data.get('product_name') or data.get('name_goods') or f"GGSel Produto (ID: {product_id})"
        buyer_email = data.get('email') or data.get('buyer_email') or 'N/A'
        account_details = data.get('account_details') or data.get('goods_content') or f"Venda processada pela GGSel. Detalhes indisponíveis no Webhook."

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
    if new_status not in ['active', 'revoked', 'refunded']:
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

# === IMPORTAÇÃO DE VENDAS ANTIGAS ===

@app.route('/api/import/digiseller', methods=['POST'])
def import_digiseller():
    token = get_digiseller_token()
    if not token:
        return jsonify({"error": "Digiseller não configurada ou falha na autenticação"}), 400
    
    imported = 0
    skipped = 0
    errors = []
    
    try:
        # Buscar vendas dos últimos 90 dias
        date_start = (datetime.datetime.now() - datetime.timedelta(days=90)).strftime('%Y-%m-%d 00:00:00')
        date_finish = datetime.datetime.now().strftime('%Y-%m-%d 23:59:59')
        
        page = 1
        while True:
            url = f"https://api.digiseller.com/api/seller-sells/v2?token={token}"
            payload = {
                "product_ids": [],
                "date_start": date_start,
                "date_finish": date_finish,
                "returned": 0,
                "page": page,
                "rows": 100
            }
            resp = requests.post(url, json=payload, headers={"Content-Type": "application/json", "Accept": "application/json"})
            if resp.status_code != 200:
                errors.append(f"API retornou status {resp.status_code} na página {page}")
                break
                
            data = resp.json()
            rows = data.get('rows', [])
            if not rows:
                break
            
            conn = get_db()
            cursor = conn.cursor()
            for sale in rows:
                order_id = str(sale.get('inv', {}).get('id', '') or sale.get('id_i', ''))
                if not order_id:
                    continue
                    
                cursor.execute('SELECT id FROM sales WHERE order_id = ?', (order_id,))
                if cursor.fetchone():
                    skipped += 1
                    continue
                
                product_name = sale.get('product', {}).get('name', '') or sale.get('name_goods', '') or 'Produto Digiseller'
                buyer_email = sale.get('email', '') or 'N/A'
                
                sale_date_str = sale.get('date_pay', '') or sale.get('date_confirm', '') or datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                try:
                    sale_date = datetime.datetime.strptime(sale_date_str[:19], '%Y-%m-%dT%H:%M:%S')
                except:
                    try:
                        sale_date = datetime.datetime.strptime(sale_date_str[:19], '%Y-%m-%d %H:%M:%S')
                    except:
                        sale_date = datetime.datetime.now()
                
                expiration_date = sale_date + datetime.timedelta(days=7)
                account_details = f"Importado da Digiseller.\n{json.dumps(sale, ensure_ascii=False, default=str)}"
                
                # Checar status do invoice
                inv_state = sale.get('inv', {}).get('state', 3)
                status = 'active'
                if str(inv_state) == '5':
                    status = 'refunded'
                
                cursor.execute('INSERT INTO sales (order_id, product_name, account_details, buyer_email, sale_date, expiration_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (order_id, product_name, account_details, buyer_email, sale_date.strftime('%Y-%m-%d %H:%M:%S'), expiration_date.strftime('%Y-%m-%d %H:%M:%S'), status))
                imported += 1
            
            conn.commit()
            conn.close()
            
            # Se recebeu menos que 100, acabaram as páginas
            if len(rows) < 100:
                break
            page += 1
            
    except Exception as e:
        errors.append(str(e))
        print("Erro ao importar Digiseller:", e)
    
    return jsonify({"status": "success", "imported": imported, "skipped": skipped, "errors": errors})

@app.route('/api/import/ggsel', methods=['POST'])
def import_ggsel():
    token = get_ggsel_token()
    if not token:
        return jsonify({"error": "GGSel não configurada ou falha na autenticação"}), 400
    
    imported = 0
    skipped = 0
    errors = []
    
    try:
        date_start = (datetime.datetime.now() - datetime.timedelta(days=90)).strftime('%Y-%m-%d 00:00:00')
        date_finish = datetime.datetime.now().strftime('%Y-%m-%d 23:59:59')
        
        page = 1
        while True:
            url = f"https://seller.ggsel.com/api_sellers/api/seller-sells/v2?token={token}"
            payload = {
                "product_ids": [],
                "date_start": date_start,
                "date_finish": date_finish,
                "returned": 0,
                "page": page,
                "rows": 100
            }
            resp = requests.post(url, json=payload, headers={"Content-Type": "application/json", "Accept": "application/json"})
            if resp.status_code != 200:
                errors.append(f"API GGSel retornou status {resp.status_code} na página {page}")
                break
                
            data = resp.json()
            rows = data.get('rows', [])
            if not rows:
                break
            
            conn = get_db()
            cursor = conn.cursor()
            for sale in rows:
                order_id = str(sale.get('inv', {}).get('id', '') or sale.get('id_i', ''))
                if not order_id:
                    continue
                    
                cursor.execute('SELECT id FROM sales WHERE order_id = ?', (order_id,))
                if cursor.fetchone():
                    skipped += 1
                    continue
                
                product_name = sale.get('product', {}).get('name', '') or sale.get('name_goods', '') or 'Produto GGSel'
                buyer_email = sale.get('email', '') or 'N/A'
                
                sale_date_str = sale.get('date_pay', '') or sale.get('date_confirm', '') or datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                try:
                    sale_date = datetime.datetime.strptime(sale_date_str[:19], '%Y-%m-%dT%H:%M:%S')
                except:
                    try:
                        sale_date = datetime.datetime.strptime(sale_date_str[:19], '%Y-%m-%d %H:%M:%S')
                    except:
                        sale_date = datetime.datetime.now()
                
                expiration_date = sale_date + datetime.timedelta(days=7)
                account_details = f"Importado da GGSel.\n{json.dumps(sale, ensure_ascii=False, default=str)}"
                
                inv_state = sale.get('inv', {}).get('state', 3)
                status = 'active'
                if str(inv_state) == '5':
                    status = 'refunded'
                
                cursor.execute('INSERT INTO sales (order_id, product_name, account_details, buyer_email, sale_date, expiration_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (order_id, product_name, account_details, buyer_email, sale_date.strftime('%Y-%m-%d %H:%M:%S'), expiration_date.strftime('%Y-%m-%d %H:%M:%S'), status))
                imported += 1
            
            conn.commit()
            conn.close()
            
            if len(rows) < 100:
                break
            page += 1
            
    except Exception as e:
        errors.append(str(e))
        print("Erro ao importar GGSel:", e)
    
    return jsonify({"status": "success", "imported": imported, "skipped": skipped, "errors": errors})

# === VERIFICAÇÃO DE REFUNDS ===

@app.route('/api/check-refunds', methods=['POST'])
def check_refunds():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, order_id FROM sales WHERE status = 'active'")
    active_sales = cursor.fetchall()
    conn.close()
    
    refunded_count = 0
    checked = 0
    errors = []
    
    # Checar na Digiseller
    digi_token = get_digiseller_token()
    ggsel_token = get_ggsel_token()
    
    for sale in active_sales:
        sale_id = sale['id']
        order_id = str(sale['order_id'])
        
        # Tentar na Digiseller primeiro
        if digi_token:
            try:
                url = f"https://api.digiseller.com/api/purchase/info/{order_id}?token={digi_token}"
                resp = requests.get(url)
                if resp.status_code == 200:
                    p_info = resp.json()
                    if p_info.get('retval') == 0:
                        state = p_info.get('invoice_state')
                        if state is None and 'inv' in p_info:
                            state = p_info['inv'].get('state')
                        if str(state) == '5':
                            conn = get_db()
                            cursor = conn.cursor()
                            cursor.execute("UPDATE sales SET status = 'refunded' WHERE id = ?", (sale_id,))
                            conn.commit()
                            conn.close()
                            refunded_count += 1
                        checked += 1
                        continue
            except Exception as e:
                pass
        
        # Tentar na GGSel
        if ggsel_token:
            try:
                url = f"https://seller.ggsel.com/api_sellers/api/purchase/info/{order_id}?token={ggsel_token}"
                resp = requests.get(url)
                if resp.status_code == 200:
                    p_info = resp.json()
                    if p_info.get('retval') == 0:
                        content = p_info.get('content', {})
                        state = content.get('invoice_state')
                        if str(state) == '5':
                            conn = get_db()
                            cursor = conn.cursor()
                            cursor.execute("UPDATE sales SET status = 'refunded' WHERE id = ?", (sale_id,))
                            conn.commit()
                            conn.close()
                            refunded_count += 1
                        checked += 1
            except Exception as e:
                pass
    
    return jsonify({"status": "success", "checked": checked, "refunded": refunded_count})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
