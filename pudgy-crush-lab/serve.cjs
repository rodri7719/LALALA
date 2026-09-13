const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/fondo picado.png':'fondo picado.png','/responsive.css':'responsive.css','/layout.js':'layout.js'};
http.createServer((req,res)=>{
  let name;
  try { name = files[decodeURIComponent(new URL(req.url,'http://localhost').pathname)]; } catch {}
  if(!name){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.png')?'image/png':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
  fs.createReadStream(path.join(__dirname,name)).pipe(res);
}).listen(5174,'127.0.0.1',()=>console.log('Pudgy Crush: http://127.0.0.1:5174'));
