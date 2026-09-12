"use client";

import { ChevronDown, LayoutGrid, Rows3, Search, Truck, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PipelineTable } from "@/components/pipeline/table";
import { StageChanger, type StageTarget } from "@/components/stage-changer";
import { Badge, EmptyState, Select } from "@/components/ui";
import type { SalesStage } from "@/db/schema";
import { STAGES, STAGE_MAP } from "@/lib/constants";
import { cn, formatDate, daysUntil, inrCompact, num } from "@/lib/utils";
import { changeStage } from "@/server/actions";
import type { OpportunityCard } from "@/server/queries";

const VIEW_KEY = "moeving:pipeline-view";

type Props = {
  opportunities: OpportunityCard[];
  lostReasons: { id: string; label: string }[];
  owners: { id: string; name: string }[];
  currentUserId: string;
};

export function PipelineBoard({
  opportunities,
  lostReasons,
  owners,
  currentUserId,
}: Props) {
  const [stageIndex, setStageIndex] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const [owner, setOwner] = React.useState("all");
  const [target, setTarget] = React.useState<StageTarget | null>(null);
  const [view, setView] = React.useState<"board" | "table">("board");
  const tabsRef = React.useRef<HTMLDivElement>(null);

  // The chosen view is a per-person habit, so it survives a reload.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "table" || saved === "board") setView(saved);
    } catch {
      /* private mode — the default is fine */
    }
  }, []);

  function chooseView(next: "board" | "table") {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignored */
    }
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return opportunities.filter((o) => {
      if (owner === "mine" && o.ownerId !== currentUserId) return false;
      if (owner !== "all" && owner !== "mine" && o.ownerId !== owner) return false;
      if (!q) return true;
      return (
        o.accountName.toLowerCase().includes(q) ||
        o.name.toLowerCase().includes(q) ||
        (o.city ?? "").toLowerCase().includes(q)
      );
    });
  }, [opportunities, query, owner, currentUserId]);

  const byStage = React.useMemo(() => {
    const map = new Map<SalesStage, OpportunityCard[]>();
    for (const s of STAGES) map.set(s.value, []);
    for (const o of filtered) map.get(o.stage)?.push(o);
    return map;
  }, [filtered]);

  const activeStage = STAGES[stageIndex]!;
  const activeList = byStage.get(activeStage.value) ?? [];

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
      dx < 0 ? Math.min(STAGES.length - 1, i + 1) : Math.max(0, i - 1),
    );
  }

  React.useEffect(() => {
    const el = tabsRef.current?.children[stageIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [stageIndex]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer or city"
            className="h-11 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-[15px] placeholder:text-muted/70 focus:border-brand focus:outline-none"
          />
        </div>
        <div className="flex h-11 shrink-0 rounded-xl border border-line bg-white p-1">
          {([
            ["board", LayoutGrid, "Board"],
            ["table", Rows3, "Table"],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => chooseView(key)}
              aria-label={`${label} view`}
              aria-pressed={view === key}
              title={`${label} view`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition",
                view === key ? "bg-ink text-white" : "text-muted",
              )}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <Select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="h-11 w-36 shrink-0"
        >
          <option value="all">Everyone</option>
          <option value="mine">My deals</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </div>

      {view === "table" ? (
        <PipelineTable opportunities={filtered} onStageTap={setTarget} />
      ) : null}

      {/* ---------------------------------------------------------- mobile */}
      <div className={cn("md:hidden", view === "table" && "hidden")}>
        <div
          ref={tabsRef}
          className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {STAGES.map((s, i) => {
            const count = byStage.get(s.value)?.length ?? 0;
            const active = i === stageIndex;
            return (
              <button
                key={s.value}
                onClick={() => setStageIndex(i)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition",
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-muted",
                )}
              >
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

        <StageSummary list={activeList} />

        <div
          className="space-y-2.5"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {activeList.length === 0 ? (
            <EmptyState
              title={`Nothing in ${activeStage.label}`}
              body="Swipe left or right to see another stage, or tap + to add a deal."
            />
          ) : (
            activeList.map((o) => (
              <DealCard key={o.id} opp={o} onStageTap={setTarget} />
            ))
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- desktop */}
      <div className={cn("hidden md:block", view === "table" && "md:hidden")}>
        <div className="no-scrollbar flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((s) => {
            const list = byStage.get(s.value) ?? [];
            const value = list.reduce((sum, o) => sum + o.value, 0);
            const fleet = list.reduce((sum, o) => sum + o.fleetSize, 0);
            return (
              <div
                key={s.value}
                className="flex w-72 shrink-0 flex-col rounded-2xl bg-canvas/80 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  const id = e.dataTransfer.getData("text/opp");
                  const from = e.dataTransfer.getData("text/stage");
                  if (!id || from === s.value) return;
                  const opp = opportunities.find((o) => o.id === id);
                  if (!opp) return;
                  if (s.value === "closed_won" || s.value === "closed_lost") {
                    setTarget({
                      id: opp.id,
                      name: opp.accountName,
                      stage: opp.stage,
                      value: opp.value,
                    });
                    return;
                  }
                  await changeStage(id, s.value);
                  window.location.reload();
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
                <p className="px-2 pb-2 tabular text-xs text-muted">
                  {value ? inrCompact(value) + " / mo" : "—"}
                </p>
                <div className="flex flex-col gap-2">
                  {list.map((o) => (
                    <DealCard
                      key={o.id}
                      opp={o}
                      onStageTap={setTarget}
                      draggable
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <StageChanger
        target={target}
        lostReasons={lostReasons}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}

function StageSummary({ list }: { list: OpportunityCard[] }) {
  const value = list.reduce((s, o) => s + o.value, 0);
  const fleet = list.reduce((s, o) => s + o.fleetSize, 0);
  if (!list.length) return null;
  return (
    <div className="mb-3 flex items-center gap-4 px-1 text-sm">
      <span className="tabular font-semibold">{inrCompact(value)}</span>
      <span className="text-muted">/ month</span>
      <span className="ml-auto tabular text-muted">{num(fleet)} vehicles</span>
    </div>
  );
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

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/opp", opp.id);
        e.dataTransfer.setData("text/stage", opp.stage);
      }}
      className="rounded-[14px] border border-line bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition active:scale-[0.995]"
    >
      <Link href={`/opportunities/${opp.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight">
              {opp.accountName}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              {opp.city ?? "No city"}
              {opp.name !== opp.accountName ? ` · ${opp.name}` : ""}
            </p>
          </div>
          <p className="tabular shrink-0 text-[15px] font-semibold">
            {opp.value ? inrCompact(opp.value) : "—"}
          </p>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Truck size={14} /> {opp.fleetSize} × {opp.vehicleType ?? "—"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users size={14} /> {opp.ownerName.split(" ")[0]}
          </span>
          <span className={cn("ml-auto tabular", overdue && "text-rose-600 font-medium")}>
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
          })
        }
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-line px-2.5 py-2 transition active:bg-canvas"
      >
        <Badge className={stage.chip}>{stage.label}</Badge>
        <span className="flex items-center gap-1 text-[12px] font-medium text-muted">
          Move <ChevronDown size={14} />
        </span>
      </button>
    </div>
  );
}
