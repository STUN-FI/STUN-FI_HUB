const http = require('http');
const data = JSON.stringify({ message: 'Hello from test' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/ai/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY');
    console.log(body);
  });
});

req.on('error', err => {
  console.error('REQUEST ERROR', err);
});

req.write(data);
req.end();
