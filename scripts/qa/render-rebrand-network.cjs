/* Build an isolated, synthetic browser fixture from actual source with the
 * existing Metro toolchain. No app/backend startup, dependency install or native build. */
const fs = require('fs');
const path = require('path');
const root = process.env.SLICE_D_SOURCE || path.resolve(__dirname, '../..');
const out = process.env.SLICE_D_OUTPUT;
if (!out) throw new Error('SLICE_D_OUTPUT required');
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
  'router.tsx',
  `import React from 'react';
import {View,Text,Pressable} from './native';
import {Ionicons} from './misc';
export function Tabs({children,screenOptions}) {
 const selected='people';
 return <View accessibilityRole="tablist" style={[screenOptions.tabBarStyle,{flexDirection:'row',flexShrink:0,borderTopWidth:1}]}>{React.Children.toArray(children).filter(c=>c.props.options.href!==null).map(c=>{const active=c.props.name===selected;const color=active?screenOptions.tabBarActiveTintColor:screenOptions.tabBarInactiveTintColor;return <Pressable key={c.props.name} accessibilityRole="tab" aria-selected={active} style={[{flex:1,alignItems:'center',justifyContent:'center',minHeight:48,gap:4},screenOptions.tabBarItemStyle,active&&{backgroundColor:screenOptions.tabBarActiveBackgroundColor}]}>{c.props.options.tabBarIcon({color,size:22})}<Text style={[screenOptions.tabBarLabelStyle,{color}]}>{c.props.options.title}</Text></Pressable>;})}</View>;
}
Tabs.Screen=()=>null;
export const useRouter=()=>({push:value=>window.__actions.push(value),back:()=>window.__actions.push('back'),replace:value=>window.__actions.push(value),canGoBack:()=>false,setParams:()=>{}});
export const Link=({children,href,style,accessibilityLabel})=><Text accessibilityRole="link" accessibilityLabel={accessibilityLabel} style={style} onPress={()=>window.__actions.push(href)}>{children}</Text>;
export const useLocalSearchParams=()=>({id:'item',...(window.__qa.screen==='jobs'?{view:'jobs'}:{})});
export const useFocusEffect=()=>{};
`,
);
write(
  'misc.tsx',
  `import React from 'react';import {View,Text} from './native';
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
export const SafeAreaView=View;
export const useSafeAreaInsets=()=>({top:0,right:0,bottom:0,left:0});
export const StatusBar=()=>null;
export const selectionAsync=async()=>{};
export const Image=()=>{throw new Error('Unexpected remote image in synthetic Network fixture');};
export const uuid={v4:()=>crypto.randomUUID()};
export const Ionicons=({name,size,color})=><Text aria-hidden style={{fontFamily:'Ionicons',fontSize:size,color}}>{String.fromCodePoint(glyphs[name])}</Text>;
`,
);
write(
  'auth.ts',
  `const blockedIds=new Set(['blocked']);export const useAuth=()=>({session:{user:{id:'self'}},profile:{user_id:'self',chapter_id:'chapter',status:window.__qa.mode==='pending-member'?'pending':'approved',membership_type:window.__qa.role==='active'?'active':'alumni',admin_role:window.__qa.role==='admin'?'manager':null,name:'Alexandra'},blockedIds});`,
);
write(
  'model.ts',
  `export const member={id:'item',user_id:'peer',chapter_id:'chapter',name:'Alexandra Jordan Taylor Nguyen',job_title:'Senior product designer and research lead',company:'Northline Research and Development',city:'San Francisco, California',industry:'Technology',membership_type:'alumni',class_year:2022,open_to_mentor:true,is_hiring:true,status:'approved',avatar_url:null,bio:'I enjoy helping chapter members find their next step, from choosing an internship to navigating their first leadership role. '.repeat(4),linkedin_url:null};export const job={id:'item',chapter_id:'chapter',posted_by:window.__qa.role==='owner'?'self':'peer',title:'Product design intern — platforms, collaboration and community programs',company:'Northline Research and Development',location:'Santa Barbara, California — remote within the United States',industry:'Technology',description:'Work with a small team to build useful tools and lasting relationships. We welcome thoughtful questions and people who enjoy learning together. '.repeat(6),apply_url:window.__qa.mode==='invalid'?'javascript:alert(1)':'https://careers.example.org/opportunities/design-intern',created_at:'2026-10-12T12:00:00Z',is_open:window.__qa.mode!=='closed'};`,
);
write(
  'supabase.ts',
  `import {member} from './model';let attempts=0;export const supabase={from:table=>{if(table!=='profiles')throw new Error('Unexpected backend write forbidden');const chain={select:()=>chain,eq:()=>chain,maybeSingle:()=>{attempts++;if(window.__qa.mode==='loading')return new Promise(()=>{});return Promise.resolve({data:window.__qa.screen==='profile'?(['empty','blocked'].includes(window.__qa.mode)?null:member):{id:'poster',name:member.name,avatar_url:null},error:window.__qa.mode==='error'&&attempts===1?{message:'Synthetic profile failure'}:null});}};return chain;}};`,
);
write(
  'home.ts',
  `export {memberScope} from '../lib/home';import {useState} from 'react';export const useMembershipCounts=()=>{const [recovered,set]=useState(false);const mode=recovered?'loaded':window.__qa.mode;return {data:mode==='loading'||mode==='counts-error'?undefined:{active:1234,alumni:5678},loading:mode==='loading',error:mode==='counts-error',reload:()=>{window.__actions.push('retry-totals');set(true);}};};`,
);
write(
  'queries.ts',
  `import {useState} from 'react';import {member} from './model';export const useChapterMembers=(chapter,blocked,filters)=>{const [recovered,set]=useState(false);const [more,add]=useState(false);const mode=recovered?'loaded':window.__qa.mode;const all=['empty','error','loading'].includes(mode)?[]:[member,...(more?[{...member,id:'second',name:'Christopher Morgan Rivera'}]:[])];const q=(filters.query||'').toLowerCase();const members=all.filter(m=>(!q||[m.name,m.company,m.city,m.job_title].join(' ').toLowerCase().includes(q))&&(!filters.industry||m.industry===filters.industry.trim())&&(!filters.membershipType||m.membership_type===filters.membershipType));return {members,loading:mode==='loading',error:mode==='error'?'Couldn’t search members. Please retry.':null,hasMore:mode==='pagination'&&!more,loadingMore:false,reload:()=>{window.__actions.push('retry-directory');set(true);},loadMore:()=>{window.__actions.push('more-directory');add(true);}};};`,
);
write(
  'jobs.ts',
  `import {useState} from 'react';import {job} from './model';const useRead=()=>{const [recovered,set]=useState(false);const [more,add]=useState(false);const mode=recovered?'loaded':window.__qa.mode;return {mode,reload:()=>{window.__actions.push('retry-jobs');set(true);},loading:mode==='loading',error:['error','retry'].includes(mode)?'Couldn’t load the posting. Please retry.':null,hasMore:mode==='pagination'&&!more,loadingMore:false,loadMore:()=>{window.__actions.push('more-jobs');add(true);}};};export const useJobs=()=>{const r=useRead();return {...r,jobs:['empty','error','loading'].includes(r.mode)?[]:[job]};};export const useJob=()=>{const r=useRead();return {...r,job:['empty','error','loading'].includes(r.mode)?null:job};};const save=async data=>{window.__actions.push({save:data});if(window.__qa.mode==='pending')return new Promise(()=>{});return {id:'item',error:window.__qa.mode==='save-error'?'Couldn’t save this posting. Please try again.':null};};export const createJob=save;export const updateJob=(id,data)=>save(data);`,
);
write(
  'mentorship.ts',
  `export const findRequestBetween=async()=>['accepted','pending'].includes(window.__qa.mode)?{id:'existing',status:window.__qa.mode}:null;export const createMentorshipRequest=async data=>{window.__actions.push({request:data});if(window.__qa.mode==='sending')return new Promise(()=>{});return {id:'request',error:window.__qa.mode==='save-error'?'Couldn’t send your request. Please retry.':null};};`,
);
write(
  'moderation.ts',
  `export const canShowActorContent=(id,blocked)=>!blocked.has(id);export const reportContent=async()=>({error:null});export const blockUser=async()=>({error:null});`,
);
write(
  'share.ts',
  `export const listShareChannels=async()=>({channels:[],hasMore:false});export const prepareChatShare=async()=>{throw new Error('Sharing writes disabled in synthetic QA');};`,
);
write(
  'application.ts',
  `export {jobApplicationState} from '../lib/job-application';export const openJobApplication=async job=>{window.__actions.push({apply:job.apply_url});return window.__qa.mode==='apply-error'?'Couldn’t open the application link. Please try again.':null;};`,
);
write(
  'entry.tsx',
  `import React from 'react';import {createRoot} from 'react-dom/client';import Layout from '../app/(tabs)/_layout';import Network from '../app/(tabs)/people';import Profile from '../app/profile/[id]';import Detail from '../app/jobs/[id]';import New from '../app/jobs/new';import Edit from '../app/jobs/edit/[id]';const screens={directory:Network,jobs:Network,profile:Profile,detail:Detail,new:New,edit:Edit};window.__actions=[];const Component=screens[window.__qa.screen];window.__qaRoot=createRoot(document.getElementById('root'));window.__qaRoot.render(<><Component/>{['directory','jobs'].includes(window.__qa.screen)&&<Layout/>}</>);`,
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
  '@/lib/queries': 'queries.ts',
  '@/lib/jobs': 'jobs.ts',
  '@/lib/mentorship': 'mentorship.ts',
  '@/lib/moderation': 'moderation.ts',
  '@/lib/chat-share': 'share.ts',
  '@/lib/job-application': 'application.ts',
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
  console.log('Built actual-source synthetic Network browser fixture', root);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
