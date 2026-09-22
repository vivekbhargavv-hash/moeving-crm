"use client";

import {
  ChevronRight,
  Download,
  LayoutGrid,
  ListFilter,
  Rows3,
  Search,
  Truck,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PipelineList } from "@/components/pipeline/table";
import { Segmented } from "@/components/ui";
import { StageChanger, type StageTarget } from "@/components/stage-changer";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  type Filters,
  PipelineFilterSheet,
} from "@/components/pipeline/filters";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import type { SalesStage } from "@/db/schema";
import { STAGES, STAGE_MAP } from "@/lib/constants";
import { showToast } from "@/lib/toast";
import { useIsDesktop } from "@/lib/use-desktop";
import { cn, daysUntil, formatDate, inr, inrCompact, num } from "@/lib/utils";
import { changeStage } from "@/server/actions";
import type { OpportunityCard } from "@/server/queries";

// Bumped from "moeving:pipeline-view" when the table became the default, so a
// board preference saved under the old default does not override it.
const VIEW_KEY = "moeving:pipeline-view-v2";

type Props = {
  opportunities: OpportunityCard[];
  lostReasons: { id: string; label: string }[];
  owners: { id: string; name: string }[];
  cities: { id: string; name: string }[];
  vehicleTypes: { id: string; name: string }[];
  currentUserId: string;
  /** What the server already narrowed to, read back out of the URL. */
  filters: Filters;
  search: string;
  showingMine: boolean;
  /** True when the row cap was reached, so the screen can say so. */
  capped: boolean;
  /** The server's guess at the layout, from the user agent. */
  initialDesktop: boolean;
};

/** Cards drawn per stage column before "Show more". */
const CARD_PAGE = 30;

