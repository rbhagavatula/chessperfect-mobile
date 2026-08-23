import { Chess } from 'chess.js';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { CivBackdrop } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import {
  createMyDatabaseCollection,
  deleteMyDatabaseCollection,
  fetchMyDatabaseCollections,
  fetchMyDatabaseGames,
  fetchMyDatabaseOpeningGames,
  fetchMyDatabaseOpenings,
  type MyDatabaseCollection,
  type MyDatabaseGame,
  type MyDatabaseGamePage,
  type MyDatabaseOpeningExplorer,
  type MyDatabaseOpeningNode,
  type MyDatabaseWdl,
} from '@/lib/my-database';

type CollectionTab = 'ENDGAME' | 'GAMES' | 'MIDDLEGAME' | 'OPENING';
type OpeningTab = 'CLASSIFICATION' | 'STATISTICS';

const collectionTabs: { id: CollectionTab; label: string }[] = [
  { id: 'GAMES', label: 'Games' },
  { id: 'OPENING', label: 'Opening' },
  { id: 'MIDDLEGAME', label: 'Middle Game' },
  { id: 'ENDGAME', label: 'Endgame' },
];

function formatDate(value?: string | null) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPgnDate(value?: string | null) {
  if (!value) return '????.??.??';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '????.??.??';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function ratingLabel(rating?: number | null, delta?: number | null) {
  if (rating == null) return '';
  if (delta == null || delta === 0) return ` · ${rating}`;
  return ` · ${rating} (${delta > 0 ? '+' : ''}${delta})`;
}

function buildAnalysisPgn(game: MyDatabaseGame) {
  const setupMoves = (game.setupMoveText || '').split(/\s+/).filter(Boolean);
  const startingFen = setupMoves.length ? undefined : game.initialFen || undefined;
  const chess = startingFen ? new Chess(startingFen) : new Chess();
  const moves = `${game.setupMoveText || ''} ${game.movesUci || ''}`.split(/\s+/).filter(Boolean);
  for (const uci of moves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        promotion: (uci[4] || 'q') as 'b' | 'n' | 'q' | 'r',
        to: uci.slice(2, 4),
      });
      if (!move) break;
    } catch {
      break;
    }
  }
  chess.header('Event', game.tournamentName || 'Online Game');
  chess.header('Site', 'ChessPerfect');
  chess.header('Date', formatPgnDate(game.playedAt));
  chess.header('White', game.whiteUsername || 'White');
  chess.header('Black', game.blackUsername || 'Black');
  chess.header('Result', game.resultCode || '*');
  if (startingFen) chess.header('SetUp', '1', 'FEN', startingFen);
  return chess.pgn();
}

function openGame(game: MyDatabaseGame) {
  router.push({ pathname: '/learn/analysis', params: { gameId: String(game.id), pgn: buildAnalysisPgn(game) } } as unknown as Href);
}

function percentage(value: number, total: number) {
  return total ? Math.round((value * 1000) / total) / 10 : 0;
}

function DonutChart({ stats }: { stats: MyDatabaseWdl }) {
  const size = 112;
  const winStop = stats.total ? (stats.wins / stats.total) * 100 : 0;
  const drawStop = stats.total ? ((stats.wins + stats.draws) / stats.total) * 100 : 0;
  const ring = stats.total
    ? `conic-gradient(${colors.success} 0 ${winStop}%, ${colors.goldLight} ${winStop}% ${drawStop}%, ${colors.danger} ${drawStop}% 100%)`
    : 'rgba(255,255,255,0.08)';
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden}.ring{width:${size}px;height:${size}px;border-radius:50%;background:${ring};display:grid;place-items:center}.center{width:76px;height:76px;border-radius:50%;background:#071018;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f6ddaa;font-family:Arial,sans-serif}.total{font-size:24px;font-weight:800;line-height:27px}.label{color:#cdbb97;font-size:8px;font-weight:800;letter-spacing:1px}</style></head><body><div class="ring"><div class="center"><div class="total">${stats.total}</div><div class="label">GAMES</div></div></div></body></html>`;
  return (
    <View accessibilityLabel={`${stats.wins} wins, ${stats.draws} draws, ${stats.losses} losses`} pointerEvents="none" style={styles.donutWrap}>
      <WebView
        androidLayerType="software"
        containerStyle={styles.donutWebView}
        originWhitelist={['about:blank']}
        scrollEnabled={false}
        source={{ html }}
        style={styles.donutWebView}
      />
    </View>
  );
}

