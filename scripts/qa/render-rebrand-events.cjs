/* Build an isolated, synthetic browser fixture from actual source with the
 * existing Metro toolchain. No app/backend startup, dependency install or native build. */
const fs = require('fs');
const path = require('path');
const root = process.env.SLICE_B_SOURCE || path.resolve(__dirname, '../..');
const out = process.env.SLICE_B_OUTPUT;
if (!out) throw new Error('SLICE_B_OUTPUT required');
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
 const selected=window.__qa.screen==='agenda'?'events':'index';
 return <View accessibilityRole="tablist" style={[screenOptions.tabBarStyle,{flexDirection:'row',flexShrink:0,borderTopWidth:1}]}>{React.Children.toArray(children).filter(c=>c.props.options.href!==null).map(c=>{const active=c.props.name===selected;const color=active?screenOptions.tabBarActiveTintColor:screenOptions.tabBarInactiveTintColor;return <Pressable key={c.props.name} accessibilityRole="tab" aria-selected={active} style={[{flex:1,alignItems:'center',justifyContent:'center',minHeight:48,gap:4},screenOptions.tabBarItemStyle,active&&{backgroundColor:screenOptions.tabBarActiveBackgroundColor}]}>{c.props.options.tabBarIcon({color,size:22})}<Text style={[screenOptions.tabBarLabelStyle,{color}]}>{c.props.options.title}</Text></Pressable>;})}</View>;
}
Tabs.Screen=()=>null;
export const useRouter=()=>({push:value=>window.__actions.push(value),back:()=>window.__actions.push('back'),replace:value=>window.__actions.push(value),canGoBack:()=>false});
export const useLocalSearchParams=()=>({id:'event'});
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
export const Image=()=>{throw new Error('Unexpected image in no-media fixture');};
export const Ionicons=({name,size,color})=><Text aria-hidden style={{fontFamily:'Ionicons',fontSize:size,color}}>{String.fromCodePoint(glyphs[name])}</Text>;
`,
);
write(
  'events.ts',
  `export * from '../lib/events';
import {useState} from 'react';
export const event={id:'event',chapter_id:'chapter',created_by:'host',title:'Back in Santa Barbara: an evening of shared stories and chapter connections',category:'alumni',starts_at:'2099-11-07T00:00:00Z',ends_at:'2099-11-07T03:00:00Z',location:'Campus lawn, Santa Barbara',description:'Join chapter members for an evening of conversation and shared stories. Bring a question or just yourself.'};
export const people=[{id:'host',user_id:'host',name:'Alexandra Jordan Taylor Nguyen',avatar_url:null},{id:'guest',user_id:'guest',name:'Christopher Morgan Rivera',avatar_url:null},{id:'hidden',user_id:'blocked',name:'Blocked Guest',avatar_url:null}];
export const useEventClock=()=>Date.parse('2099-11-01');
export const useEvents=()=>{const [recovered,set]=useState(false);const mode=recovered?'loaded':window.__qa.mode;return {events:['loading','empty','error'].includes(mode)?[]:[{...event,goingCount:38,maybeCount:12,myStatus:'maybe',attendees:people,metaError:mode==='retry'?'Attendance refresh unavailable.':null}],loading:mode==='loading',error:['error','retry'].includes(mode)?'Couldn’t load events. Please retry.':null,reload:()=>set(true)};};
export const useEvent=()=>{const [recovered,set]=useState(false);const [response,respond]=useState('maybe');const mode=recovered?'loaded':window.__qa.mode;return {event:['loading','empty','error'].includes(mode)?null:event,creator:people[0],attendees:people,attendeeState:mode==='unknown'?'error':'ready',goingCount:mode==='unknown'?null:38,maybeCount:mode==='unknown'?null:12,myStatus:mode==='unknown'?undefined:response,loading:mode==='loading',error:mode==='error'?'Couldn’t load this event. Please retry.':null,metaError:mode==='unknown'?'Attendance unavailable. Retry to refresh.':null,saving:mode==='saving',saveError:mode==='retry'?'Couldn’t confirm your response. Retry to check attendance.':null,recoveryMessage:recovered?'Your response was refreshed.':null,reload:()=>set(true),saveRsvp:async status=>{window.__actions.push({rsvp:status});respond(status);}};};
export const createEvent=async data=>{window.__actions.push({create:data});return {error:window.__qa.mode==='save-error'?'Couldn’t create the event. Please try again.':null};};
export const updateEvent=async (id,data)=>{window.__actions.push({update:{id,data}});return {error:window.__qa.mode==='save-error'?'Couldn’t save your changes. Please try again.':null};};
export const deleteEvent=async()=>({error:'Deletion is not performed in browser QA.'});
`,
);
write(
  'home.ts',
  `export * from '../lib/home';
const read=data=>({data,loading:false,error:false,reload:()=>{}});
export const useChapterIdentity=()=>read({name:'Sigma Phi Epsilon',designation:'California Gamma',university:window.__qa.mode==='long'?'University of California, Santa Barbara — College of Letters and Science':'University of California, Santa Barbara'});
export const useMembershipCounts=()=>read({active:1234,alumni:5678});
export const useHomeOverview=()=>({event:read(null),jobs:read([]),conversations:read(null),reload:()=>{}});
`,
);
write(
  'share.ts',
  `export const listShareChannels=async()=>({channels:[],hasMore:false});export const prepareChatShare=async()=>{throw new Error('Sharing writes disabled in synthetic QA');};`,
);
write(
  'entry.tsx',
  `import React from 'react';import {createRoot} from 'react-dom/client';
import Layout from '../app/(tabs)/_layout';import Home from '../app/(tabs)/index';import Agenda from '../app/(tabs)/events';import Detail from '../app/events/[id]';import New from '../app/events/new';import Edit from '../app/events/edit/[id]';
const screens={home:Home,agenda:Agenda,detail:Detail,new:New,edit:Edit};
window.__actions=[];
const Component=screens[window.__qa.screen];
window.__qaRoot=createRoot(document.getElementById('root'));window.__qaRoot.render(<><Component/>{['home','agenda'].includes(window.__qa.screen)&&<Layout/>}</>);
`,
);
const aliases = {
  'react-native': 'native.tsx',
  'expo-router': 'router.tsx',
  'react-native-safe-area-context': 'misc.tsx',
  'expo-status-bar': 'misc.tsx',
  'expo-haptics': 'misc.tsx',
  'expo-image': 'misc.tsx',
  '@expo/vector-icons': 'misc.tsx',
  '@/lib/auth': 'auth.ts',
  '@/lib/events': 'events.ts',
  '@/lib/home': 'home.ts',
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
