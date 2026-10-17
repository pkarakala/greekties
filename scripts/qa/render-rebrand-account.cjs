/* Build an isolated, synthetic browser fixture from actual source with the
 * existing Metro toolchain. No app/backend startup, dependency install or native build. */
const fs = require('fs');
const path = require('path');
const root = process.env.SLICE_E_SOURCE || path.resolve(__dirname, '../..');
const out = process.env.SLICE_E_OUTPUT;
if (!out) throw new Error('SLICE_E_OUTPUT required');
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
export const Linking={openURL:async url=>{window.__actions.push({open:url});if(window.__qa.mode==='link-error')throw new Error('Synthetic open failure');}};
export const Share={share:async data=>{window.__actions.push({share:data});return {action:'dismissedAction'};}};
export const Alert={alert:(title,message,buttons)=>{window.__actions.push({alert:{title,message}});window.__alertButtons=buttons||[];}};
`,
);
write('text.tsx', `export {Text as default} from './native';`);
write('input.tsx', `export {TextInput as default} from './native';`);
write('dimensions.tsx', `export {useWindowDimensions as default} from './native';`);
write('linking.ts', `export {Linking as default} from './native';`);
write('alert.ts', `export {Alert as default} from './native';`);
write('share.ts', `export {Share as default} from './native';`);
write(
  'router.tsx',
  `import React from 'react';