function WdlCard({ label, stats }: { label: string; stats: MyDatabaseWdl }) {
  return (
    <View style={styles.wdlCard}>
      <Text style={styles.wdlTitle}>{label}</Text>
      <DonutChart stats={stats} />
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.success }]} /><Text style={styles.legendText}>{percentage(stats.wins, stats.total)}% Win</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.goldLight }]} /><Text style={styles.legendText}>{percentage(stats.draws, stats.total)}% Draw</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.danger }]} /><Text style={styles.legendText}>{percentage(stats.losses, stats.total)}% Loss</Text></View>
      </View>
    </View>
  );
}

function GameCard({ game }: { game: MyDatabaseGame }) {
  const openingLabel = game.startingPositionName || game.openingName || game.ecoCode;
  return (
    <Pressable accessibilityRole="button" onPress={() => openGame(game)} style={({ pressed }) => [styles.gameCard, pressed && styles.pressed]}>
      <View style={styles.gameTopRow}><Text style={styles.gameDate}>{formatDate(game.playedAt)}</Text><Text style={styles.result}>{game.resultCode || '*'}</Text></View>
      <View style={styles.playerRow}><Text style={styles.pieceMark}>♔</Text><Text numberOfLines={1} style={styles.playerName}>{game.whiteUsername || 'White'}<Text style={styles.rating}>{ratingLabel(game.whiteRating, game.whiteRatingDelta)}</Text></Text></View>
      <View style={styles.playerRow}><Text style={styles.pieceMark}>♚</Text><Text numberOfLines={1} style={styles.playerName}>{game.blackUsername || 'Black'}<Text style={styles.rating}>{ratingLabel(game.blackRating, game.blackRatingDelta)}</Text></Text></View>
      <View style={styles.gameMetaRow}>
        {openingLabel ? <Text numberOfLines={1} style={styles.opening}>{openingLabel}</Text> : null}
        <Text style={styles.timeControl}>{game.timeControl || '—'} · {game.rated ? 'RATED' : 'CASUAL'}</Text>
      </View>
      {game.tournamentName ? <Text style={styles.tournament}>{game.tournamentName}</Text> : null}
      <View style={styles.openHint}><Text style={styles.openHintText}>OPEN IN ANALYSIS BOARD</Text><Text style={styles.openHintArrow}>›</Text></View>
    </Pressable>
  );
}

function GameList({ emptyText, page, pageIndex, onPageChange }: {
  emptyText: string;
  page: MyDatabaseGamePage | null;
  pageIndex: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <>
      {page?.items.length ? page.items.map((game) => <GameCard game={game} key={game.id} />) : <Text style={styles.emptyText}>{emptyText}</Text>}
      {(page?.totalPages ?? 0) > 1 ? (
        <View style={styles.pagination}>
          <Pressable disabled={pageIndex === 0} onPress={() => onPageChange(Math.max(0, pageIndex - 1))} style={[styles.pageButton, pageIndex === 0 && styles.disabled]}><Text style={styles.pageText}>PREVIOUS</Text></Pressable>
          <Text style={styles.pageLabel}>{pageIndex + 1} / {page?.totalPages}</Text>
          <Pressable disabled={pageIndex + 1 >= (page?.totalPages ?? 1)} onPress={() => onPageChange(pageIndex + 1)} style={[styles.pageButton, pageIndex + 1 >= (page?.totalPages ?? 1) && styles.disabled]}><Text style={styles.pageText}>NEXT</Text></Pressable>
        </View>
      ) : null}
    </>
  );
}

function OpeningStatistics({ explorer }: { explorer: MyDatabaseOpeningExplorer }) {
  return (
    <View style={styles.openingPanel}>
      <View style={styles.panelHeading}><Text style={styles.panelTitle}>OVERALL PERFORMANCE</Text><Text style={styles.panelCaption}>All {explorer.totalGames} games in this collection</Text></View>
      <View style={styles.wdlRow}><WdlCard label="AS WHITE" stats={explorer.asWhite} /><WdlCard label="AS BLACK" stats={explorer.asBlack} /></View>
    </View>
  );
}

