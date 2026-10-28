import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppSelectSheet } from '@/components/ui/AppSelectSheet';
import { useAuth } from '@/src/auth/AuthContext';
import { listCategorySuggestions, submitCategorySuggestion, type CategoryProposal } from '@/src/api/CategorySuggestionsApi';
import { tokens } from '@/src/styles/tokens';

export function DesignTaxonomyProposalField({value,onChange,scopeKey,disabled=false}:{
  value:CategoryProposal|null;onChange:(value:CategoryProposal|null)=>void;scopeKey:string;disabled?:boolean;
}) {
  const {user}=useAuth();
  const [open,setOpen]=useState(false),[pickerOpen,setPickerOpen]=useState(false);
  const [name,setName]=useState(''),[garmentTypeName,setGarmentTypeName]=useState(''),[description,setDescription]=useState('');
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  const posting=useRef<symbol|null>(null),mounted=useRef(true),currentScope=useRef('');
  currentScope.current=`${user?.id??''}:${scopeKey}`;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    posting.current=null;setBusy(false);setFeedback('');setName('');setGarmentTypeName('');setDescription('');setOpen(false);setPickerOpen(false);
  },[scopeKey,user?.id]);
  const query=useInfiniteQuery({
    queryKey:['category-suggestions','mine',user?.id],initialPageParam:undefined as string|undefined,
    queryFn:({pageParam,signal})=>listCategorySuggestions(pageParam,signal),
    getNextPageParam:page=>page.nextCursor??undefined,staleTime:30_000,
    enabled:Boolean(user?.id)&&(open||Boolean(value)),
  });
  const requests=query.data?.pages.flatMap(page=>page.items)??[];
  const current=requests.find(request=>request.id===value?.id);
  useEffect(()=>{
    if(current&&value&&current.status!==value.status)onChange(current);
  },[current,value,onChange]);
  const selectable=requests.filter(request=>request.status==='PENDING'&&request.garmentTypeName);
  const submit=async()=>{
    if(posting.current||disabled||!user?.id)return;
    const requestOwner=Symbol();posting.current=requestOwner;setBusy(true);setFeedback('');const scope=currentScope.current;
    try{
      const saved=await submitCategorySuggestion({name:name.trim(),garmentTypeName:garmentTypeName.trim(),description:description.trim()});
      if(!mounted.current||currentScope.current!==scope)return;
      onChange(saved);setName('');setGarmentTypeName('');setDescription('');setOpen(false);void query.refetch();
    }catch(error){
      if(mounted.current&&currentScope.current===scope){
        const message=(error as {response?:{data?:{message?:unknown}}}).response?.data?.message;
        setFeedback(typeof message==='string'?message:'The request could not be confirmed. Your entries are retained. Refresh your requests before retrying.');
      }
    }finally{if(posting.current===requestOwner){posting.current=null;if(mounted.current&&currentScope.current===scope)setBusy(false);}}
  };
  return <View style={styles.stack}>
    {value?<View style={styles.stack}>
      <AppText variant="bodyBold" tone={value.status==='REJECTED'?'danger':'primary'}>
        {value.status==='REJECTED'?'📝 Request not approved':'⏳ Category review'}: {value.name} · {value.garmentTypeName}
      </AppText>
      <AppText variant="body" tone="secondary">Design review is separate. This category stays out of public category search until taxonomy approval.</AppText>
      <Button title="Choose an approved category instead" variant="secondary" disabled={disabled||busy} onPress={()=>onChange(null)} />
    </View>:null}
    <Button title={open?'Close category requests':'Missing a category or garment type?'} variant="secondary" disabled={disabled||busy} onPress={()=>setOpen(previous=>!previous)} />
    {open?<View style={styles.stack}>
      {query.isPending?<AppText variant="body">Loading your requests…</AppText>:null}
      {query.isError?<AppText variant="body" tone="danger">Your requests could not be loaded. Use Refresh requests to retry.</AppText>:null}
      <Button title="Refresh requests" variant="secondary" disabled={disabled||query.isFetching} onPress={()=>query.refetch()} />
      {selectable.length?<Button title="Use a pending request" variant="secondary" disabled={disabled||busy} onPress={()=>setPickerOpen(true)} />:null}
      {query.hasNextPage?<Button title="Load more requests" variant="secondary" disabled={disabled||query.isFetching} onPress={()=>query.fetchNextPage()} />:null}
      <View style={styles.row}>
        <Input label="Garment category" required maxLength={48} value={name} onChangeText={setName} editable={!busy&&!disabled} containerStyle={styles.cell} />
        <Input label="Garment type" required maxLength={48} value={garmentTypeName} onChangeText={setGarmentTypeName} editable={!busy&&!disabled} containerStyle={styles.cell} />
      </View>
      <Input label="What garments belong in this category?" required multiline maxLength={500} value={description} onChangeText={setDescription} editable={!busy&&!disabled} />
      <AppText variant="body" tone="secondary">Propose both together. You can send up to five requests per day. A saved draft stays unpublished.</AppText>
      <Button title="Request category and garment type review" variant="brand" loading={busy}
        disabled={disabled||busy||name.trim().length<2||garmentTypeName.trim().length<2||!description.trim()} onPress={submit} />
      {feedback?<AppText variant="body" tone="danger" accessibilityRole="alert">{feedback}</AppText>:null}
    </View>:null}
    <AppSelectSheet visible={pickerOpen} title="Your pending category requests" value={value?.id??null}
      options={selectable.map(request=>({value:request.id,label:`${request.name} · ${request.garmentTypeName}`}))}
      onChange={id=>{const request=selectable.find(item=>item.id===id);if(request)onChange(request);setPickerOpen(false);}}
      onClose={()=>setPickerOpen(false)} searchable searchPlaceholder="Search loaded requests" />
  </View>;
}
const styles=StyleSheet.create({stack:{gap:tokens.spacing.md},row:{flexDirection:'row',gap:tokens.spacing.sm},cell:{flex:1,minWidth:0}});
