import {cp,mkdir} from 'node:fs/promises';
await mkdir('dist/services/api/migrations',{recursive:true});
await cp('services/api/migrations','dist/services/api/migrations',{recursive:true});
