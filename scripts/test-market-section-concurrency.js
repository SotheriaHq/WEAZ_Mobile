const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const file = path.join(__dirname, '../src/features/market/components/MarketSectionDetailScreen.tsx');
const text = fs.readFileSync(file, 'utf8');
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const variables = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) variables.set(node.name.text, node.initializer);
  ts.forEachChild(node, visit);
}
visit(source);
function initializer(name) { const value=variables.get(name); assert.ok(value, 'Missing '+name); return value.getText(source); }
const callback = variables.get('loadSection').arguments[0].getText(source);
const code = ts.transpileModule('const itemKey = '+initializer('itemKey')+'; globalThis.load = '+callback+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const item = (id) => ({entityType:'PRODUCT', sourceId:id});
const response = (ids,cursor) => ({section:{key:'fashion',sourceType:'PRODUCT',layout:'GRID',items:ids.map(item),pagination:{nextCursor:cursor,hasNextPage:!!cursor}}});
function fixture(key='fashion') {
  const requests=[];
  const state={section:{key:'fashion'},items:[item('first')],cursor:'old-second',hasNextPage:true,loading:false,loadingMore:false,refreshing:false,error:null};
  const context={sectionKey:key,section:state.section,cursor:state.cursor,hasNextPage:true,PAGE_LIMIT:12,AbortController,Set,Promise,requestRef:{current:null},requestIdRef:{current:0},getMarketSectionDetail:(key,params,config)=>new Promise((resolve,reject)=>requests.push({key,params,signal:config.signal,resolve,reject})),setItems:fn=>{state.items=fn(state.items)}};
  for(const [name,field] of Object.entries({setSection:'section',setCursor:'cursor',setHasNextPage:'hasNextPage',setLoading:'loading',setLoadingMore:'loadingMore',setRefreshing:'refreshing',setError:'error'})) context[name]=value=>{state[field]=value};
  vm.runInNewContext(code, context);
  return {context,state,requests,load:context.load};
}
test('late pagination cannot append stale cards or overwrite a refreshed cursor', async()=>{
  const f=fixture();const more=f.load('more');const reset=f.load('reset');assert.equal(f.requests[0].signal.aborted,true);
  f.requests[1].resolve(response(['fresh-first'],'fresh-second'));await reset;
  f.requests[0].resolve(response(['stale-second'],'stale-third'));await more;
  assert.equal(f.state.cursor,'fresh-second');assert.equal(f.state.items.map(x=>x.sourceId).join(','),'fresh-first');
});
test('repeated end-reached callbacks share one in-flight page request',async()=>{
  const f=fixture();const a=f.load('more');const b=f.load('more');assert.equal(f.requests.length,1);
  f.requests[0].resolve(response(['second'],null));await Promise.all([a,b]);assert.equal(f.state.items.length,2);
});
test('stale errors and finalizers cannot clear the newer request state',async()=>{
  const f=fixture();const a=f.load('reset');const b=f.load('reset');f.state.refreshing=true;
  f.requests[0].reject(new Error('old failure'));await a;assert.equal(f.state.error,null);assert.equal(f.state.refreshing,true);
  f.requests[1].resolve(response(['fresh'],null));await b;assert.equal(f.state.refreshing,false);
});
test('deduplicates within a response as well as across pages',async()=>{
  const f=fixture();const a=f.load('more');f.requests[0].resolve(response(['first','second','second'],null));await a;
  assert.equal(f.state.items.map(x=>x.sourceId).join(','),'first,second');
});
test('an unmounted section ignores a response even if transport cancellation is late',async()=>{
  const f=fixture();const a=f.load('more');f.context.requestRef.current.controller.abort();f.context.requestRef.current=null;
  f.requests[0].resolve(response(['late'],null));await a;assert.equal(f.state.items.map(x=>x.sourceId).join(','),'first');
});
test('an invalid deep link exits loading and gives a useful error',async()=>{
  const f=fixture('');f.state.loading=true;await f.load('reset');assert.equal(f.requests.length,0);assert.equal(f.state.loading,false);assert.match(f.state.error,/Choose a section/);
});
test('column choice depends on section metadata and viewport, including an empty brand section',()=>{
  const columns=ts.transpileModule('const isDesignerSection='+initializer('isDesignerSection')+'; globalThis.columns='+initializer('columnCount')+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const [section,width,expected] of [[{sourceType:'BRAND'},390,1],[{sourceType:'PRODUCT',layout:'BRAND_RAIL'},390,1],[{sourceType:'PRODUCT'},390,2],[{sourceType:'PRODUCT'},800,3]]) {const c={section,width,items:[]};vm.runInNewContext(columns,c);assert.equal(c.columns,expected);}
});
