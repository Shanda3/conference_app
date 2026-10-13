import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function checkHostedConfig(config){
 const issues=[];const vars=config.vars??{};
 if(!['staging','production'].includes(vars.DEVYO_ENVIRONMENT))issues.push('Set DEVYO_ENVIRONMENT to staging or production.');
 let origin;try{origin=new URL(vars.DEVYO_ORIGIN)}catch{issues.push('Set a valid DEVYO_ORIGIN.');}
 if(origin&&(origin.origin!==vars.DEVYO_ORIGIN||origin.protocol!=='https:'||origin.hostname==='localhost'||origin.hostname.endsWith('.localhost')||origin.hostname.startsWith('127.')||origin.hostname==='[::1]'))issues.push('Hosted DEVYO_ORIGIN must be an exact HTTPS origin, not loopback.');
 if(config.workers_dev!==false||config.preview_urls!==false)issues.push('Disable workers.dev and preview URLs.');
 if(!config.d1_databases?.some(d=>d.binding==='DB'&&d.database_id&&d.database_id!=='00000000-0000-4000-8000-000000000000'))issues.push('Configure an approved isolated D1 database.');
 if(!config.routes?.some(r=>r.custom_domain===true&&origin&&r.pattern===origin.hostname))issues.push('The approved custom domain must match DEVYO_ORIGIN.');
 return issues;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv[2]){console.error('Usage: node scripts/check-hosted-config.mjs <approved-wrangler.json>');process.exitCode=1;}
 else{const issues=checkHostedConfig(JSON.parse(await readFile(process.argv[2],'utf8')));for(const issue of issues)console.error(issue);if(issues.length)process.exitCode=1;else console.log('Static hosted-config checks passed. This does not verify Access, credentials, billing, or authorize deployment.');}
}
