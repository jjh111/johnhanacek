import MiniSearch from 'minisearch';
import fs from 'node:fs';
const ROOT = '/Users/johnhanacek/Documents/GitHub/johnhanacek';
const data = JSON.parse(fs.readFileSync(ROOT + '/Assets/search-chunks.json', 'utf8'));
const ms = new MiniSearch({ fields: ['title','content','tags'], storeFields: ['title'],
  searchOptions: { boost: { title: 3, tags: 2 }, fuzzy: 0.2, prefix: true } });
ms.addAll(data.chunks);
const chunkVecs = new Map(data.chunks.map(c => {
  const buf = Buffer.from(c.vec,'base64'); const i8 = new Int8Array(buf.buffer, buf.byteOffset, buf.length);
  const v = new Float32Array(i8.length); let n=0;
  for (let i=0;i<i8.length;i++){v[i]=i8[i]*c.vecScale;n+=v[i]*v[i];} n=Math.sqrt(n)||1;
  for (let i=0;i<v.length;i++)v[i]/=n; return [c.id,v]; }));
const titles = new Map(data.chunks.map(c=>[c.id,c.title]));
const { pipeline } = await import(ROOT + '/node_modules/@huggingface/transformers/src/transformers.js');
const ex = await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8'});
const cos=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};

// intent-expanded cases: [natural query, expanded BM25 query, expected id in top3]
const CASES = [
  ['what did he study in grad school','education masters thesis Georgetown UCSD research publications',[19]],
  ['why should I hire him','unique differentiator skills expertise experience awards shipped products design AI leadership',[28,21,27]],
  ['what are his skills','expertise skills AI XR robotics design product LLM agent spatial computing coding engineering',[22,10]],
  ['can he code','code coding programming engineer technical javascript html css python unity build ship prototype design engineering',[25,10]],
  ['how much does he charge','services coaching consulting design product workshops retainer sprint',[17,18]],
];
function fuse(bm25, cosList, WB, WS, SEMF) {
  const K=60;
  const bR = new Map(bm25.map((r,i)=>[r.id,i+1]));
  const sR = new Map(cosList.map((r,i)=>[r.id,i+1]));
  const cById = new Map(cosList.map(r=>[r.id,r.c]));
  return [...chunkVecs.keys()].map(id=>{
    const rb=bR.get(id), c=cById.get(id)??0, rs=sR.get(id);
    if(!rb && c<0.28) return null;
    return {id, score:(rb?WB/(K+rb):0)+(rs&&c>=SEMF?WS/(K+rs):0)};
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
}
for (const [WB,WS,SEMF,label] of [[1.0,1.15,0.18,'current'],[1.5,1.0,0.18,'intent-trust'],[1.5,1.0,0.25,'intent-trust+floor'],[2.0,0.8,0.25,'heavy-intent']]) {
  let hits=0;
  console.log(`── ${label} (WB=${WB} WS=${WS} floor=${SEMF})`);
  for (const [nat, expanded, expected] of CASES) {
    const bm25 = ms.search(expanded).map(r=>({id:r.id,score:r.score}));
    const qv = (await ex(nat,{pooling:'mean',normalize:true})).data;
    const cosList=[...chunkVecs.entries()].map(([id,v])=>({id,c:cos(qv,v)})).sort((a,b)=>b.c-a.c);
    const top3 = fuse(bm25,cosList,WB,WS,SEMF).slice(0,3).map(m=>m.id);
    const hit = top3.some(id=>expected.includes(id)); if(hit)hits++;
    console.log(`  ${hit?'✓':'✗'} "${nat}" → ${top3.map(id=>titles.get(id).slice(0,24)).join(' | ')}`);
  }
  console.log(`  ${hits}/${CASES.length}\n`);
}
