const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const moduleCache = new Map();
function load(relative) {
  if (moduleCache.has(relative)) return moduleCache.get(relative);
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInThisContext(`(function(module,exports,require){${js}\n})`)(mod, mod.exports, (id) => {
    if (id === '@/src/features/studio/studioRoutes') return load('src/features/studio/studioRoutes.ts');
    if (id === '@/src/navigation/nativeIslandConfig') return { STUDIO_SURFACE_PARAM: 'surface', STUDIO_SURFACE_PARAM_VALUE: 'mobile-app' };
    if (id === '@/src/utils/mobileRouting') return { getMessageNotificationTarget: () => null, routeForDesignTarget: () => null, routeForStoreCollectionTarget: () => null };
    if (id === '@/src/config/env') return { env: { webAppUrl: 'https://weaz.me', trustedWebOrigins: [] } };
    throw new Error(`Unexpected dependency ${id}`);
  });
  moduleCache.set(relative, mod.exports);
  return mod.exports;
}
const { resolveStudioSetupAccess: access } = load('src/features/studio/studioAccessPolicy.ts');
const { STUDIO_ROUTES, buildStudioPath, deriveStudioRouteKeyFromPath, isStudioRouteKey } = load('src/features/studio/studioRoutes.ts');
for (const route of Object.keys(STUDIO_ROUTES)) {
  assert.equal(access(route, true), 'allow');
  if (['setup', 'essentials'].includes(route)) {
    assert.equal(access(route, null), 'allow');
    assert.equal(access(route, false), 'allow');
  } else {
    assert.equal(access(route, null), 'check', `${route}: unknown must not authorize`);
    assert.equal(access(route, false), 'setup', `${route}: unfinished setup must gate deep links`);
  }
}
for (const route of ['storeProfile', 'privateDesignAccess', 'payoutSettings', 'verification']) {
  assert.equal(deriveStudioRouteKeyFromPath(buildStudioPath(route)), route);
}
assert.equal(access('unrecognised', null), 'check');
console.log('Studio access: all route states and Settings destinations passed');

for (const key of ['__proto__', 'constructor', 'toString', 'unknown']) assert.equal(isStudioRouteKey(key), false);

