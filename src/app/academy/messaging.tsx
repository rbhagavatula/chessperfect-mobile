import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import {
  createAcademyMessageTemplate,
  fetchAcademyMessageCampaigns,
  fetchAcademyMessagingContext,
  sendAcademyMessage,
  type AcademyMessageCampaign,
  type AcademyMessageStudent,
  type AcademyMessagingContext,
} from '@/lib/academy-messaging';
import { getSelectedAcademy, type SelectedAcademy } from '@/lib/academy';

type Tab = 'ADOPTION' | 'COMPOSE' | 'SENT' | 'TEMPLATES';
type Audience = 'ALL' | 'BATCHES' | 'STUDENTS';

const tabs: { label: string; value: Tab }[] = [
  { label: 'Compose', value: 'COMPOSE' }, { label: 'Templates', value: 'TEMPLATES' },
  { label: 'Sent', value: 'SENT' }, { label: 'App', value: 'ADOPTION' },
];

function appLabel(status: AcademyMessageStudent['appStatus']) {
  if (status === 'ACTIVE') return 'Push ready';
  if (status === 'NOTIFICATIONS_OFF') return 'Notifications off';
  if (status === 'INACTIVE') return 'Inactive';
  return 'Not connected';
}

function parseSchedule(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value.trim().replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function AcademyMessagingScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab = tabs.some((item) => item.value === params.tab) ? params.tab as Tab : 'COMPOSE';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [academy, setAcademy] = useState<SelectedAcademy | null>(null);
  const [context, setContext] = useState<AcademyMessagingContext | null>(null);
  const [campaigns, setCampaigns] = useState<AcademyMessageCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>('ALL');
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [batchIds, setBatchIds] = useState<number[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [schedule, setSchedule] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateBody, setNewTemplateBody] = useState('');
  const [adoptionFilter, setAdoptionFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const selected = await getSelectedAcademy();
      if (!selected) throw new Error('Choose an academy first.');
      setAcademy(selected);
      const [nextContext, nextCampaigns] = await Promise.all([
        fetchAcademyMessagingContext(selected), fetchAcademyMessageCampaigns(selected),
      ]);
      setContext(nextContext); setCampaigns(nextCampaigns);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load messaging.'); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const recipients = useMemo(() => {
    if (!context) return [];
    if (audience === 'ALL') return context.students;
    if (audience === 'STUDENTS') return context.students.filter((student) => studentIds.includes(student.id));
    return context.students.filter((student) => student.batchId != null && batchIds.includes(student.batchId));
  }, [audience, batchIds, context, studentIds]);
  const pushReady = recipients.filter((student) => student.appStatus === 'ACTIVE').length;
  const adoptionStudents = context?.students.filter((student) => adoptionFilter === 'ALL' || student.appStatus === adoptionFilter) ?? [];

  function toggle(values: number[], setter: (value: number[]) => void, id: number) {
    setter(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  }

  function chooseTemplate(id: number) {
    const template = context?.templates.find((item) => item.id === id);
    if (!template) return;
    setTemplateId(id); setTitle(template.title); setBody(template.body);
  }

  function confirmSend() {
    if (!title.trim() || !body.trim() || !recipients.length) { setError('Choose recipients and complete the message.'); return; }
    const scheduledAt = parseSchedule(schedule);
    if (scheduledAt === undefined) { setError('Use schedule format YYYY-MM-DD HH:mm, or leave it blank.'); return; }
    Alert.alert(scheduledAt ? 'Schedule message?' : 'Send message?', `${recipients.length} student inbox${recipients.length === 1 ? '' : 'es'} will receive this message.`, [
      { style: 'cancel', text: 'Cancel' },
      { text: scheduledAt ? 'Schedule' : 'Send', onPress: () => void submitMessage(scheduledAt) },
    ]);
  }

  async function submitMessage(scheduledAt: string | null) {
    setSending(true); setError(null);
    try {
      const campaign = await sendAcademyMessage({ academy, audienceType: audience, batchIds, body: body.trim(), scheduledAt,
        studentIds, templateId, title: title.trim() });
      Alert.alert(campaign.status === 'SCHEDULED' ? 'Message scheduled' : 'Message sent', `${campaign.recipientCount} students were selected.`);
      setTemplateId(null); setTitle(''); setBody(''); setSchedule(''); setStudentIds([]); setBatchIds([]);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to send message.'); }
    finally { setSending(false); }
  }

  async function saveTemplate() {
    if (!templateName.trim() || !newTemplateTitle.trim() || !newTemplateBody.trim()) { setError('Complete all template fields.'); return; }
    try {
      await createAcademyMessageTemplate({ academy, body: newTemplateBody.trim(), name: templateName.trim(), title: newTemplateTitle.trim() });
      setTemplateName(''); setNewTemplateTitle(''); setNewTemplateBody(''); await load();
      Alert.alert('Template saved', 'The template is ready to use.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save template.'); }
  }

  return <LinearGradient colors={['#07111b', '#1a110b', '#05080b']} style={styles.background}>
    <CivBackdrop />
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <PlayScreenHeader title="Messaging" />
      <View style={styles.tabs}>{tabs.map((item) => <Pressable key={item.value} onPress={() => setTab(item.value)} style={[styles.tab, tab === item.value && styles.tabActive]}><Text style={[styles.tabText, tab === item.value && styles.tabTextActive]}>{item.label}</Text></Pressable>)}</View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.goldLight}/><Text style={styles.muted}>Loading academy messaging…</Text></View> : null}
        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
        {!loading && context && tab === 'COMPOSE' ? <>
          <Panel eyebrow="AUDIENCE" title={`${recipients.length} students selected`}>
            <View style={styles.segment}>{(['ALL','BATCHES','STUDENTS'] as Audience[]).map((value)=><Pressable key={value} onPress={()=>setAudience(value)} style={[styles.segmentButton,audience===value&&styles.segmentActive]}><Text style={[styles.segmentText,audience===value&&styles.segmentTextActive]}>{value==='ALL'?'ALL':value==='BATCHES'?'BATCHES':'STUDENTS'}</Text></Pressable>)}</View>
            {audience === 'BATCHES' ? <View style={styles.options}>{context.batches.map((batch)=><ChoiceRow checked={batchIds.includes(batch.id)} key={batch.id} label={batch.name} meta={`${batch.activeStudentCount} students`} onPress={()=>toggle(batchIds,setBatchIds,batch.id)}/>)}</View> : null}
            {audience === 'STUDENTS' ? <View style={styles.options}>{context.students.map((student)=><ChoiceRow checked={studentIds.includes(student.id)} key={student.id} label={student.name} meta={`${student.batchName||'No batch'} · ${appLabel(student.appStatus)}`} onPress={()=>toggle(studentIds,setStudentIds,student.id)}/>)}</View> : null}
          </Panel>
          <Panel eyebrow="MESSAGE" title="Compose announcement">
            <Text style={styles.label}>TEMPLATE OR AD HOC</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateChips}><Pressable onPress={()=>setTemplateId(null)} style={[styles.chip,templateId===null&&styles.chipActive]}><Text style={styles.chipText}>Ad hoc</Text></Pressable>{context.templates.map((template)=><Pressable key={template.id} onPress={()=>chooseTemplate(template.id)} style={[styles.chip,templateId===template.id&&styles.chipActive]}><Text numberOfLines={1} style={styles.chipText}>{template.name}</Text></Pressable>)}</ScrollView>
            <Input label="TITLE" value={title} onChangeText={setTitle} placeholder="Message title"/>
            <Input label="MESSAGE" multiline value={body} onChangeText={setBody} placeholder="Write the message…"/>
            <Input label="SCHEDULE (OPTIONAL)" value={schedule} onChangeText={setSchedule} placeholder="YYYY-MM-DD HH:mm"/>
          </Panel>
          <View style={styles.delivery}><View><Text style={styles.deliveryNumber}>{recipients.length}</Text><Text style={styles.muted}>student inboxes</Text></View><View style={styles.deliveryRight}><Text style={styles.ready}>{pushReady} push ready</Text><Text style={styles.muted}>{Math.max(0,recipients.length-pushReady)} inbox only</Text></View></View>
          <Pressable disabled={sending||!recipients.length} onPress={confirmSend} style={[styles.sendButton,(sending||!recipients.length)&&styles.disabled]}>{sending?<ActivityIndicator color="#1c120b"/>:<SymbolView name={{android:'send',ios:'paperplane.fill',web:'send'}} size={18} tintColor="#1c120b"/>}<Text style={styles.sendText}>{schedule?'SCHEDULE MESSAGE':'SEND MESSAGE'}</Text></Pressable>
          <Text style={styles.helper}>Use {'{student_name}'}, {'{batch_name}'} and {'{academy_name}'} for personalized messages.</Text>
        </> : null}

        {!loading && context && tab === 'TEMPLATES' ? <>
          <Panel eyebrow="REUSABLE COPY" title="Create academy template"><Input label="TEMPLATE NAME" value={templateName} onChangeText={setTemplateName}/><Input label="TITLE" value={newTemplateTitle} onChangeText={setNewTemplateTitle}/><Input label="MESSAGE" multiline value={newTemplateBody} onChangeText={setNewTemplateBody}/><Pressable onPress={()=>void saveTemplate()} style={styles.secondaryButton}><Text style={styles.secondaryText}>SAVE TEMPLATE</Text></Pressable></Panel>
          {context.templates.map((template)=><View key={template.id} style={styles.templateCard}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{template.name}</Text><Text style={styles.systemTag}>{template.system?'SYSTEM':'ACADEMY'}</Text></View><Text style={styles.templateTitle}>{template.title}</Text><Text style={styles.cardBody}>{template.body}</Text></View>)}
        </> : null}

        {!loading && tab === 'SENT' ? <>{campaigns.length ? campaigns.map((campaign)=><View key={campaign.id} style={styles.templateCard}><View style={styles.rowBetween}><Text numberOfLines={1} style={styles.cardTitle}>{campaign.title}</Text><Text style={styles.systemTag}>{campaign.status}</Text></View><Text numberOfLines={2} style={styles.cardBody}>{campaign.body}</Text><View style={styles.campaignStats}><Stat label="Recipients" value={campaign.recipientCount}/><Stat label="Push" value={campaign.pushEligibleCount}/><Stat label="Read" value={campaign.readCount}/></View><Text style={styles.time}>{new Date(campaign.sentAt||campaign.scheduledAt||campaign.createdAt).toLocaleString()}</Text></View>) : <Empty text="No messages sent yet."/>}</> : null}

        {!loading && context && tab === 'ADOPTION' ? <>
          <View style={styles.metrics}><Metric label="Push ready" value={context.adoption.active} tone="good"/><Metric label="No app" value={context.adoption.notConnected} tone="danger"/><Metric label="Notifications off" value={context.adoption.notificationsOff} tone="warn"/><Metric label="Inactive" value={context.adoption.inactive}/></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateChips}>{['ALL','ACTIVE','NOTIFICATIONS_OFF','INACTIVE','NOT_CONNECTED'].map((value)=><Pressable key={value} onPress={()=>setAdoptionFilter(value)} style={[styles.chip,adoptionFilter===value&&styles.chipActive]}><Text style={styles.chipText}>{value==='ALL'?'All':appLabel(value as AcademyMessageStudent['appStatus'])}</Text></Pressable>)}</ScrollView>
          {adoptionStudents.map((student)=><View key={student.id} style={styles.adoptionRow}><View style={[styles.presenceDot,student.appStatus==='ACTIVE'&&styles.presenceGood,student.appStatus==='NOT_CONNECTED'&&styles.presenceDanger]}/><View style={styles.grow}><Text style={styles.cardTitle}>{student.name}</Text><Text style={styles.muted}>{student.batchName||'No batch'} · {student.lastSeenAt?`Last active ${new Date(student.lastSeenAt).toLocaleDateString()}`:'Never connected'}</Text></View><Text style={styles.appStatus}>{appLabel(student.appStatus)}</Text></View>)}
          <Text style={styles.helper}>Parent-specific adoption will become available after parent accounts are linked.</Text>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  </LinearGradient>;
}