function OpeningTreeNodeRow({
  childrenByParent,
  depth,
  expanded,
  node,
  onSelect,
  selectedId,
  toggleExpanded,
}: {
  childrenByParent: Map<number | null, MyDatabaseOpeningNode[]>;
  depth: number;
  expanded: Set<number>;
  node: MyDatabaseOpeningNode;
  onSelect: (node: MyDatabaseOpeningNode) => void;
  selectedId?: number;
  toggleExpanded: (id: number) => void;
}) {
  const children = childrenByParent.get(node.id) ?? [];
  const isExpanded = expanded.has(node.id);
  const selected = selectedId === node.id;
  return (
    <>
      <View style={[styles.treeRow, selected && styles.treeRowSelected, { marginLeft: Math.min(depth, 4) * 15 }]}>
        <Pressable accessibilityLabel={isExpanded ? 'Collapse variations' : 'Expand variations'} disabled={!children.length} onPress={() => toggleExpanded(node.id)} style={styles.treeToggle}>
          <Text style={[styles.treeChevron, !children.length && styles.treeChevronLeaf]}>{children.length ? (isExpanded ? '⌄' : '›') : '•'}</Text>
        </Pressable>
        <Pressable onPress={() => onSelect(node)} style={styles.treeNodeButton}>
          <View style={styles.treeNameWrap}><Text numberOfLines={2} style={[styles.treeName, selected && styles.treeNameSelected]}>{node.displayName}</Text>{node.ecoCodes ? <Text style={styles.treeEco}>ECO {node.ecoCodes}</Text> : null}</View>
          <Text style={[styles.treeCount, node.gameCount === 0 && styles.treeCountZero]}>{node.gameCount}</Text>
        </Pressable>
      </View>
      {children.length && isExpanded ? children.map((child) => (
        <OpeningTreeNodeRow
          childrenByParent={childrenByParent}
          depth={depth + 1}
          expanded={expanded}
          key={child.id}
          node={child}
          onSelect={onSelect}
          selectedId={selectedId}
          toggleExpanded={toggleExpanded}
        />
      )) : null}
    </>
  );
}

function SelectedOpening({ node, onViewGames }: { node: MyDatabaseOpeningNode; onViewGames: () => void }) {
  return (
    <View style={styles.selectedOpening}>
      <View style={styles.selectedOpeningHeader}><View style={styles.selectedOpeningCopy}><Text style={styles.selectedOpeningEyebrow}>SELECTED OPENING</Text><Text style={styles.selectedOpeningTitle}>{node.displayName}</Text><Text style={styles.selectedOpeningMeta}>{node.gameCount} games{node.ecoCodes ? ` · ECO ${node.ecoCodes}` : ''}</Text></View><DonutChart stats={node.overall} /></View>
      <View style={styles.selectedRatios}>
        <Text style={[styles.ratioText, { color: colors.success }]}>{percentage(node.overall.wins, node.overall.total)}% WIN</Text>
        <Text style={[styles.ratioText, { color: colors.goldLight }]}>{percentage(node.overall.draws, node.overall.total)}% DRAW</Text>
        <Text style={[styles.ratioText, { color: colors.danger }]}>{percentage(node.overall.losses, node.overall.total)}% LOSS</Text>
      </View>
      <Pressable disabled={node.gameCount === 0} onPress={onViewGames} style={[styles.viewGamesButton, node.gameCount === 0 && styles.disabled]}><Text style={styles.viewGamesText}>VIEW {node.gameCount} {node.gameCount === 1 ? 'GAME' : 'GAMES'}</Text><Text style={styles.viewGamesArrow}>›</Text></Pressable>
    </View>
  );
}