// Exercise the actual Settings handlers and gate against explicit auth/setup states.
let auth, setup, focused = true, routeKey = 'overview', pathname = '/studio';
const calls=[];
const React={Fragment:'fragment',createElement:(type,props,...children)=>type==='fragment'?(children.length===1?children[0]:children):typeof type==='function'?type({...props,children}):({type,props:{...props,children}}),useMemo:fn=>fn(),useEffect:()=>{},useLayoutEffect:()=>{}};
const brandAccess={isBrandAccount:user=>Boolean(user&&(user.type==='BRAND'||user.activeBrandId)),hasActiveBrandMembership:user=>Boolean(user?.activeBrandId)};
const retry=()=>calls.push({kind:'retry'});
function uiModule(relative) {
  const mod={exports:{}};
  const js=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  vm.runInThisContext('(function(module,exports,require){'+js+'})')(mod,mod.exports,id=>{
    if(id==='react')return React;
    if(id==='react-native')return {View:'View',ScrollView:'ScrollView',Pressable:'Pressable',StyleSheet:{create:value=>value}};
    if(id==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({bottom:0})};
    if(id==='expo-router')return {Redirect:props=>({type:'Redirect',props}),router:{replace:target=>calls.push({kind:'replace',target})},useGlobalSearchParams:()=>({routeKey}),usePathname:()=>pathname,useIsFocused:()=>focused};
    if(id==='@/src/auth/AuthContext')return {useAuth:()=>auth};
    if(id==='@/src/auth/brandAccess')return brandAccess;
    if(id==='@/src/hooks/useStoreSetupStatus')return {useStoreSetupStatus:()=>setup};
    if(id==='@/src/features/studio/studioAccessPolicy')return {resolveStudioSetupAccess:access};
    if(id==='@/src/theme/ThemeProvider')return {useTheme:()=>({theme:{colors:{bg:'#fff',surfaceAlt:'#eee'}}})};
    if(id==='@/src/styles/tokens')return {tokens:{spacing:new Proxy({},{get:()=>8}),radius:new Proxy({},{get:()=>8})}};
    if(id==='@/src/utils/mobileNavigation')return {drillDownPush:target=>calls.push({kind:'push',target}),topLevelNavigate:target=>calls.push({kind:'navigate',target})};
    if(id==='@/src/utils/navPerf')return {navPerf:{screenMounted:()=>{},firstVisibleUi:()=>{},shellVisible:()=>{}}};
    if(id==='@/src/perf/commitCost')return {useCommitCost:()=>{}};
    if(id.startsWith('@/components/'))return new Proxy({},{get:(_target,key)=>props=>({type:key,props})});
    throw Error('Unmocked UI dependency '+id);
  });return mod.exports;
}
function find(node,predicate){if(!node)return[];if(Array.isArray(node))return node.flatMap(child=>find(child,predicate));if(typeof node!=='object')return[];return [...(predicate(node)?[node]:[]),...find(node.props?.children,predicate)];}
const Settings=uiModule('app/settings.tsx').default,Gate=uiModule('components/studio/StudioSetupGate.tsx').StudioSetupGate;
const freshBrand={id:'actor',type:'BRAND',activeBrandId:'brand',email:'fixture@example.test'};
const status=(complete,isLoading=false,isError=false)=>({isSetupComplete:complete,isLoading,isError,retry});
auth={status:'authenticated',user:freshBrand,signOut:()=>{}};setup=status(true);
let tree=Settings();const buttons=find(tree,n=>n.type==='Pressable');const labels=new Map(buttons.map(n=>[n.props.accessibilityLabel,n]));
for(const[label,key]of [['Store profile','storeProfile'],['Private design access','privateDesignAccess'],['Verification','verification'],['Payouts','payoutSettings']]){calls.length=0;labels.get(label).props.onPress();assert.deepEqual(calls,[{kind:'navigate',target:{pathname:'/studio',params:{routeKey:key}}}],label);}
for(const[label,destination]of [['Customer settings','/settings/customers'],['Billing & subscriptions','/settings/subscriptions'],['Privacy controls','/settings/privacy'],['Push notifications','/settings/notifications'],['Email notifications','/settings/email-preferences'],['Upload preferences','/settings/upload-preferences'],['Theme','/settings/theme'],['Help center','/settings/support'],['Report a problem','/settings/support'],['Terms & conditions','/legal/terms'],['Privacy policy','/legal/privacy'],['Legal center','/legal'],['Delete account','/settings/delete-account']]){calls.length=0;labels.get(label).props.onPress();assert.deepEqual(calls,[{kind:'push',target:destination}],label);}
for(const[label,focus]of [['Phone & email','email'],['Password & security','password']]){calls.length=0;labels.get(label).props.onPress();assert.deepEqual(calls,[{kind:'push',target:{pathname:'/settings/account-security',params:{focus}}}]);}
calls.length=0;labels.get('Your bio').props.onPress();assert.equal(calls[0].target.params.from,'/settings');
for(const state of [status(false),status(null,true),status(null,false,true)]){setup=state;tree=Settings();const rows=find(tree,n=>n.type==='Pressable');for(const label of ['Store profile','Private design access','Verification','Payouts','Customer settings'])assert.equal(rows.some(r=>r.props.accessibilityLabel===label),false,label);assert(rows.some(r=>r.props.accessibilityLabel==='Billing & subscriptions'));if(state.isLoading)assert.equal(rows.find(r=>r.props.accessibilityLabel==='Checking store setup…').props.disabled,true);if(state.isError){calls.length=0;rows.find(r=>r.props.accessibilityLabel==='Retry store setup check').props.onPress();assert.deepEqual(calls,[{kind:'retry'}]);}}
auth={...auth,user:{id:'shopper',type:'REGULAR'}};setup=status(true);tree=Settings();assert.equal(find(tree,n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Payouts').length,0);for(const label of ['Sizing settings','Size charts','Market preferences','Currency','Payment settings'])assert.equal(find(tree,n=>n.type==='Pressable'&&n.props.accessibilityLabel===label).length,1,label);
for(const label of ['Sizing settings','Market preferences','Currency','Payment settings']){const row=find(tree,n=>n.type==='Pressable'&&n.props.accessibilityLabel===label)[0];calls.length=0;row.props.onPress();assert.match(calls[0].target,/^\/settings\//);}
for(const type of ['BRAND','REGULAR']){auth={status:'authenticated',user:{...freshBrand,type}};setup=status(true);focused=true;routeKey='finance';pathname='/studio/finance';assert.equal(JSON.stringify(Gate({children:'protected'})).includes('protected'),type==='BRAND');}
auth={status:'authenticated',user:freshBrand};for(const complete of [null,false]){setup=status(complete,complete===null);focused=false;assert.equal(Gate({children:'protected'}),null);focused=true;tree=Gate({children:'protected'});assert.equal(find(tree,n=>n.type==='Redirect').length,complete===false?1:0);assert.equal(JSON.stringify(tree).includes('protected'),false);}
setup=status(false);routeKey='essentials';pathname='/studio';assert.equal(Gate({children:'setup form'}),'setup form');
routeKey='overview';for(const state of [{status:'loading',user:null},{status:'unauthenticated',user:null},{status:'authenticated',user:{type:'REGULAR',id:'shopper'}}]){auth=state;setup=status(null);assert.equal(JSON.stringify(Gate({children:'protected'})).includes('protected'),false);}
console.log('Actual Settings handlers + role/setup/focus gate state matrix passed');

const {classifyStudioWebUrl}=load('src/features/studio/studioNavigationBridge.ts');
for(const key of ['storeProfile','privateDesignAccess','payoutSettings'])assert.equal(classifyStudioWebUrl('https://weaz.me'+buildStudioPath(key),new Set(['https://weaz.me'])).type,'studio',key);
assert.equal(classifyStudioWebUrl('https://weaz.me/settings?tab=subscription-billing&brandId=brand',new Set(['https://weaz.me'])).type,'native');
assert.equal(classifyStudioWebUrl('https://example.test/settings?tab=billing',new Set(['https://weaz.me'])).type,'external');
console.log('Real Studio bridge accepts Settings destinations and preserves native billing callbacks');

const brandSource=fs.readFileSync(path.join(root,'src/api/BrandApi.ts'),'utf8');const brandAst=ts.createSourceFile('BrandApi.ts',brandSource,ts.ScriptTarget.Latest,true);let statusMethod;function statusVisit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(brandAst)==='getStoreStatus')statusMethod=n.getText(brandAst);ts.forEachChild(n,statusVisit);}statusVisit(brandAst);assert.ok(statusMethod);
(async()=>{for(const input of [null,{}, {isSetupComplete:'false'}, {isSetupComplete:0}, {isSetupComplete:true}, {isSetupComplete:false}]){const code=ts.transpileModule('module.exports = ({'+statusMethod+'}).getStoreStatus;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const mod={exports:{}};vm.runInNewContext(code,{module:mod,exports:mod.exports,apiClient:{get:async()=>({data:input})},unwrapData:x=>x});if(typeof input?.isSetupComplete==='boolean')assert.equal((await mod.exports()).isSetupComplete,input.isSetupComplete);else await assert.rejects(mod.exports(),/incomplete/);}console.log('Actual native status mapper rejects malformed setup fields');})().catch(error=>{console.error(error);process.exitCode=1;});

auth={status:'authenticated',user:{...freshBrand,type:'REGULAR'}};setup=status(true);tree=Settings();for(const label of ['Store profile','Private design access','Verification','Payouts'])assert.equal(find(tree,n=>n.type==='Pressable'&&n.props.accessibilityLabel===label).length,0,'Unsupported browser link '+label);
assert.equal(fs.readFileSync(path.join(root,'app/(tabs)/studio/_layout.tsx'),'utf8').includes('StudioSetupGate'),false,'Native Finance/Staff keep their existing capability boundaries');

(async()=>{let query,raw={isSetupComplete:true,brandId:'expected-brand'};const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(path.join(root,'src/hooks/useStoreSetupStatus.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>{if(id==='@tanstack/react-query')return{useQuery:options=>{query=options;return{data:undefined,isPending:true,isError:false,refetch:()=>Promise.resolve()};}};if(id==='@/src/api/BrandApi')return{brandApi:{getStoreStatus:async()=>raw}};if(id==='@/src/auth/AuthContext')return{useAuth:()=>({status:'authenticated',user:{id:'owner',type:'BRAND',activeBrandId:'expected-brand'}})};if(id==='@/src/auth/brandAccess')return{isBrandAccount:()=>true,getActiveBrandId:()=> 'expected-brand'};if(id==='@/src/query/queryKeys')return{queryKeys:{store:{status:(actor,brand)=>['store','status',actor,brand]}}};throw Error('Unexpected hook dependency '+id);}});assert.equal(mod.exports.useStoreSetupStatus().isSetupComplete,null);assert.equal((await query.queryFn()).brandId,'expected-brand');raw={isSetupComplete:true,brandId:'foreign-brand'};await assert.rejects(query.queryFn(),/incomplete/);assert.equal(query.select(raw),undefined);assert.equal(query.select({isSetupComplete:true,brandId:'expected-brand'}).isSetupComplete,true);console.log('Actual native setup hook rejects foreign responses and cached brand status');})().catch(error=>{console.error(error);process.exitCode=1;});