import {View,Text,Pressable} from './native';
import {Ionicons} from './misc';
export function Tabs({children,screenOptions}) {
 const selected='me';
 return <View accessibilityRole="tablist" style={[screenOptions.tabBarStyle,{flexDirection:'row',flexShrink:0,borderTopWidth:1}]}>{React.Children.toArray(children).filter(c=>c.props.options.href!==null).map(c=>{const active=c.props.name===selected;const color=active?screenOptions.tabBarActiveTintColor:screenOptions.tabBarInactiveTintColor;return <Pressable key={c.props.name} accessibilityRole="tab" aria-selected={active} style={[{flex:1,alignItems:'center',justifyContent:'center',minHeight:48,gap:4},screenOptions.tabBarItemStyle,active&&{backgroundColor:screenOptions.tabBarActiveBackgroundColor}]}>{c.props.options.tabBarIcon({color,size:22})}<Text style={[screenOptions.tabBarLabelStyle,{color}]}>{c.props.options.title}</Text></Pressable>;})}</View>;
}
Tabs.Screen=()=>null;
export const useRouter=()=>({push:value=>window.__actions.push(value),back:()=>window.__actions.push('back'),replace:value=>window.__actions.push(value),canGoBack:()=>false,setParams:()=>{}});
export const Link=({children,href,asChild,style,accessibilityLabel})=>asChild?React.cloneElement(children,{accessibilityRole:"link",onPress:()=>window.__actions.push(href)}):<Text accessibilityRole="link" accessibilityLabel={accessibilityLabel} style={style} onPress={()=>window.__actions.push(href)}>{children}</Text>;
export const useLocalSearchParams=()=>window.__qa.screen==='join'||window.__qa.invite?{code:'qaTEST1234'}:{};
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
  'model.ts',
  `const q=window.__qa;export const chapter={id:'chapter',name:'Sigma Phi Epsilon',designation:'California Gamma',university:'University of California, Santa Barbara — College of Letters and Science'};export const profile={id:'self-profile',user_id:'self',chapter_id:q.mode==='wrong-chapter'?'different':'chapter',name:'Alexandra Jordan Taylor Nguyen',class_year:2022,status:['pending','removed'].includes(q.role)?(q.role==='removed'?'rejected':'pending'):'approved',admin_role:q.role==='owner'?'owner':q.role==='manager'?'manager':null,membership_type:q.role==='active'?'active':'alumni',company:'Northline Research and Development',job_title:'Senior product designer and community research lead',industry:'Technology',city:'San Francisco, California',bio:'I enjoy helping chapter members make their next step and stay connected beyond college. '.repeat(3),open_to_mentor:true,is_hiring:true,avatar_url:null,linkedin_url:'https://example.test/profile',map_revision:q.mode==='legacy'?undefined:'revision',map_sharing_enabled:q.mode==='legacy'?undefined:q.mode==='consent-on'};export const member={...profile,id:'member',user_id:'peer',status:'approved',admin_role:null,name:'Christopher Morgan Rivera Hernandez'};export const pending={...member,status:'pending',email:'synthetic-member@example.test'};export const channel={id:'channel',name:'chapter-weekend-planning-and-community-introductions',visibility:'alumni_only',chapter_id:'chapter'};export const report={id:'report',chapter_id:'chapter',target_type:'profile',target_id:'member',status:'open',created_at:'2026-10-15T12:00:00Z',reason:'A long synthetic report describing a concern about chapter conduct and community expectations. '.repeat(4)};`,
);
write(
  'auth.ts',
  `import {profile} from './model';const blockedIds=new Set(['blocked']);export const useAuth=()=>({session:window.__qa.role==='signed-out'?null:{user:{id:'self'}},profile:['signed-out','new-member'].includes(window.__qa.role)||window.__qa.mode==='missing'?null:profile,blockedIds,initializing:window.__qa.mode==='loading'&&['reset','membership'].includes(window.__qa.screen),profileState:window.__qa.mode==='error'?'error':window.__qa.mode==='loading'?'loading':window.__qa.mode==='missing'?'missing':'ready',authError:window.__qa.mode==='expired'?'Your recovery link is unavailable. Request a new link.':null,refreshProfile:async()=>{window.__actions.push('refresh-profile');},retrySession:async()=>{window.__actions.push('retry-session');},signOut:async()=>{window.__actions.push('signout');if(window.__qa.mode==='signout-error')throw new Error('Synthetic sign-out failure');}});`,
);
write(
  'reads.ts',
  `import {useState} from 'react';export function useRead(label){const [recovered,set]=useState(false);const mode=recovered?'loaded':window.__qa.mode;return {mode,loading:mode==='loading',error:mode==='error'?'Synthetic read unavailable':null,reload:()=>{window.__actions.push({reload:label});set(true);}};}`,
);
write(
  'home.ts',
  `export {memberScope,chapterIdentity} from '../lib/home';import {useRead} from './reads';import {chapter} from './model';export const useChapterIdentity=()=>{const r=useRead('chapter identity');return {...r,error:!!r.error,data:['loading','error'].includes(r.mode)?undefined:chapter};};`,
);
write(
  'supabase.ts',
  `let attempt=0;const action=async(name,data)=>{window.__actions.push({auth:name});attempt++;if(window.__qa.mode==='pending')return new Promise(()=>{});return {data:{session:null},error:window.__qa.mode==='save-error'&&attempt===1?{message:name==='signin'?'Invalid login credentials':'Synthetic request failed. Please retry.'}:null};};export const supabase={auth:{signInWithPassword:data=>action('signin',data),signUp:data=>action('signup',data),resetPasswordForEmail:(email,options)=>action('reset-request',{}),updateUser:data=>action('password-update',data)},functions:{invoke:()=>{throw new Error('Destructive request forbidden in QA');}},from:()=>{throw new Error('Unexpected backend query in isolated QA');}};`,
);
write(
  'profile.ts',
  `export const saveProfileWithMap=async(profile,fields,city,sharing)=>{window.__actions.push({profileSave:{fields,city,sharing,revision:profile.map_revision}});if(window.__qa.mode==='save-pending')return new Promise(()=>{});return {error:window.__qa.mode==='save-error'?'Couldn’t save your profile. Please retry.':null,revision:'revision'};};export const uploadAvatar=async()=>{window.__actions.push('avatar-upload');if(window.__qa.mode==='avatar-pending')return new Promise(()=>{});return {url:null,error:'Synthetic upload unavailable.'};};`,
);
write(
  'picker.ts',
  `export const requestMediaLibraryPermissionsAsync=async()=>({granted:window.__qa.mode==='avatar-pending'});export const launchImageLibraryAsync=async()=>({canceled:false,assets:[{uri:'synthetic-local-only'}]});`,
);
write(
  'invite.ts',
  `import {chapter} from './model';let attempt=0;export const storePendingInviteCode=async code=>({invite:{code,revision:'qa-revision'},warning:null});export const readPendingInvite=async()=>({invite:null,warning:null});export const clearPendingInvite=async()=>({cleared:true,warning:null});export const resolveChapterInvite=async()=>{attempt++;if(window.__qa.mode==='loading')return new Promise(()=>{});if(window.__qa.mode==='invalid')return {kind:'invalid'};if(window.__qa.mode==='error'&&attempt===1)return {kind:'error'};return {kind:'valid',chapter};};export const joinChapterWithInvite=async()=>{window.__actions.push('join');if(window.__qa.mode==='save-pending')return new Promise(()=>{});return {error:window.__qa.mode==='save-error'?'Couldn’t join. Please retry.':null};};`,
);
write(
  'admin.ts',
  `import {useRead} from './reads';import {chapter,member,pending,channel} from './model';const blank=mode=>['loading','empty','error'].includes(mode);export const usePendingMembers=()=>{const r=useRead('member approvals');return {...r,members:blank(r.mode)?[]:[pending]};};export const useChapterMemberList=(id,status)=>{const r=useRead('chapter members');return {...r,members:blank(r.mode)?[]:[{...member,status:status==='rejected'?'rejected':'approved'}]};};export const useAdminChannels=()=>{const r=useRead('channels');return {...r,channels:blank(r.mode)?[]:[channel]};};export const useChapter=()=>{const r=useRead('chapter settings');return {...r,chapter:blank(r.mode)?null:chapter};};const mutate=async(name)=>{window.__actions.push({manage:name});if(window.__qa.mode==='save-pending')return new Promise(()=>{});return window.__qa.mode==='save-error'?'Synthetic change failed. Please retry.':null;};export const approveMember=()=>mutate('approve');export const rejectMember=()=>mutate('reject');export const setMemberRole=()=>mutate('role');export const setMemberMembershipType=()=>mutate('membership');export const removeMember=()=>mutate('remove');export const reinstateMember=()=>mutate('reinstate');export const createChannel=()=>mutate('channel-create');export const updateChannelName=()=>mutate('channel-rename');export const updateChannelVisibility=()=>mutate('channel-visibility');export const deleteChannel=()=>mutate('channel-delete');export const updateChapter=()=>mutate('chapter-update');`,
);
write(
  'chapters.ts',
  `export const fetchChapterInvite=async()=>({code:window.__qa.mode==='invite-error'?null:'qaTEST1234',error:window.__qa.mode==='invite-error'?'Invitations are temporarily unavailable.':null});export const createChapter=async()=>{window.__actions.push('create-chapter');if(window.__qa.mode==='save-pending')return new Promise(()=>{});return {chapterId:window.__qa.mode==='save-error'?null:'chapter',error:window.__qa.mode==='save-error'?'Couldn’t create the chapter. Please retry.':null};};`,
);
write(
  'moderation.ts',
  `import {useRead} from './reads';import {member,report} from './model';const blank=mode=>['loading','empty','error'].includes(mode);export const useBlockedProfiles=()=>{const r=useRead('blocked members');return {...r,blocked:blank(r.mode)?[]:[{blockedId:'peer',profile:member}]};};export const unblockUser=async()=>{window.__actions.push('unblock');return {error:window.__qa.mode==='save-error'?'Couldn’t unblock. Please retry.':null};};export const useChapterReports=()=>{const r=useRead('reports');return {...r,reports:blank(r.mode)?[]:[report]};};export const updateReportStatus=async(id,status)=>{window.__actions.push({reportStatus:status});if(window.__qa.mode==='save-pending')return new Promise(()=>{});return {error:window.__qa.mode==='save-error'?'Couldn’t update report. Please retry.':null};};`,
);
write(
  'qa.ts',
  `export const isOwnerQaBuild=true;export const ownerQaDeletionNotice='Account deletion is unavailable in this private QA build. No destructive request will be sent.';`,
);
write(
  'entry.tsx',
  `import React from 'react';import {createRoot} from 'react-dom/client';import Layout from '../app/(tabs)/_layout';import Me from '../app/(tabs)/me';import Edit from '../app/profile/edit';import Blocked from '../app/settings/blocked';import Login from '../app/login';import Signup from '../app/signup';import Forgot from '../app/forgot-password';import Reset from '../app/reset-password';import Join from '../app/join/[code]';import Membership from '../app/membership';import Complete from '../app/onboarding/complete-profile';import Enter from '../app/onboarding/enter-code';import Create from '../app/onboarding/create-chapter';import Admin from '../app/(tabs)/admin';import Approvals from '../app/admin/approvals';import Members from '../app/admin/members';import Channels from '../app/admin/channels';import Reports from '../app/admin/reports';import Settings from '../app/admin/settings';const screens={me:Me,edit:Edit,blocked:Blocked,login:Login,signup:Signup,forgot:Forgot,reset:Reset,join:Join,membership:Membership,complete:Complete,enter:Enter,create:Create,admin:Admin,approvals:Approvals,members:Members,channels:Channels,reports:Reports,settings:Settings};window.__actions=[];const Component=screens[window.__qa.screen];window.__qaRoot=createRoot(document.getElementById('root'));window.__qaRoot.render(<><Component/>{window.__qa.screen==='me'&&<Layout/>}</>);`,
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
  'expo-image-picker': 'picker.ts',
  '@/lib/auth': 'auth.ts',
  '@/lib/home': 'home.ts',
  '@/lib/profile': 'profile.ts',
  '@/lib/invite': 'invite.ts',
  '@/lib/admin': 'admin.ts',
  '@/lib/chapters': 'chapters.ts',
  '@/lib/moderation': 'moderation.ts',
  '@/lib/qa-build': 'qa.ts',
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
      'react-native-web/dist/exports/Linking': 'linking.ts',
      'react-native-web/dist/exports/Alert': 'alert.ts',
      'react-native-web/dist/exports/Share': 'share.ts',
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
  console.log('Built actual-source synthetic account browser fixture', root);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
