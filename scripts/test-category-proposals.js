const assert=require('node:assert/strict');
const path=require('node:path');
const {createScriptRequire}=require('./helpers/mobile-script-require');
const repoRoot=path.resolve(__dirname,'..');
const proposal={id:'proposal-1',name:'Dresses & Gowns',garmentTypeName:'Fit-and-Flare',status:'PENDING'};
const calls=[];
const apiClient={
  get:async(url,options)=>{calls.push({method:'GET',url,options});return{data:{data:url.includes('/suggestions/')?{items:[proposal],nextCursor:'next-page'}:{id:'design-1',title:'Jacket',pendingCategorySuggestion:proposal,categoryId:null,categoryTypeId:null,status:'DRAFT',medias:[]}}};},
  post:async(url,body,options)=>{calls.push({method:'POST',url,body,options});return{data:{data:url==='/categories/suggestions'?proposal:url==='/designs/initialize'?{id:'design-1',uploads:[]}:{id:'design-1'}}};},
};
const requireSource=createScriptRequire({repoRoot,mocks:{
  '@/src/api/httpClient':{apiClient},'react-native':{Platform:{OS:'ios'}},
  'expo-file-system':{File:class{constructor(){throw Error('Unexpected file I/O');}}},
  'expo/fetch':{fetch:()=>{throw Error('Unexpected storage I/O');}},
},globals:{setTimeout,clearTimeout,AbortSignal,AbortController}});
async function main(){
  const proposals=requireSource('@/src/api/CategorySuggestionsApi');
  const controller=new AbortController();
  const page=await proposals.listCategorySuggestions('cursor-1',controller.signal);
  assert.equal(page.items[0].garmentTypeName,'Fit-and-Flare');assert.equal(page.nextCursor,'next-page');
  assert.equal(calls[0].options.params.limit,25);assert.equal(calls[0].options.params.cursor,'cursor-1');assert.equal(calls[0].options.signal,controller.signal);
  const saved=await proposals.submitCategorySuggestion({name:proposal.name,garmentTypeName:proposal.garmentTypeName,description:'A garment family.'});
  assert.equal(saved.id,proposal.id);assert.equal(calls[1].body.garmentTypeName,proposal.garmentTypeName);
  assert.equal(proposals.normalizeCategoryProposal({id:'unknown',name:'Broken',status:'UNRECOGNIZED'}),null);
  const designs=requireSource('@/src/api/DesignApi');
  const payload={title:'Jacket',visibility:'PRIVATE',type:'FEMALE',tags:['jacket'],pendingCategorySuggestionId:proposal.id,assets:[],action:'draft'};
  const result=await designs.saveDesignEditor(payload);
  const initialize=calls.find(call=>call.url==='/designs/initialize');
  const finalize=calls.find(call=>call.url==='/designs/design-1/finalize');
  assert.equal(initialize.body.pendingCategorySuggestionId,proposal.id);assert.equal(initialize.body.categoryId,undefined);
  assert.equal(finalize.body.designMetadata.pendingCategorySuggestionId,proposal.id);assert.equal(finalize.body.action,'draft');
  assert.equal(result.detail.pendingCategoryProposal.garmentTypeName,proposal.garmentTypeName);
  assert.equal(result.detail.categoryId,'');
  console.log('Native category proposal contracts passed: paging, cancellation, envelopes, pair submission, draft metadata and detail hydration.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
