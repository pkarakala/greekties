/* Build an isolated, synthetic browser fixture from actual source with the
 * existing Metro toolchain. No app/backend startup, dependency install or native build. */
const fs = require('fs');
const path = require('path');
const root = process.env.SLICE_C_SOURCE || path.resolve(__dirname, '../..');
const out = process.env.SLICE_C_OUTPUT;
if (!out) throw new Error('SLICE_C_OUTPUT required');
const fixtures = path.join(root, 'qa-fixture');
fs.mkdirSync(fixtures, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const write = (name, value) =>
  fs.writeFileSync(
    path.join(fixtures, name),
    '// @ts-nocheck — synthetic browser harness only\n' + value,
  );
write(
  'native.tsx',
  `import React from 'react';
import * as RN from 'react-native-web';
export * from 'react-native-web';
const dimensions=()=>({width:window.innerWidth,height:window.innerHeight,scale:1,fontScale:window.__qa.scale});
export const useWindowDimensions=dimensions;
const scaleStyle=style=>{const s=RN.StyleSheet.flatten(style)||{};return {...s,...(typeof s.fontSize==='number'?{fontSize:s.fontSize*window.__qa.scale}:{}),...(typeof s.lineHeight==='number'?{lineHeight:s.lineHeight*window.__qa.scale}:{})};};
export const Text=React.forwardRef((props,ref)=><RN.Text {...props} ref={ref} style={scaleStyle(props.style)}/>);
export const TextInput=React.forwardRef((props,ref)=><RN.TextInput {...props} ref={ref} style={scaleStyle(props.style)}/>);
`,
);
write('text.tsx', `export {Text as default} from './native';`);
write('input.tsx', `export {TextInput as default} from './native';`);
write('dimensions.tsx', `export {useWindowDimensions as default} from './native';`);
write(
  'supabase.ts',
  `export const supabase=new Proxy({},{get(){throw new Error('Backend forbidden in synthetic QA');}});`,
);
write(
  'router.tsx',
  `import React from 'react';
import {View,Text,Pressable} from './native';
import {Ionicons} from './misc';
export function Tabs({children,screenOptions}) {
 const selected=window.__qa.screen==='inbox'?'chats':'index';
 return <View accessibilityRole="tablist" style={[screenOptions.tabBarStyle,{flexDirection:'row',flexShrink:0,borderTopWidth:1}]}>{React.Children.toArray(children).filter(c=>c.props.options.href!==null).map(c=>{const active=c.props.name===selected;const color=active?screenOptions.tabBarActiveTintColor:screenOptions.tabBarInactiveTintColor;return <Pressable key={c.props.name} accessibilityRole="tab" aria-selected={active} style={[{flex:1,alignItems:'center',justifyContent:'center',minHeight:48,gap:4},screenOptions.tabBarItemStyle,active&&{backgroundColor:screenOptions.tabBarActiveBackgroundColor}]}>{c.props.options.tabBarIcon({color,size:22})}<Text style={[screenOptions.tabBarLabelStyle,{color}]}>{c.props.options.title}</Text></Pressable>;})}</View>;
}
Tabs.Screen=()=>null;
export const useRouter=()=>({push:value=>window.__actions.push(value),back:()=>window.__actions.push('back'),replace:value=>window.__actions.push(value),canGoBack:()=>false});
export const Link=({children,href,style,accessibilityLabel})=><Text accessibilityRole="link" accessibilityLabel={accessibilityLabel} style={style} onPress={()=>window.__actions.push(href)}>{children}</Text>;
export const useLocalSearchParams=()=>({channelId:'room',requestId:'request',id:'event'});
export const useFocusEffect=()=>{};
`,
);
write(
  'auth.ts',
  `export const useAuth=()=>({session:{user:{id:'self'}},profile:{user_id:'self',chapter_id:'chapter',status:'approved',membership_type:window.__qa.role==='active'?'active':'alumni',admin_role:window.__qa.role==='admin'?'manager':null,name:'Alexandra'},blockedIds:new Set(['blocked'])});`,
);
write(
  'misc.tsx',
  `import React from 'react';import {View,Text} from './native';
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
export const SafeAreaView=View;
export const useSafeAreaInsets=()=>({top:0,right:0,bottom:0,left:0});
export const StatusBar=()=>null;
export const selectionAsync=async()=>{};
export const Image=()=>{throw new Error('Unexpected remote image in synthetic chats fixture');};
export const uuid={v4:()=>crypto.randomUUID()};
export const Ionicons=({name,size,color})=><Text aria-hidden style={{fontFamily:'Ionicons',fontSize:size,color}}>{String.fromCodePoint(glyphs[name])}</Text>;
`,
);
write(
  'recovery.ts',
  `export const recoveryIsCurrent=entry=>!!entry&&!entry.revoked;export const forgetDeletedMessage=()=>{};`,
);
write('reads.ts', `export const markChannelRead=async()=>{};`);
write(
  'moderation.ts',
  `export const reportContent=async()=>({error:null});export const blockUser=async()=>({error:null});`,
);
write(
  'reactions.ts',
  `export const QUICK_EMOJI=['👍','❤️'];export const useReactionSync=()=>{};export const fetchReactions=async ids=>new Map(ids.filter(id=>id==='msg-2').map(id=>[id,[{emoji:'👍',count:2,mine:true}]]));export const toggleReaction=async(id,user,emoji)=>{window.__actions.push({reaction:{id,emoji}});return {error:null};};`,
);
write(
  'share.ts',
  `export const getChatShare=()=>null;export const parseDetailLink=part=>/^\\/events\\/[a-f0-9-]{36}$/.test(part)?{kind:'events',id:part.split('/').pop()}:null;export const appendChatShare=async()=>false;export const cancelChatShare=()=>{};export const pauseChatShareValidation=()=>{};`,
);
write(
  'home.ts',
  `export * from '../lib/home';export const useChapterIdentity=()=>({data:{name:'Sigma Phi Epsilon',designation:'California Gamma',university:'University of California, Santa Barbara'},loading:false,error:false,reload:()=>{}});`,
);
write(
  'inbox.ts',
  `export {selectChatsRows} from '../lib/chats-inbox';import {useState} from 'react';
export const useChatsInbox=()=>{const [recovered,set]=useState(false);const mode=recovered?'loaded':window.__qa.mode;const groups=['empty','error','loading','revoked'].includes(mode)?[]:[{key:'group:room',kind:'group',id:'room',name:'Chapter chat and alumni weekend planning',preview:'Looking forward to catching up this weekend.',activity:'2026-10-16T12:00:00Z',avatar:null}];const mentors=['empty','error','loading'].includes(mode)?[]:[{key:'mentorship:request',kind:'mentorship',id:'request',name:'Alexandra Jordan Taylor Nguyen',preview:'Happy to look over your portfolio.',activity:'2026-10-16T11:00:00Z',avatar:null}];const read=rows=>({data:mode==='loading'?undefined:{rows,hasMore:false,previewsUnavailable:mode==='retry'},loading:mode==='loading',error:['error','retry','revoked'].includes(mode),reload:()=>set(true)});return {groups:read(groups),mentors:read(mentors),rows:[...groups,...mentors]};};`,
);
write(
  'conversation.ts',
  `import {useState,useRef} from 'react';
const link='/events/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const makeMessages=count=>Array.from({length:count},(_,i)=>({id:'msg-'+i,channel_id:'room',request_id:'request',sender_id:i%4<2?'peer':'self',content:i===2?'I will be there. '+link:i===count-1?'Latest message: see you on the lawn this Saturday.':i%2?'A chapter conversation with shared stories and useful introductions.':'Looking forward to catching up with everyone this weekend.',created_at:new Date(Date.parse('2026-10-16T15:00:00Z')+i*60000).toISOString()}));
export function useConversation(kind){
 const [recovered,set]=useState(false);const mode=recovered?'loaded':window.__qa.mode;
 const [messages,update]=useState(()=>['empty','error','revoked','loading'].includes(mode)?[]:makeMessages(mode==='long'?160:5));
 const [draft,setDraft]=useState(mode==='draft'?'A long draft with plans for the weekend, chapter introductions, and questions for returning alumni. '.repeat(4):'');
 const [attempt,setAttempt]=useState(['pending','failed','uncertain'].includes(mode)?{id:'attempt',kind,conversationId:kind==='channel'?'room':'request',userId:'self',content:'A saved message waiting for confirmation.',status:mode,uncertain:mode==='uncertain'}:null);
 const entry=useRef({kind,conversationId:kind==='channel'?'room':'request',userId:'self',state:{},run:0,deleted:new Set(),revoked:false});entry.current.state={draft,attempt};
 const composer={draft,setDraft,attempt,entry:entry.current,error:null,send:async()=>{if(!draft.trim()||attempt)return;window.__actions.push({send:{kind,text:draft}});update(old=>[...old,{id:'sent-'+old.length,sender_id:'self',content:draft,created_at:new Date().toISOString()}]);setDraft('');},retry:async()=>{window.__actions.push({retry:kind});setAttempt(null);},discard:()=>{window.__actions.push({discard:kind});setAttempt(null);}};
 const reload=()=>{window.__actions.push({refresh:kind});set(true);if(['error','revoked','empty'].includes(mode))update(makeMessages(5));};
 window.__appendMessage=()=>update(old=>[...old,{id:'arrival-'+old.length,sender_id:'peer',content:'New message while you read earlier history.',created_at:new Date().toISOString()}]);
 return {mode,messages,composer,reload};
}
export const other={id:'peer-profile',user_id:'peer',name:'Alexandra Jordan Taylor Nguyen',avatar_url:null};
`,
);
write(
  'chat.ts',
  `import {useConversation,other} from './conversation';
export const useChannelThread=()=>{const c=useConversation('channel');return {...c,loading:c.mode==='loading',error:['error','retry'].includes(c.mode)?'Couldn’t load messages. Please retry.':null,channel:['revoked','error'].includes(c.mode)?null:{id:'room',name:'Chapter chat and alumni weekend planning'},senders:{peer:other},hasMore:c.mode==='long',loadingEarlier:false,loadEarlier:()=>window.__actions.push('earlier')};};
export const deleteMessage=async()=>({error:'Deletion not performed in browser QA.'});`,
);
write(
  'mentorship.ts',
  `import {useState} from 'react';import {useConversation,other} from './conversation';
export const useThread=()=>{const c=useConversation('mentorship');const status=['incoming','outgoing'].includes(c.mode)?'pending':c.mode==='declined'?'declined':'accepted';return {...c,request:['revoked','error','loading'].includes(c.mode)?null:{id:'request',from_user_id:c.mode==='outgoing'?'self':'peer',to_user_id:c.mode==='outgoing'?'peer':'self',status,message:'I would value your advice on choosing my first internship.',focus_areas:['Career guidance']},loading:c.mode==='loading',error:['error','retry'].includes(c.mode)?'Couldn’t load the conversation. Please retry.':null,other};};
export const respondToRequest=async(id,status)=>{window.__actions.push({respond:{id,status}});return null;};
export const useInbox=()=>{const [recovered,set]=useState(false);const mode=recovered?'loaded':window.__qa.mode;const blank=['empty','loading','error'].includes(mode);return {loading:mode==='loading',error:mode==='error'?'Offline. Please retry.':null,incoming:blank?[]:[{id:'pending',from_user_id:'peer',to_user_id:'self',status:'pending',message:'I would value advice on my first internship.'}],outgoing:blank?[]:[{id:'accepted',from_user_id:'self',to_user_id:'mentor',status:'accepted',message:'Thank you for helping me review my portfolio.'},{id:'declined',from_user_id:'self',to_user_id:'alum',status:'declined',message:'Career guidance'}],profiles:{peer:other,mentor:{name:'Christopher Morgan Rivera'},alum:{name:'Taylor Bennett'}},reload:()=>set(true)};};`,
);
write(
  'entry.tsx',
  `import React from 'react';import {createRoot} from 'react-dom/client';import Layout from '../app/(tabs)/_layout';import Inbox from '../app/(tabs)/chats/index';import Group from '../app/(tabs)/chats/[channelId]';import Mentor from '../app/inbox/[requestId]';import Requests from '../app/inbox/index';
const screens={inbox:Inbox,group:Group,mentor:Mentor,requests:Requests};window.__actions=[];const Component=screens[window.__qa.screen];window.__qaRoot=createRoot(document.getElementById('root'));window.__qaRoot.render(<><Component/>{window.__qa.screen==='inbox'&&<Layout/>}</>);`,
);
const aliases = {
  'react-native': 'native.tsx',
  'expo-router': 'router.tsx',
  'react-native-safe-area-context': 'misc.tsx',
  'expo-status-bar': 'misc.tsx',
  'expo-haptics': 'misc.tsx',
  'expo-image': 'misc.tsx',
  'expo-modules-core': 'misc.tsx',
  '@expo/vector-icons': 'misc.tsx',
  '@/lib/auth': 'auth.ts',
  '@/lib/home': 'home.ts',
  '@/lib/chats-inbox': 'inbox.ts',
  '@/lib/chat': 'chat.ts',
  '@/lib/mentorship': 'mentorship.ts',
  '@/lib/message-recovery': 'recovery.ts',
  '@/lib/reactions': 'reactions.ts',
  '@/lib/moderation': 'moderation.ts',
  '@/lib/reads': 'reads.ts',
  '@/lib/chat-share': 'share.ts',
};
(async () => {
  const { getDefaultConfig } = require('expo/metro-config');
  const Metro = require('metro');
  const config = getDefaultConfig(root);
  const serialize = config.serializer.customSerializer;
  if (!serialize) throw new Error('Expected installed Expo serializer');
  // Screenshot QA needs executable code, not source maps. Supply an empty valid
  // map instead of Metro's incompatible fallback on Expo full-map transforms.
  config.serializer.customSerializer = async (...args) => {
    const result = await serialize(...args);
    return {
      code: typeof result === 'string' ? result : result.code,
      map: JSON.stringify({ version: 3, sources: [], names: [], mappings: '' }),
    };
  };
  config.maxWorkers = 1;
  config.resolver.useWatchman = false;
  config.watchFolders = [fs.realpathSync(root), fs.realpathSync(path.join(root, 'node_modules'))];
  config.resolver.nodeModulesPaths = [fs.realpathSync(path.join(root, 'node_modules'))];
  config.resolver.disableHierarchicalLookup = true;
  config.resolver.resolveRequest = (context, name, platform) => {
    const webText = {
      'react-native-web/dist/exports/Text': 'text.tsx',
      'react-native-web/dist/exports/TextInput': 'input.tsx',
      'react-native-web/dist/exports/useWindowDimensions': 'dimensions.tsx',
    };
    if (
      webText[name] &&
      context.originModulePath.startsWith(root) &&
      !context.originModulePath.includes('/node_modules/')
    )
      return { type: 'sourceFile', filePath: path.join(fixtures, webText[name]) };
    if (aliases[name]) return { type: 'sourceFile', filePath: path.join(fixtures, aliases[name]) };
    if (name === './supabase' || name === '@/lib/supabase')
      return { type: 'sourceFile', filePath: path.join(fixtures, 'supabase.ts') };
    if (name === './auth' && context.originModulePath.includes('/lib/'))
      return { type: 'sourceFile', filePath: path.join(fixtures, 'auth.ts') };
    if (name.startsWith('@/')) name = path.join(root, name.slice(2));
    return context.resolveRequest(context, name, platform);
  };
  await Metro.runBuild(config, {
    entry: path.join(fixtures, 'entry.tsx'),
    platform: 'web',
    dev: true,
    minify: false,
    out: path.join(out, 'fixture.js'),
  });
  fs.copyFileSync(
    require.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),
    path.join(out, 'Ionicons.ttf'),
  );
  console.log('Built actual-source synthetic browser fixture', root);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