export function PipelineBoard({
  opportunities,
  lostReasons,
  owners,
  cities,
  vehicleTypes,
  currentUserId,
  filters,
  search,
  showingMine,
  capped,
  initialDesktop,
}: Props) {
  // One layout and one view are built, not all four: the others used to be
  // rendered and hidden with CSS, which on a phone in List view meant ~300
  // cards and rows built for nothing.
  const desktop = useIsDesktop(initialDesktop);
  const [stageIndex, setStageIndex] = React.useState(0);
  // A stage column is drawn a screenful at a time: 200 cards in Negotiation
  // is 200 cards the phone builds before you have scrolled to the third.
  const [cardsShown, setCardsShown] = React.useState(CARD_PAGE);
  const [query, setQuery] = React.useState(search);
  const [filtering, setFiltering] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [target, setTarget] = React.useState<StageTarget | null>(null);
  /**
   * Whose deals, shown the instant it is pressed.
   *
   * The real answer is a server render away, and a switch that stays where it
   * was until the list comes back reads as a missed tap — so the thumb gets
   * its answer now and React puts the value back if the navigation fails.
   */
  const [optimisticMine, setOptimisticMine] = React.useOptimistic(showingMine);
  // The table is the default: it opens on what changed most recently, which is
  // what someone checking the pipeline came to see. The board is a click away.
  const [view, setView] = React.useState<"board" | "list">("list");
  const [searching, setSearching] = React.useState(false);
  const router = useRouter();
  const tabsRef = React.useRef<HTMLDivElement>(null);

  // The chosen view is a per-person habit, so it survives a reload.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "list" || saved === "board") setView(saved);
    } catch {
      /* private mode — the default is fine */
    }
  }, []);

  function chooseView(next: "board" | "list") {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignored */
    }
  }

  /**
   * A dropped card lands in its new column at once.
   *
   * It used to sit in the old one until the server answered, which read as a
   * drop that had not taken. The move is optimistic for the length of the
   * save; the re-rendered page replaces it, and a failure puts it back.
   */
  const [moved, move] = React.useOptimistic(
    opportunities,
    (list, m: { id: string; stage: SalesStage }) =>
      list.map((o) => (o.id === m.id ? { ...o, stage: m.stage } : o)),
  );

  function drop(opp: OpportunityCard, stage: SalesStage) {
    startTransition(async () => {
      move({ id: opp.id, stage });
      try {
        const result = await changeStage(opp.id, stage);
        showToast(
          result.ok
            ? `${opp.accountName} moved to ${STAGE_MAP[stage].label}`
            : `Could not move ${opp.accountName}: ${result.error}`,
        );
      } catch {
        showToast(`Could not move ${opp.accountName}. Check your connection.`);
      }
    });
  }

  // Narrowing all happened in SQL before these rows were sent, search
  // included — so what arrives IS the result, and a row cap can never hide a
  // deal from the one feature whose job is to find it.
  const filtered = moved;

  const byStage = React.useMemo(() => {
    const map = new Map<SalesStage, OpportunityCard[]>();
    for (const s of STAGES) map.set(s.value, []);
    for (const o of filtered) map.get(o.stage)?.push(o);
    return map;
  }, [filtered]);

  // Filtering by stage narrows the board to those columns too, rather than
  // leaving a row of empty ones.
  const visibleStages = filters.stages.length
    ? STAGES.filter((s) => filters.stages.includes(s.value))
    : STAGES;

  React.useEffect(() => {
    setStageIndex((i) => Math.min(i, visibleStages.length - 1));
  }, [visibleStages.length]);

  React.useEffect(() => setCardsShown(CARD_PAGE), [stageIndex, opportunities]);

  const activeStage = visibleStages[Math.min(stageIndex, visibleStages.length - 1)]!;
  const activeList = byStage.get(activeStage.value) ?? [];
  // The badge counts what the SHEET holds. "My deals" is an owner filter
  // underneath, but it now has a switch of its own in plain sight, so counting
  // it here put a "1" on the badge before anyone had filtered anything.
  const filterCount = activeFilterCount({ ...filters, ownerIds: [] });
  const filtersChanged =
    filterCount > 0 || filters.ownerIds.length > 0 || !showingMine;

  /**
   * Filters live in the URL, so changing one is a navigation.
   *
   * `scroll: false` keeps your place in the list, and the transition means the
   * control stays live while the server answers instead of freezing.
   */
  function apply(next: Filters, scope?: "mine" | "all", q = query) {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (next.stages.length) p.set("stage", next.stages.join(","));
    if (next.cityIds.length) p.set("city", next.cityIds.join(","));
    if (next.vehicleTypeIds.length) p.set("vehicle", next.vehicleTypeIds.join(","));
    if (next.ownerIds.length) p.set("owner", next.ownerIds.join(","));
    const wantAll = scope ? scope === "all" : !showingMine;
    if (wantAll && !next.ownerIds.length) p.set("scope", "all");
    const qs = p.toString();
    startTransition(() => {
      setOptimisticMine(!wantAll && !next.ownerIds.length);
      router.push(qs ? `/pipeline?${qs}` : "/pipeline", { scroll: false });
    });
  }

  const setFilters = (next: Filters) => apply(next);

  /**
   * Typing waits for a pause before it asks the server.
   *
   * 300ms is long enough that a five-letter customer name is one query
   * instead of five, and short enough that it still feels like the list is
   * following you.
   */
  React.useEffect(() => {
    if (query === search) return;
    const t = setTimeout(() => apply(filters, undefined, query), 300);
    return () => clearTimeout(t);
    // `apply` closes over the current filters, which is what we want here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, search]);

  /** Horizontal swipe between stages on phones. */
  const touch = React.useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touch.current) return;
    const dx = e.changedTouches[0]!.clientX - touch.current.x;
    const dy = e.changedTouches[0]!.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setStageIndex((i) =>
      dx < 0 ? Math.min(visibleStages.length - 1, i + 1) : Math.max(0, i - 1),
    );
  }

  React.useEffect(() => {
    const el = tabsRef.current?.children[stageIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [stageIndex]);

  return (
    <div>
      {/* ------------------------------------------------ mobile controls */}
      <div className="mb-3 md:hidden">
        {searching ? (
          <div className="relative mb-2">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Customer or city"
              className="h-12 w-full rounded-2xl border border-line bg-white pl-10 pr-11 text-[16px] placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/60"
            />
            <button
              onClick={() => {
                setQuery("");
                setSearching(false);
              }}
              aria-label="Close search"
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted active:bg-canvas"
            >
              <X size={18} />
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          {/* Whose deals is the control used every time; the view is a habit
              set once, so it sits on the second row with the count. */}
          <Segmented
            label="Whose deals"
            className="min-w-0 flex-1"
            value={optimisticMine ? "mine" : "all"}
            onChange={(v) => apply({ ...filters, ownerIds: [] }, v)}
            options={[
              { value: "mine", label: "My deals" },
              { value: "all", label: "All deals" },
            ]}
          />

          {!searching ? (
            <button
              onClick={() => setSearching(true)}
              aria-label="Search deals"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-muted active:bg-canvas"
            >
              <Search size={19} />
            </button>
          ) : null}

          {/* A fixed 48px button, not a native select: a select sizes itself
              to its longest option and stretches the layout viewport. */}
          <button
            onClick={() => setFiltering(true)}
            aria-label={filterCount ? `Filter — ${filterCount} applied` : "Filter deals"}
            className={cn(
              "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border active:bg-canvas",
              filterCount
                ? "border-brand bg-brand-soft text-brand-ink"
                : "border-line bg-white text-muted",
            )}
          >
            <ListFilter size={19} />
            {filterCount ? (
              <span className="tabular absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
                {filterCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <Segmented
            label="Pipeline view"
            className="w-[164px] shrink-0"
            value={view}
            onChange={chooseView}
            options={[
              { value: "board", label: "Board" },
              { value: "list", label: "List" },
            ]}
          />
          <p className="tabular min-w-0 flex-1 truncate text-right text-[12.5px] text-muted">
            {pending ? "…" : `${filtered.length} ${filtered.length === 1 ? "deal" : "deals"}`}
            {filtersChanged ? (
              <button
                onClick={() => apply(EMPTY_FILTERS, "mine")}
                className="ml-2 font-semibold text-brand-ink underline-offset-2"
              >
                Reset
              </button>
            ) : null}
          </p>
        </div>

        {capped ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            Showing the first 250. Search covers every deal, so anything past
            this is one search away.
          </p>
        ) : null}
      </div>

      {/* ----------------------------------------------- desktop controls */}
      <div className="mb-4 hidden gap-2 md:flex">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer or city"
            className="h-11 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-[15px] placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/60"
          />
        </div>
        {/* Both desktop switches are the same control, so "whose deals" reads
            as something you press rather than as two words of label text. */}
        <Segmented
          label="Pipeline view"
          className="w-[186px] shrink-0"
          value={view}
          onChange={chooseView}
          options={[
            { value: "board", label: "Board", icon: <LayoutGrid size={16} /> },
            { value: "list", label: "Table", icon: <Rows3 size={16} /> },
          ]}
        />
        <Segmented
          label="Whose deals"
          className="w-[210px] shrink-0"
          value={optimisticMine ? "mine" : "all"}
          onChange={(v) => apply({ ...filters, ownerIds: [] }, v)}
          options={[
            { value: "mine", label: "My deals", icon: <User size={16} /> },
            { value: "all", label: "All deals", icon: <Users size={16} /> },
          ]}
        />
        <button
          onClick={() => setFiltering(true)}
          className={cn(
            "flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium",
            filterCount
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-white text-muted hover:bg-canvas",
          )}
        >
          <ListFilter size={16} />
          Filters
          {filterCount ? (
            <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
              {filterCount}
            </span>
          ) : null}
        </button>
        <a
          href="/api/export/deals"
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-medium text-muted hover:bg-canvas"
        >
          <Download size={16} /> Export
        </a>
      </div>

      {view === "list" ? (
        <PipelineList
          opportunities={filtered}
          onStageTap={setTarget}
          desktop={desktop}
        />
      ) : null}

      {/* ---------------------------------------------------- mobile board */}
      {view === "board" && !desktop ? (
        <div>
          <div
            ref={tabsRef}
            className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1"
          >
            {visibleStages.map((s, i) => {
              const count = byStage.get(s.value)?.length ?? 0;
              const active = i === stageIndex;
              return (
                <button
                  key={s.value}
                  onClick={() => setStageIndex(i)}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition",
                    active
                      ? "border-transparent bg-ink text-white"
                      : "border-line bg-white text-muted",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                  {s.label}
                  <span
                    className={cn(
                      "tabular rounded-full px-1.5 text-[11px]",
                      active ? "bg-white/20" : "bg-canvas",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <StageSummary list={activeList} stage={activeStage.value} />

          <div
            className="space-y-2.5"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {activeList.length === 0 ? (
              <EmptyState
                title={`Nothing in ${activeStage.label}`}
                body="Swipe left or right for another stage, or tap Add deal."
              />
            ) : (
              <>
                {activeList.slice(0, cardsShown).map((o) => (
                  <DealCard key={o.id} opp={o} onStageTap={setTarget} />
                ))}
                {activeList.length > cardsShown ? (
                  <button
                    onClick={() => setCardsShown((n) => n + CARD_PAGE)}
                    className="h-12 w-full rounded-2xl border border-line bg-white text-[14px] font-semibold text-brand-ink active:bg-canvas"
                  >
                    Show more
                    <span className="ml-1 font-normal text-muted">
                      ({activeList.length - cardsShown} left)
                    </span>
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* --------------------------------------------------- desktop board */}
      {view === "board" && desktop ? (
        <div>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-4">
            {visibleStages.map((s) => {
              const list = byStage.get(s.value) ?? [];
              const value = list.reduce((sum, o) => sum + o.value, 0);
              const fleet = list.reduce((sum, o) => sum + o.fleetSize, 0);
              return (
                <div
                  key={s.value}
                  className="flex w-72 shrink-0 flex-col rounded-2xl bg-canvas/80 p-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                  const id = e.dataTransfer.getData("text/opp");
                  const from = e.dataTransfer.getData("text/stage");
                  if (!id || from === s.value) return;
                  const opp = opportunities.find((o) => o.id === id);
                  if (!opp) return;
                  // The stages that ask for something get their sheet, open
                  // on that stage's form — the same as the stage button.
                  if (
                    s.value === "closed_won" ||
                    s.value === "closed_lost" ||
                    s.value === "contracting"
                  ) {
                    setTarget({
                      id: opp.id,
                      name: opp.accountName,
                      stage: opp.stage,
                      value: opp.value,
                      price: opp.price,
                      fleetSize: opp.fleetSize,
                      deploymentDate: opp.deploymentDate,
                      to: s.value,
                    });
                    return;
                  }
                  drop(opp, s.value);
                }}
                >
                  <div className="flex items-baseline justify-between px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                      <h3 className="text-sm font-semibold">{s.label}</h3>
                      <span className="tabular text-xs text-muted">{list.length}</span>
                    </div>
                    <span className="tabular text-xs font-medium text-muted">
                      {fleet ? `${fleet} veh` : ""}
                    </span>
                  </div>
                  <p className="tabular px-2 pb-2 text-xs text-muted">
                    {value ? inrCompact(value) + " / mo" : "—"}
                  </p>
                  <div className="flex flex-col gap-2">
                    {/* Bounded like the phone column: a stage with hundreds of
                        deals should not build hundreds of cards up front. */}
                    {list.slice(0, cardsShown).map((o) => (
                      <DealCard key={o.id} opp={o} onStageTap={setTarget} draggable />
                    ))}
                    {list.length > cardsShown ? (
                      <button
                        onClick={() => setCardsShown((n) => n + CARD_PAGE)}
                        className="h-10 rounded-xl border border-line bg-white text-[13px] font-semibold text-brand-ink hover:bg-canvas"
                      >
                        Show {list.length - cardsShown} more
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <PipelineFilterSheet
        open={filtering}
        onClose={() => setFiltering(false)}
        value={filters}
        onChange={setFilters}
        cities={cities.map((c) => ({ id: c.id, label: c.name }))}
        owners={owners.map((o) => ({ id: o.id, label: o.name }))}
        vehicleTypes={vehicleTypes.map((v) => ({ id: v.id, label: v.name }))}
        currentUserId={currentUserId}
        matchCount={filtered.length}
      />

      <StageChanger
        target={target}
        lostReasons={lostReasons}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}

function StageSummary({
  list,
  stage,
}: {
  list: OpportunityCard[];
  stage: SalesStage;
}) {
  const value = list.reduce((s, o) => s + o.value, 0);
  const fleet = list.reduce((s, o) => s + o.fleetSize, 0);
  if (!list.length) return null;
  const meta = STAGE_MAP[stage];
  return (
    <div
      className={cn(
        "mb-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[13px]",
        meta.chip,
      )}
    >
      <span className="tabular text-[17px] font-bold">{inrCompact(value)}</span>
      <span className="opacity-80">/ month</span>
      <span className="tabular ml-auto font-semibold">{num(fleet)} vehicles</span>
    </div>
  );
}

/**
 * The part of a deal's name that is not already on the card. Two deals for the
 * same customer in the same city are otherwise indistinguishable, which reads
 * as a duplicate row.
 */
function dealLabel(opp: OpportunityCard) {
  const name = opp.name.trim();
  if (name === opp.accountName) return "";
  const redundant = `${opp.accountName} - ${opp.city ?? ""}`.trim();
  if (name === redundant) return "";
  return name.replace(new RegExp(`^${opp.accountName}\\s*[-–·]\\s*`), "");
}

function DealCard({
  opp,
  onStageTap,
  draggable,
}: {
  opp: OpportunityCard;
  onStageTap: (t: StageTarget) => void;
  draggable?: boolean;
}) {
  const stage = STAGE_MAP[opp.stage];
  const due = daysUntil(opp.expectedCloseDate);
  const overdue = due !== null && due < 0 && stage.open;
  const soon = due !== null && due >= 0 && due <= 14 && stage.open;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/opp", opp.id);
        e.dataTransfer.setData("text/stage", opp.stage);
      }}
      className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition active:scale-[0.995]"
    >
      {/* Stage as a colour stripe: readable before a single word is. */}
      <span className={cn("absolute inset-y-0 left-0 w-1", stage.dot)} />

      <Link href={`/opportunities/${opp.id}`} className="block pl-4 pr-3.5 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold leading-tight">
              {opp.accountName}
            </p>
            <p className="mt-1 truncate text-[13px] text-muted">
              {opp.city ?? "No city"}
              {dealLabel(opp) ? ` · ${dealLabel(opp)}` : ""}
            </p>
          </div>
          {/* Per vehicle per month, like the list beside it. The deal-level
              figure is the stage column's total above and the deal page
              below; printing it on the card too put two sizes of the same
              number on one screen. */}
          <div className="shrink-0 text-right">
            <p className="tabular text-[17px] font-bold leading-tight">
              {opp.price ? inr(opp.price) : "—"}
            </p>
            <p className="text-[11px] text-muted">per veh / month</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2 py-1 font-medium text-ink">
            <Truck size={14} className="text-muted" />
            {opp.fleetSize} × {opp.vehicleType ?? "—"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Avatar name={opp.ownerName} className="h-5 w-5 text-[9px]" />
            {opp.ownerName.split(" ")[0]}
          </span>
          <span
            className={cn(
              "tabular ml-auto rounded-lg px-2 py-1 font-medium",
              overdue
                ? "bg-rose-50 text-rose-700"
                : soon
                  ? "bg-amber-50 text-amber-800"
                  : "text-muted",
            )}
          >
            {formatDate(opp.expectedCloseDate)}
          </span>
        </div>
      </Link>

      <button
        onClick={() =>
          onStageTap({
            id: opp.id,
            name: opp.accountName,
            stage: opp.stage,
            value: opp.value,
            price: opp.price,
            fleetSize: opp.fleetSize,
            deploymentDate: opp.deploymentDate,
          })
        }
        className="mt-3 flex w-full items-center justify-between border-t border-line py-3 pl-4 pr-3.5 text-left transition active:bg-canvas"
      >
        <Badge className={cn(stage.chip, "px-2.5 py-1 text-[12px]")}>
          {stage.label}
        </Badge>
        <span className="flex items-center gap-0.5 text-[13px] font-semibold text-brand-ink">
          Move stage <ChevronRight size={15} />
        </span>
      </button>
    </div>
  );
}
