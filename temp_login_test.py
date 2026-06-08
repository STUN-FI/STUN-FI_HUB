import json, urllib.request
email = 'stunfi.bot.test.1780925404@example.com'
req = urllib.request.Request('https://stun-fi-hub-backend.onrender.com/login', data=json.dumps({'email': email, 'password': 'TestPass123'}).encode('utf-8'), headers={'Content-Type':'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print('STATUS', r.status)
        print(r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('STATUS', e.code)
    print(e.read().decode('utf-8'))
except Exception as ex:
    print('ERROR', ex)
