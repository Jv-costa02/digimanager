import os, json, requests
from app import get_digiseller_token
from dotenv import load_dotenv
load_dotenv()
token = get_digiseller_token()
print('Token exists:', token is not None)
seller_id = int(os.environ.get('DIGISELLER_SELLER_ID', 0))
url = f'https://api.digiseller.com/api/seller-sells/v2?token={token}'
payload = {'id_seller': seller_id, 'product_ids': [], 'date_start': '2026-06-01 00:00:00', 'date_finish': '2026-08-01 00:00:00', 'returned': 0, 'page': 1, 'rows': 5}
resp = requests.post(url, json=payload, headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
rows = resp.json().get('rows', [])
print('Rows:', len(rows))
for r in rows:
    order_id = r.get('invoice_id')
    info_url = f'https://api.digiseller.com/api/purchase/info/{order_id}?token={token}'
    info_resp = requests.get(info_url)
    info_data = info_resp.json()
    print('Order', order_id, 'Options:', json.dumps(info_data.get('options', []), ensure_ascii=False))