export default function MyDatabaseScreen() {
  const [collections, setCollections] = useState<MyDatabaseCollection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collectionTab, setCollectionTab] = useState<CollectionTab>('GAMES');
  const [openingTab, setOpeningTab] = useState<OpeningTab>('STATISTICS');
  const [gamesPage, setGamesPage] = useState<MyDatabaseGamePage | null>(null);
  const [page, setPage] = useState(0);
  const [openingExplorer, setOpeningExplorer] = useState<MyDatabaseOpeningExplorer | null>(null);
  const [selectedOpening, setSelectedOpening] = useState<MyDatabaseOpeningNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [nodeGames, setNodeGames] = useState<MyDatabaseGamePage | null>(null);
  const [nodePage, setNodePage] = useState(0);
  const [showNodeGames, setShowNodeGames] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => collections.find((item) => item.id === selectedId) ?? null, [collections, selectedId]);
  const onlineCollection = useMemo(() => collections.find((item) => item.kind === 'SYSTEM') ?? null, [collections]);
  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, MyDatabaseOpeningNode[]>();
    const availableIds = new Set(openingExplorer?.nodes.map((node) => node.id) ?? []);
    for (const node of openingExplorer?.nodes ?? []) {
      const parentId = node.parentId != null && availableIds.has(node.parentId) ? node.parentId : null;
      map.set(parentId, [...(map.get(parentId) ?? []), node]);
    }
    return map;
  }, [openingExplorer]);

  useEffect(() => {
    let cancelled = false;
    void fetchMyDatabaseCollections()
      .then((items) => {
        if (cancelled) return;
        setCollections(items);
        setSelectedId(items.find((item) => item.kind === 'SYSTEM')?.id ?? items[0]?.id ?? null);
      })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to open My Database.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    let cancelled = false;
    const loadingTimer = setTimeout(() => {
      if (!cancelled) {
        setContentLoading(true);
        setError(null);
      }
    }, 0);
    const request = collectionTab === 'GAMES'
      ? fetchMyDatabaseGames(selectedId, page, 20).then((next) => { if (!cancelled) setGamesPage(next); })
      : collectionTab === 'OPENING'
        ? fetchMyDatabaseOpenings(selectedId).then((next) => {
          if (cancelled) return;
          setOpeningExplorer(next);
          setExpandedNodes(new Set());
          setSelectedOpening((current) => current ? next.nodes.find((node) => node.id === current.id) ?? null : null);
        })
        : Promise.resolve();
    void request
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load collection details.'); })
      .finally(() => { if (!cancelled) setContentLoading(false); });
    return () => { cancelled = true; clearTimeout(loadingTimer); };
  }, [collectionTab, page, selectedId]);

  useEffect(() => {
    if (!showNodeGames || selectedId == null || selectedOpening == null) return;
    let cancelled = false;
    const loadingTimer = setTimeout(() => { if (!cancelled) setContentLoading(true); }, 0);
    void fetchMyDatabaseOpeningGames(selectedId, selectedOpening.id, nodePage, 20)
      .then((next) => { if (!cancelled) setNodeGames(next); })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load opening games.'); })
      .finally(() => { if (!cancelled) setContentLoading(false); });
    return () => { cancelled = true; clearTimeout(loadingTimer); };
  }, [nodePage, selectedId, selectedOpening, showNodeGames]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const items = await fetchMyDatabaseCollections();
      setCollections(items);
      const nextId = selectedId != null && items.some((item) => item.id === selectedId)
        ? selectedId
        : items.find((item) => item.kind === 'SYSTEM')?.id ?? items[0]?.id ?? null;
      setSelectedId(nextId);
      if (nextId != null && collectionTab === 'GAMES') setGamesPage(await fetchMyDatabaseGames(nextId, page, 20));
      if (nextId != null && collectionTab === 'OPENING') {
        const next = await fetchMyDatabaseOpenings(nextId);
        setOpeningExplorer(next);
        setExpandedNodes(new Set());
        setSelectedOpening((current) => current ? next.nodes.find((node) => node.id === current.id) ?? null : null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh My Database.');
    } finally {
      setRefreshing(false);
    }
  }

  function selectCollection(id: number) {
    setSelectedId(id);
    setCollectionTab('GAMES');
    setOpeningTab('STATISTICS');
    setPage(0);
    setGamesPage(null);
    setOpeningExplorer(null);
    setSelectedOpening(null);
    setShowNodeGames(false);
  }

  function selectOpening(node: MyDatabaseOpeningNode) {
    setSelectedOpening(node);
    setShowNodeGames(false);
    setNodeGames(null);
    setNodePage(0);
  }

  async function createCollection() {
    const name = newCollectionName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const created = await createMyDatabaseCollection(name);
      const items = await fetchMyDatabaseCollections();
      setCollections(items);
      setNewCollectionName('');
      setCreateOpen(false);
      selectCollection(created.id);
    } catch (caught) {
      Alert.alert('Could not create collection', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!selected || selected.kind !== 'CUSTOM') return;
    Alert.alert('Delete collection?', `“${selected.name}” will be removed. Your Online Games archive will not be affected.`, [
      { style: 'cancel', text: 'Cancel' },
      { style: 'destructive', text: 'Delete', onPress: async () => {
        try {
          await deleteMyDatabaseCollection(selected.id);
          const items = await fetchMyDatabaseCollections();
          setCollections(items);
          selectCollection(onlineCollection?.id ?? items[0]?.id ?? 0);
        } catch (caught) {
          Alert.alert('Could not delete collection', caught instanceof Error ? caught.message : 'Please try again.');
        }
      } },
    ]);
  }

  function renderCollectionContent() {
    if (contentLoading && !gamesPage && !openingExplorer) return <View style={styles.contentLoader}><ActivityIndicator color={colors.goldLight} /><Text style={styles.mutedText}>Loading collection…</Text></View>;
    if (collectionTab === 'GAMES') {
      return (
        <View style={styles.tabContent}>
          <View style={styles.contentHeading}><View><Text style={styles.contentTitle}>GAMES</Text><Text style={styles.contentCaption}>{gamesPage?.totalElements ?? selected?.gameCount ?? 0} saved games</Text></View>{selected?.kind === 'CUSTOM' ? <Pressable onPress={confirmDelete} style={styles.deleteButton}><SymbolView name={{ android: 'delete', ios: 'trash.fill', web: 'delete' }} size={18} tintColor={colors.danger} /></Pressable> : null}</View>
          <GameList emptyText={selected?.kind === 'SYSTEM' ? 'Your completed games will appear here automatically.' : 'This collection does not contain any games yet.'} onPageChange={setPage} page={gamesPage} pageIndex={page} />
        </View>
      );
    }
    if (collectionTab === 'MIDDLEGAME' || collectionTab === 'ENDGAME') {
      return <View style={styles.comingSoon}><Text style={styles.comingSoonTitle}>{collectionTab === 'MIDDLEGAME' ? 'Middle Game' : 'Endgame'}</Text><Text style={styles.comingSoonText}>This workspace is ready for the next analytics module. We’re completing Opening first.</Text></View>;
    }
    return (
      <View style={styles.tabContent}>
        <View style={styles.innerTabs}>
          {(['STATISTICS', 'CLASSIFICATION'] as OpeningTab[]).map((tab) => <Pressable key={tab} onPress={() => { setOpeningTab(tab); setShowNodeGames(false); }} style={[styles.innerTab, openingTab === tab && styles.innerTabActive]}><Text style={[styles.innerTabText, openingTab === tab && styles.innerTabTextActive]}>{tab === 'STATISTICS' ? 'Statistics' : 'Classification'}</Text></Pressable>)}
        </View>
        {openingExplorer && openingTab === 'STATISTICS' ? <OpeningStatistics explorer={openingExplorer} /> : null}
        {openingExplorer && openingTab === 'CLASSIFICATION' ? (
          <>
            <View style={styles.classificationIntro}><Text style={styles.panelTitle}>OPENING TREE</Text><Text style={styles.panelCaption}>Counts include every matching variation in {selected?.name}. Select a node for its results.</Text></View>
            {selectedOpening ? <SelectedOpening node={selectedOpening} onViewGames={() => { setShowNodeGames(true); setNodePage(0); }} /> : <Text style={styles.selectPrompt}>Select an opening or variation to see its performance.</Text>}
            {showNodeGames && selectedOpening ? <View style={styles.nodeGames}><View style={styles.nodeGamesHeading}><View><Text style={styles.panelTitle}>{selectedOpening.displayName.toUpperCase()}</Text><Text style={styles.panelCaption}>{nodeGames?.totalElements ?? selectedOpening.gameCount} matching games</Text></View><Pressable onPress={() => setShowNodeGames(false)}><Text style={styles.hideGames}>HIDE</Text></Pressable></View><GameList emptyText="No games matched this opening." onPageChange={setNodePage} page={nodeGames} pageIndex={nodePage} /></View> : null}
            <View style={styles.treePanel}>
              {(childrenByParent.get(null) ?? []).map((node) => <OpeningTreeNodeRow childrenByParent={childrenByParent} depth={0} expanded={expandedNodes} key={node.id} node={node} onSelect={selectOpening} selectedId={selectedOpening?.id} toggleExpanded={(id) => setExpandedNodes((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />)}
              {!openingExplorer.nodes.length ? <Text style={styles.emptyTree}>No catalogued openings occurred in this collection yet.</Text> : null}
            </View>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <LinearGradient colors={['#06111c', '#17110d', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader rightAction={{ accessibilityLabel: 'Create collection', icon: { android: 'create_new_folder', ios: 'folder.badge.plus', web: 'create_new_folder' }, onPress: () => setCreateOpen(true) }} title="My Database" />
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl colors={[colors.gold]} onRefresh={() => void refresh()} refreshing={refreshing} tintColor={colors.goldLight} />} showsVerticalScrollIndicator={false}>
          {loading ? <View style={styles.loadingPanel}><ActivityIndicator color={colors.goldLight} size="large" /><Text style={styles.mutedText}>Opening your private chess archive…</Text></View> : error && !collections.length ? <View style={styles.errorPanel}><Text style={styles.errorText}>{error}</Text></View> : (
            <>
              <Text style={styles.sectionTitle}>COLLECTIONS</Text>
              <ScrollView contentContainerStyle={styles.collectionRow} horizontal showsHorizontalScrollIndicator={false}>
                {collections.map((collection) => { const active = collection.id === selectedId; return <Pressable key={collection.id} onPress={() => selectCollection(collection.id)} style={[styles.collectionChip, active && styles.collectionChipActive]}><SymbolView name={collection.kind === 'SYSTEM' ? { android: 'shield', ios: 'lock.shield.fill', web: 'shield' } : { android: 'folder', ios: 'folder.fill', web: 'folder' }} size={17} tintColor={active ? colors.ink : colors.goldLight} /><View><Text style={[styles.collectionName, active && styles.collectionNameActive]}>{collection.name}</Text><Text style={[styles.collectionCount, active && styles.collectionNameActive]}>{collection.gameCount} games</Text></View></Pressable>; })}
                <Pressable onPress={() => setCreateOpen(true)} style={styles.addChip}><Text style={styles.addChipText}>＋ NEW</Text></Pressable>
              </ScrollView>
              {selected ? <ScrollView contentContainerStyle={styles.collectionTabs} horizontal showsHorizontalScrollIndicator={false}>{collectionTabs.map((tab) => <Pressable key={tab.id} onPress={() => { setCollectionTab(tab.id); setPage(0); setShowNodeGames(false); }} style={[styles.collectionTab, collectionTab === tab.id && styles.collectionTabActive]}><Text style={[styles.collectionTabText, collectionTab === tab.id && styles.collectionTabTextActive]}>{tab.label}</Text></Pressable>)}</ScrollView> : null}
              {error ? <Text style={styles.inlineError}>{error}</Text> : null}
              {selected ? renderCollectionContent() : <Text style={styles.emptyText}>Create a collection to begin.</Text>}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      <Modal animationType="fade" onRequestClose={() => setCreateOpen(false)} transparent visible={createOpen}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.eyebrow}>MY DATABASE</Text><Text style={styles.modalTitle}>New Collection</Text><Text style={styles.modalCopy}>Create a private collection for games you want to study together.</Text><TextInput autoFocus maxLength={120} onChangeText={setNewCollectionName} placeholder="Collection name" placeholderTextColor="#746c5f" style={styles.input} value={newCollectionName} /><View style={styles.modalActions}><Pressable onPress={() => setCreateOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>CANCEL</Text></Pressable><Pressable disabled={!newCollectionName.trim() || saving} onPress={() => void createCollection()} style={[styles.createButton, (!newCollectionName.trim() || saving) && styles.disabled]}>{saving ? <ActivityIndicator color={colors.cream} size="small" /> : <Text style={styles.createText}>CREATE</Text>}</Pressable></View></View></View></Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: 14, paddingBottom: 42 },
  loadingPanel: { alignItems: 'center', justifyContent: 'center', minHeight: 360 },
  mutedText: { color: colors.muted, fontSize: 11, marginTop: 10 },
  errorPanel: { backgroundColor: 'rgba(91,18,27,0.75)', borderColor: colors.danger, borderRadius: 12, borderWidth: 1, padding: 20 },
  errorText: { color: '#fecdd3', lineHeight: 19, textAlign: 'center' },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  sectionTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 15, fontWeight: '900', letterSpacing: 0.5, marginTop: 8 },
  collectionRow: { gap: 9, paddingBottom: 3, paddingTop: 9 },
  collectionChip: { alignItems: 'center', backgroundColor: 'rgba(9,21,34,0.92)', borderColor: 'rgba(201,143,28,0.35)', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, minWidth: 135, paddingHorizontal: 12, paddingVertical: 10 },
  collectionChipActive: { backgroundColor: colors.goldLight, borderColor: colors.cream },
  collectionName: { color: colors.cream, fontSize: 11, fontWeight: '900' },
  collectionNameActive: { color: colors.ink },
  collectionCount: { color: colors.muted, fontSize: 8, marginTop: 2 },
  addChip: { alignItems: 'center', borderColor: colors.gold, borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, justifyContent: 'center', paddingHorizontal: 16 },
  addChipText: { color: colors.goldLight, fontSize: 9, fontWeight: '900' },
  collectionTabs: { borderBottomColor: 'rgba(201,143,28,0.28)', borderBottomWidth: 1, gap: 4, marginTop: 18, paddingRight: 10 },
  collectionTab: { borderTopLeftRadius: 9, borderTopRightRadius: 9, paddingHorizontal: 16, paddingVertical: 11 },
  collectionTabActive: { backgroundColor: 'rgba(201,143,28,0.2)', borderBottomColor: colors.goldLight, borderBottomWidth: 2 },
  collectionTabText: { color: colors.muted, fontSize: 10, fontWeight: '900' },
  collectionTabTextActive: { color: colors.goldLight },
  inlineError: { color: '#fecdd3', fontSize: 10, marginTop: 10 },
  tabContent: { marginTop: 14 },
  contentLoader: { alignItems: 'center', padding: 35 },
  contentHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  contentTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 18, fontWeight: '900' },
  contentCaption: { color: colors.muted, fontSize: 9, marginTop: 2 },
  deleteButton: { alignItems: 'center', borderColor: 'rgba(251,113,133,0.4)', borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  innerTabs: { backgroundColor: 'rgba(7,16,24,0.85)', borderColor: 'rgba(201,143,28,0.25)', borderRadius: 11, borderWidth: 1, flexDirection: 'row', padding: 4 },
  innerTab: { alignItems: 'center', borderRadius: 8, flex: 1, paddingVertical: 10 },
  innerTabActive: { backgroundColor: colors.goldLight },
  innerTabText: { color: colors.sandstone, fontSize: 10, fontWeight: '900' },
  innerTabTextActive: { color: colors.ink },
  openingPanel: { backgroundColor: 'rgba(9,21,34,0.92)', borderColor: 'rgba(201,143,28,0.25)', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 13 },
  panelHeading: { marginBottom: 10 },
  panelTitle: { color: colors.goldLight, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  panelCaption: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  wdlRow: { flexDirection: 'row', gap: 9 },
  wdlCard: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 10, flex: 1, padding: 10 },
  wdlTitle: { color: colors.sandstone, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  donutWrap: { alignItems: 'center', height: 112, justifyContent: 'center', width: 112 },
  donutWebView: { backgroundColor: 'transparent', flex: 0, height: 112, width: 112 },
  legend: { gap: 5, width: '100%' },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendDot: { borderRadius: 3, height: 6, width: 6 },
  legendText: { color: colors.sandstone, fontSize: 8 },
  classificationIntro: { marginTop: 14 },
  treePanel: { backgroundColor: 'rgba(9,21,34,0.92)', borderColor: 'rgba(201,143,28,0.25)', borderRadius: 11, borderWidth: 1, marginTop: 9, overflow: 'hidden', padding: 7 },
  treeRow: { alignItems: 'stretch', borderBottomColor: 'rgba(255,255,255,0.06)', borderBottomWidth: 1, flexDirection: 'row', minHeight: 48 },
  treeRowSelected: { backgroundColor: 'rgba(19,100,105,0.24)', borderColor: 'rgba(112,189,185,0.35)', borderRadius: 8, borderWidth: 1 },
  treeToggle: { alignItems: 'center', justifyContent: 'center', width: 30 },
  treeChevron: { color: colors.goldLight, fontSize: 18, fontWeight: '900' },
  treeChevronLeaf: { color: colors.muted, fontSize: 10 },
  treeNodeButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 8 },
  treeNameWrap: { flex: 1 },
  treeName: { color: colors.cream, fontSize: 11, fontWeight: '800' },
  treeNameSelected: { color: '#d8fffb' },
  treeEco: { color: colors.muted, fontSize: 7, marginTop: 2 },
  treeCount: { backgroundColor: 'rgba(201,143,28,0.2)', borderRadius: 12, color: colors.goldLight, fontSize: 9, fontWeight: '900', minWidth: 28, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4, textAlign: 'center' },
  treeCountZero: { backgroundColor: 'rgba(255,255,255,0.05)', color: colors.muted },
  emptyTree: { color: colors.muted, fontSize: 10, padding: 15, textAlign: 'center' },
  selectPrompt: { color: colors.muted, fontSize: 10, marginTop: 10, textAlign: 'center' },
  selectedOpening: { backgroundColor: 'rgba(7,16,24,0.96)', borderColor: 'rgba(112,189,185,0.4)', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 13 },
  selectedOpeningHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectedOpeningCopy: { flex: 1, paddingRight: 8 },
  selectedOpeningEyebrow: { color: '#82d9d4', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  selectedOpeningTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 19, fontWeight: '900', marginTop: 4 },
  selectedOpeningMeta: { color: colors.sandstone, fontSize: 9, marginTop: 4 },
  selectedRatios: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
  ratioText: { fontSize: 9, fontWeight: '900' },
  viewGamesButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 13, paddingHorizontal: 14, paddingVertical: 11 },
  viewGamesText: { color: colors.cream, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  viewGamesArrow: { color: colors.goldLight, fontSize: 20, lineHeight: 18 },
  nodeGames: { borderTopColor: 'rgba(201,143,28,0.25)', borderTopWidth: 1, marginTop: 17, paddingTop: 14 },
  nodeGamesHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  hideGames: { color: '#82d9d4', fontSize: 9, fontWeight: '900' },
  gameCard: { backgroundColor: 'rgba(9,21,34,0.92)', borderColor: 'rgba(201,143,28,0.25)', borderRadius: 11, borderWidth: 1, marginTop: 9, padding: 13 },
  pressed: { opacity: 0.72 },
  gameTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  gameDate: { color: colors.muted, fontSize: 9 },
  result: { color: colors.goldLight, fontFamily: 'serif', fontSize: 16, fontWeight: '900' },
  playerRow: { alignItems: 'center', flexDirection: 'row', marginTop: 6 },
  pieceMark: { color: colors.goldLight, fontSize: 17, width: 25 },
  playerName: { color: colors.cream, flex: 1, fontSize: 12, fontWeight: '800' },
  rating: { color: colors.sandstone, fontWeight: '500' },
  gameMetaRow: { borderTopColor: 'rgba(255,255,255,0.08)', borderTopWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 10, paddingTop: 9 },
  opening: { color: colors.sandstone, flex: 1, fontSize: 9 },
  timeControl: { color: colors.gold, fontSize: 8, fontWeight: '900', marginLeft: 'auto' },
  tournament: { color: '#82d9d4', fontSize: 9, fontWeight: '800', marginTop: 7 },
  openHint: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  openHintText: { color: colors.muted, fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  openHintArrow: { color: colors.goldLight, fontSize: 17, marginLeft: 5 },
  emptyText: { backgroundColor: 'rgba(9,21,34,0.72)', borderRadius: 10, color: colors.muted, fontSize: 11, marginTop: 10, padding: 18, textAlign: 'center' },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  pageButton: { borderColor: colors.gold, borderRadius: 8, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  pageText: { color: colors.goldLight, fontSize: 8, fontWeight: '900' },
  pageLabel: { color: colors.muted, fontSize: 10 },
  comingSoon: { alignItems: 'center', backgroundColor: 'rgba(9,21,34,0.8)', borderColor: 'rgba(201,143,28,0.25)', borderRadius: 12, borderWidth: 1, marginTop: 15, padding: 28 },
  comingSoonTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 22, fontWeight: '900' },
  comingSoonText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 7, textAlign: 'center' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', flex: 1, justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#08131f', borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 20, width: '100%' },
  modalTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 23, fontWeight: '900', marginTop: 4 },
  modalCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7 },
  input: { backgroundColor: '#050c13', borderColor: 'rgba(201,143,28,0.4)', borderRadius: 9, borderWidth: 1, color: colors.cream, fontSize: 14, marginTop: 17, paddingHorizontal: 12, paddingVertical: 11 },
  modalActions: { flexDirection: 'row', gap: 9, justifyContent: 'flex-end', marginTop: 16 },
  cancelButton: { borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  cancelText: { color: colors.sandstone, fontSize: 9, fontWeight: '900' },
  createButton: { backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 8, borderWidth: 1, minWidth: 90, paddingHorizontal: 16, paddingVertical: 11 },
  createText: { color: colors.cream, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.4 },
});
