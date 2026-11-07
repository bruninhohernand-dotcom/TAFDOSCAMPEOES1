const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function get(name){let start=source.indexOf('function '+name+'('),brace=source.indexOf('{',start),depth=1,i=brace+1;for(;depth;i++){if(source[i]==='{')depth++;if(source[i]==='}')depth--}return source.slice(start,i)}
const views=['home','planos','auth','area','admin','avaliacao','simulado','termo'];
let active,loads=[];
const elements=Object.fromEntries(views.map(id=>[id,{classList:{contains:x=>x==='view',remove(){},add(){active=id}}}]));
const context={session:null,appRole:'visitante',pendingView:null,protectedViews:new Set(views.slice(3)),isStaff(){return ['treinador','admin'].includes(this.appRole)},toast(){},document:{getElementById:id=>elements[id],querySelectorAll:()=>[]},$:selector=>elements[selector.slice(1)]||({classList:{remove(){}},setAttribute(){}}),window:{scrollTo(){}},loadArea:()=>loads.push('area'),loadAdmin:()=>loads.push('admin')};
context.isStaff=()=>['treinador','admin'].includes(context.appRole);
vm.createContext(context);vm.runInContext(get('go'),context);
for(const id of views.slice(3)){context.go(id);assert.equal(active,'auth');assert.equal(context.pendingView,id)}
assert.deepEqual(loads,[]);
context.session={user:{id:'student'}};context.appRole='pendente';context.go('area');assert.equal(active,'auth');
context.appRole='aluno';context.go('admin');assert.equal(active,'area');context.go('avaliacao');assert.equal(active,'avaliacao');
context.appRole='treinador';context.go('area');assert.equal(active,'admin');context.go('simulado');assert.equal(active,'admin');
context.go('unknown');assert.equal(active,'home');
assert.match(source,/async function signup\(/);assert.match(source,/auth\.getUser\(\)/);assert.match(source,/scope:'local'/);
console.log('PASS: guest protection, pending profile denial, student/staff routing, unknown route fallback, Auth integration checks');