function Panel({ children, eyebrow, title }: { children: React.ReactNode; eyebrow: string; title: string }) { return <View style={styles.panel}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.panelTitle}>{title}</Text>{children}</View>; }
function Input(props: { label: string; multiline?: boolean; onChangeText: (value:string)=>void; placeholder?: string; value: string }) { return <View style={styles.inputGroup}><Text style={styles.label}>{props.label}</Text><TextInput {...props} placeholderTextColor={colors.muted} style={[styles.input,props.multiline&&styles.inputMulti]} textAlignVertical={props.multiline?'top':'center'}/></View>; }
function ChoiceRow({ checked,label,meta,onPress }: {checked:boolean;label:string;meta:string;onPress:()=>void}) { return <Pressable onPress={onPress} style={styles.choice}><View style={[styles.checkbox,checked&&styles.checkboxActive]}>{checked?<Text style={styles.check}>✓</Text>:null}</View><View style={styles.grow}><Text style={styles.cardTitle}>{label}</Text><Text style={styles.muted}>{meta}</Text></View></Pressable>; }
function Metric({label,value,tone}:{label:string;value:number;tone?:'good'|'warn'|'danger'}) { return <View style={styles.metric}><Text style={[styles.metricValue,tone==='good'&&styles.ready,tone==='warn'&&styles.warn,tone==='danger'&&styles.danger]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Stat({label,value}:{label:string;value:number}) { return <View><Text style={styles.statValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Empty({text}:{text:string}) { return <View style={styles.empty}><SymbolView name={{android:'mail',ios:'tray',web:'mail'}} size={34} tintColor={colors.gold}/><Text style={styles.muted}>{text}</Text></View>; }

const styles=StyleSheet.create({
  adoptionRow:{alignItems:'center',backgroundColor:'rgba(7,16,24,.9)',borderColor:colors.border,borderRadius:11,borderWidth:1,flexDirection:'row',gap:10,padding:12},appStatus:{color:colors.sandstone,fontSize:8,fontWeight:'900',maxWidth:80,textAlign:'right'},background:{flex:1},campaignStats:{borderTopColor:'rgba(201,143,28,.18)',borderTopWidth:1,flexDirection:'row',gap:28,marginTop:12,paddingTop:10},cardBody:{color:colors.sandstone,fontSize:10,lineHeight:15,marginTop:7},cardTitle:{color:colors.cream,fontSize:12,fontWeight:'900'},check:{color:'#20150c',fontSize:12,fontWeight:'900'},checkbox:{alignItems:'center',borderColor:'rgba(215,196,156,.4)',borderRadius:5,borderWidth:1,height:22,justifyContent:'center',width:22},checkboxActive:{backgroundColor:colors.goldLight,borderColor:colors.goldLight},chip:{backgroundColor:'rgba(255,255,255,.05)',borderColor:colors.border,borderRadius:14,borderWidth:1,maxWidth:160,paddingHorizontal:12,paddingVertical:7},chipActive:{backgroundColor:'rgba(201,143,28,.25)',borderColor:colors.goldLight},chipText:{color:colors.cream,fontSize:9,fontWeight:'800'},choice:{alignItems:'center',flexDirection:'row',gap:10,paddingHorizontal:4,paddingVertical:8},content:{gap:12,paddingBottom:36,paddingHorizontal:14},danger:{color:'#fda4af'},delivery:{alignItems:'center',backgroundColor:'rgba(201,143,28,.1)',borderColor:colors.gold,borderRadius:13,borderWidth:1,flexDirection:'row',justifyContent:'space-between',padding:15},deliveryNumber:{color:colors.cream,fontFamily:'serif',fontSize:29,fontWeight:'900'},deliveryRight:{alignItems:'flex-end'},disabled:{opacity:.4},empty:{alignItems:'center',gap:12,justifyContent:'center',minHeight:230},error:{backgroundColor:'rgba(127,29,29,.6)',borderColor:colors.danger,borderRadius:10,borderWidth:1,padding:12},errorText:{color:'#fecdd3',fontSize:10,lineHeight:15},eyebrow:{color:colors.gold,fontSize:8,fontWeight:'900',letterSpacing:1.2},grow:{flex:1,minWidth:0},helper:{color:colors.muted,fontSize:9,lineHeight:14,textAlign:'center'},input:{backgroundColor:'rgba(0,0,0,.2)',borderColor:colors.border,borderRadius:9,borderWidth:1,color:colors.cream,fontSize:12,minHeight:44,paddingHorizontal:12,paddingVertical:10},inputGroup:{gap:6,marginTop:13},inputMulti:{minHeight:120},label:{color:colors.muted,fontSize:8,fontWeight:'900',letterSpacing:.9},loading:{alignItems:'center',gap:9,minHeight:200,paddingTop:70},metric:{alignItems:'center',backgroundColor:'rgba(7,16,24,.9)',borderColor:colors.border,borderRadius:10,borderWidth:1,padding:10,width:'48%'},metricLabel:{color:colors.muted,fontSize:8,marginTop:2},metrics:{flexDirection:'row',flexWrap:'wrap',gap:9,justifyContent:'space-between'},metricValue:{color:colors.cream,fontFamily:'serif',fontSize:22,fontWeight:'900'},muted:{color:colors.muted,fontSize:9,lineHeight:14},options:{borderTopColor:'rgba(201,143,28,.18)',borderTopWidth:1,marginTop:12,maxHeight:260,paddingTop:5},panel:{backgroundColor:'rgba(7,16,24,.94)',borderColor:colors.border,borderRadius:14,borderWidth:1,padding:15},panelTitle:{color:colors.cream,fontFamily:'serif',fontSize:19,fontWeight:'900',marginTop:4},presenceDanger:{backgroundColor:'#fb7185'},presenceDot:{backgroundColor:'#f59e0b',borderRadius:5,height:10,width:10},presenceGood:{backgroundColor:'#4ade80'},ready:{color:'#86efac'},rowBetween:{alignItems:'center',flexDirection:'row',gap:10,justifyContent:'space-between'},safeArea:{flex:1},secondaryButton:{alignItems:'center',backgroundColor:colors.terracotta,borderColor:colors.gold,borderRadius:9,borderWidth:1,marginTop:14,padding:12},secondaryText:{color:colors.cream,fontSize:10,fontWeight:'900'},segment:{flexDirection:'row',gap:7,marginTop:12},segmentActive:{backgroundColor:'rgba(201,143,28,.25)',borderColor:colors.goldLight},segmentButton:{alignItems:'center',borderColor:colors.border,borderRadius:9,borderWidth:1,flex:1,paddingVertical:10},segmentText:{color:colors.muted,fontSize:8,fontWeight:'900'},segmentTextActive:{color:colors.goldLight},sendButton:{alignItems:'center',backgroundColor:colors.goldLight,borderRadius:10,flexDirection:'row',gap:8,justifyContent:'center',minHeight:50},sendText:{color:'#1c120b',fontSize:10,fontWeight:'900',letterSpacing:.8},statValue:{color:colors.cream,fontSize:16,fontWeight:'900'},systemTag:{color:colors.gold,fontSize:7,fontWeight:'900',letterSpacing:.8},tab:{alignItems:'center',borderBottomColor:'transparent',borderBottomWidth:2,flex:1,paddingBottom:10,paddingTop:7},tabActive:{borderBottomColor:colors.goldLight},tabs:{backgroundColor:'rgba(5,10,15,.92)',borderBottomColor:colors.border,borderBottomWidth:1,flexDirection:'row',paddingHorizontal:8},tabText:{color:colors.muted,fontSize:9,fontWeight:'900'},tabTextActive:{color:colors.goldLight},templateCard:{backgroundColor:'rgba(7,16,24,.9)',borderColor:colors.border,borderRadius:12,borderWidth:1,padding:13},templateChips:{gap:7,paddingVertical:8},templateTitle:{color:colors.goldLight,fontSize:10,fontWeight:'800',marginTop:8},time:{color:colors.muted,fontSize:8,marginTop:10,textAlign:'right'},warn:{color:'#fde68a'},
});
