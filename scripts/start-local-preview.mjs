// Foreground task-owned preview. No daemon, startup service, credentials copy or remote action.
import {cp,mkdir,symlink,open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createServer} from 'node:net';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=8793;
const probe=createServer();
try{await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',resolve)});await new Promise(resolve=>probe.close(resolve));}catch{console.error('Port 8793 is already in use. Keep the existing preview or stop its task session before restarting.');process.exit(1);}
const snapshot=join(root,'.preview','runs',String(Date.now()));
await mkdir(snapshot,{recursive:true});
await cp(join(root,'dist'),snapshot,{recursive:true,filter:source=>!/(^|\/)\.dev\.vars[^/]*$/.test(source)&&!/(^|\/)\.env[^/]*$/.test(source)});
await symlink(join(root,'.dev.vars'),join(snapshot,'server','.dev.vars'));
const log=await open(join(snapshot,'preview.log'),'a',0o600);
let child,stopping=false;
for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{stopping=true;child?.kill('SIGTERM')});
console.log('Devyo preview: http://127.0.0.1:8793/ (loopback only). Keep this task process running.');
console.log('Serving a stable build snapshot; later builds will not replace running files.');
for(let attempt=0;attempt<4&&!stopping;attempt++){
 child=spawn(process.execPath,['--import',join(root,'scripts/sites-env.mjs'),join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',join(snapshot,'server/wrangler.json'),'--local','--persist-to',join(root,'.wrangler/state'),'--ip','127.0.0.1','--port',String(port),'--inspector-port','0'],{cwd:root,stdio:['ignore',log.fd,log.fd]});
 const result=await new Promise(resolve=>{child.once('error',()=>resolve('spawn error'));child.once('exit',(code,signal)=>resolve(signal??code));});
 if(stopping||result===0)break;
 console.error(`Local preview exited (${result}); bounded restart ${attempt+1}/3.`);
 if(attempt<3)await new Promise(resolve=>setTimeout(resolve,1500));else process.exitCode=1;
}
await log.close();
