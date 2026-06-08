import json, urllib.request, datetime
email = f"stunfi.bot.test.{int(datetime.datetime.utcnow().timestamp())}@example.com"
data = json.dumps({"name":"Render Test School","email":email,"phone":"+1234567890","password":"TestPass123"}).encode('utf-8')
req = urllib.request.Request('https://stun-fi-hub-backend.onrender.com/school-register', data=data, headers={'Content-Type':'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print('STATUS', r.status)
        print(r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('STATUS', e.code)
    print(e.read().decode('utf-8'))
except Exception as ex:
    print('ERROR', ex)
