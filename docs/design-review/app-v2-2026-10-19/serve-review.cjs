const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const mime={'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer((req,res)=>{
  try{const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');fs.createReadStream(file).on('error',()=>res.writeHead(404).end('Not found')).pipe(res);}catch{res.writeHead(400).end('Bad request');}
});
server.listen(Number(process.env.REVIEW_PORT||5190),'127.0.0.1',()=>console.log('APP design review: http://127.0.0.1:'+server.address().port));
