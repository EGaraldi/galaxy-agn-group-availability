import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

/**
 * Group Availability Calendar (starter)
 * - Google-Calendar-like month grid
 * - Left rail = people list with multi-select
 * - Only selected people appear in the calendar rows
 * - Each person can be marked Available / Unavailable per day
 * - Simple shared password gate (client-side)
 *
 * Notes:
 * - This starter is front-end only and uses localStorage.
 * - Password gate is client-side: it blocks casual access but is not secure against a determined user.
 */

// --- Utilities ---
const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Monday-first grid (like many work calendars)
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const mondayFirstDow = (d: Date) => {
  const js = d.getDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // 0=Mon..6=Sun
};

// --- Storage ---
const LS_KEY = "group-availability.v1";
function loadState(): any | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveState(state: any) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

// --- Demo data ---
type Person = { id: string; name: string; color: string };

/**
 * Availability model:
 * availability[personId][YYYY-MM-DD] = true|false
 * (true = available, false = unavailable)
 * Default when missing = AVAILABLE
 */

type Availability = Record<string, Record<string, boolean>>;

type Status = "available" | "unavailable";

function getStatusFromAvailability(availability: Availability, personId: string, dateStr: string): Status {
  const per = availability?.[personId];
  if (!per || !(dateStr in per)) return "available";
  return per[dateStr] === true ? "available" : "unavailable";
}

function setStatusInAvailability(availability: Availability, personId: string, dateStr: string, nextStatus: Status): Availability {
  const next: Availability = { ...(availability || {}) };
  const per = { ...(next[personId] || {}) };
  per[dateStr] = nextStatus === "available";
  next[personId] = per;
  return next;
}

// --- Lightweight self-tests (run once in dev) ---
// NOTE: No Node-specific globals (like `process`) are used so this runs cleanly in browser builds.
function runSelfTests() {
  // Only run in non-production to avoid noise.
  // In Vite, environment mode is available via import.meta.env.MODE.
  // (Avoid using Node's `process` in browser TS builds.)
  const mode = (import.meta as any).env?.MODE as string | undefined;
  if (mode === "production") return;

  let a: Availability = {};
  console.assert(getStatusFromAvailability(a, "p1", "2026-02-01") === "available", "Default status should be available");

  a = setStatusInAvailability(a, "p1", "2026-02-01", "unavailable");
  console.assert(getStatusFromAvailability(a, "p1", "2026-02-01") === "unavailable", "Status should be unavailable after setting");

  a = setStatusInAvailability(a, "p1", "2026-02-02", "available");
  console.assert(getStatusFromAvailability(a, "p1", "2026-02-02") === "available", "Explicit available should be available");

  a = setStatusInAvailability(a, "p1", "2026-02-01", "available");
  console.assert(getStatusFromAvailability(a, "p1", "2026-02-01") === "available", "Status should be available after toggling back");

  console.assert(getStatusFromAvailability(a, "p2", "2026-02-01") === "available", "Other people default to available");
}

runSelfTests();

// --- Password gate (shared password for everyone) ---
// IMPORTANT: client-side only. For real protection, use server-side auth / basic auth.
const APP_PASSWORD = "changeme"; // TODO: change this.
const UNLOCK_KEY = `${LS_KEY}.unlocked`;

function PasswordGate({ children }: { children: React.ReactNode }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return localStorage.getItem(UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === APP_PASSWORD) {
      setUnlocked(true);
      setError(null);
      try {
        localStorage.setItem(UNLOCK_KEY, "1");
      } catch {
        // ignore
      }
      return;
    }
    setError("Incorrect password");
  };

  const lock = () => {
    setUnlocked(false);
    setPw("");
    setError(null);
    try {
      localStorage.removeItem(UNLOCK_KEY);
    } catch {
      // ignore
    }
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#f6f8fc] text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6">
          <div className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="text-lg font-semibold tracking-tight">Group Availability</div>
            <div className="mt-1 text-sm text-slate-600">Enter the shared password to access the calendar.</div>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="w-full rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Password"
                autoFocus
              />
              {error ? <div className="text-sm text-rose-600">{error}</div> : null}
              <button
                type="submit"
                className="w-full rounded-xl bg-[#1a73e8] px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                Unlock
              </button>
            </form>
            <div className="mt-4 text-xs text-slate-500">
              Note: this is simple client-side protection. It prevents casual access but is not secure against a determined user.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={lock}
          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-black/5 hover:bg-slate-50"
          title="Lock this device"
        >
          Lock
        </button>
      </div>
      {children}
    </>
  );
}

export default function GroupAvailabilityCalendar() {
  const [today] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  // App state
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [availability, setAvailability] = useState<Availability>({});
  const [currentUserId, setCurrentUserId] = useState("");
  
  type ShowMode = "all" | "none" | "onlyUnavailable";
  const [showMode, setShowMode] = useState<ShowMode>("all");


  // Load persisted UI prefs (NOT shared availability)
  useEffect(() => {
    const saved = loadState();
    if (!saved) return;
  
    if (Array.isArray(saved.selected)) setSelectedIds(new Set(saved.selected));
    if (saved.currentUserId) setCurrentUserId(saved.currentUserId);
  
    if (saved.cursor) {
      const d = new Date(saved.cursor);
      if (!Number.isNaN(d.getTime())) setCursor(startOfMonth(d));
    }
  
    // Cleanup legacy fields from older versions (optional but recommended)
    if ("availability" in saved || "people" in saved) {
      const { availability, people, ...rest } = saved;
      saveState(rest);
    }
  }, []);
  
  // Persist UI prefs only (NOT shared availability)
  useEffect(() => {
    saveState({
      selected: Array.from(selectedIds),
      currentUserId,
      cursor: cursor.toISOString(),
    });
  }, [selectedIds, currentUserId, cursor]);

  useEffect(() => {
    const loadPeople = async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id,name,color")
        .order("name", { ascending: true });
  
      if (error) {
        console.error("Failed to load people", error);
        return;
      }
      if (!data || data.length === 0) return;
  
      setPeople(data);
  
      // Keep selections sane if ids changed
      setSelectedIds((prev) => {
        if (prev.size) return prev; // keep user's filter if they already set it
        return new Set(data.map((p) => p.id)); // otherwise default: select all
      });
      
      setCurrentUserId((prev) =>
        data.some((p) => p.id === prev) ? prev : ""
      );
    };
  
    loadPeople();
  }, []);


  const selectedPeople = useMemo(() => people.filter((p) => selectedIds.has(p.id)), [people, selectedIds]);

  const monthLabel = useMemo(() => cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }), [cursor]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);

    // Build a 6-week grid (42 cells), Monday-first
    const firstCell = addDays(start, -mondayFirstDow(start));
    const cells: { date: Date; inMonth: boolean; isToday: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(firstCell, i);
      cells.push({
        date: d,
        inMonth: d.getMonth() === cursor.getMonth(),
        isToday: sameDay(d, today),
      });
    }

    return { start, end, cells };
  }, [cursor, today]);

  const refreshAvailability = React.useCallback(async () => {
    const cells = monthDays.cells;
    if (!cells.length) return;
  
    const startISO = isoDate(cells[0].date);
    const endISO = isoDate(cells[cells.length - 1].date);
  
    const { data, error } = await supabase
      .from("availability")
      .select("person_id, day, available")
      .gte("day", startISO)
      .lte("day", endISO);
  
    if (error) {
      console.error("Failed to load availability", error);
      return;
    }
  
    const next: Availability = {};
    for (const row of data ?? []) {
      const pid = String(row.person_id);
      const dayStr = String(row.day);
      if (!next[pid]) next[pid] = {};
      next[pid][dayStr] = Boolean(row.available);
    }
  
    setAvailability(next);
  }, [monthDays]);

  useEffect(() => {
    refreshAvailability();
  }, [refreshAvailability]);

  useEffect(() => {
    const channel = supabase
      .channel("availability-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability" },
        (payload) => {
          const row = payload.new as any;
          if (!row?.person_id || !row?.day) return;

          const personId = String(row.person_id);
          const dayStr = String(row.day);
          const nextStatus: Status = row.available ? "available" : "unavailable";

          setAvailability((prev) =>
            setStatusInAvailability(prev, personId, dayStr, nextStatus)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);  // run once on mount

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshAvailability();
    }, 10_000); // every 10s
    return () => window.clearInterval(id);
  }, [refreshAvailability]);

  const toggleSelect = (personId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const getStatus = (personId: string, dateStr: string): Status => getStatusFromAvailability(availability, personId, dateStr);

  const setStatus = async (personId: string, dateStr: string, nextStatus: Status) => {
    // Optimistic UI update
    setAvailability((prev) => setStatusInAvailability(prev, personId, dateStr, nextStatus));
  
    const { error } = await supabase.from("availability").upsert({
      person_id: personId,
      day: dateStr,
      available: nextStatus === "available",
    });
  
    if (error) {
      console.error("Failed to save availability", error);
      // Optional: reload to revert optimistic state
      await refreshAvailability();
      return;
    }
  
    // Ensure state matches DB (important if multiple users update)
    await refreshAvailability();
  };
  

  // Click a calendar cell to toggle status for the CURRENT USER only.
  // toggle: available <-> unavailable
  const onDayClick = async (dateObj: Date) => {
    if (!currentUserId) return;
    const dStr = isoDate(dateObj);
    const cur = getStatus(currentUserId, dStr);
    const next: Status = cur === "available" ? "unavailable" : "available";
    await setStatus(currentUserId, dStr, next);
  };

  const prevMonth = () => setCursor((c) => startOfMonth(new Date(c.getFullYear(), c.getMonth() - 1, 1)));
  const nextMonth = () => setCursor((c) => startOfMonth(new Date(c.getFullYear(), c.getMonth() + 1, 1)));
  const goToday = () => setCursor(startOfMonth(new Date()));

  return (
    <PasswordGate>
      <div className="min-h-screen bg-[#f6f8fc] text-slate-900">
        <div className="mx-auto max-w-[1400px] p-4">
          {/* Top bar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 hover:bg-slate-50"
                onClick={goToday}
              >
                Today
              </button>
              <button
                className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 hover:bg-slate-50"
                onClick={prevMonth}
                aria-label="Previous month"
              >
                ◀
              </button>
              <button
                className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 hover:bg-slate-50"
                onClick={nextMonth}
                aria-label="Next month"
              >
                ▶
              </button>
              <div className="ml-2 text-xl font-semibold tracking-tight">{monthLabel}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
                <label className="mr-2 text-xs font-medium text-slate-600">I am</label>
                <select
                  disabled={!people.length}
                  value={currentUserId}
                  onChange={(e) => setCurrentUserId(e.target.value)}
                  className="rounded-lg bg-slate-50 px-2 py-1 text-sm ring-1 ring-black/5"
                >
                  <option value="">-- Select yourself --</option>
                
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 text-sm text-slate-600">
                Click a day to toggle <span className="font-semibold">your</span> status: available ⇄ unavailable
              </div>
            </div>
          </div>

          {/* Main layout */}
          <div className="grid gap-4 md:grid-cols-[260px_1fr]">
            {/* Left rail: people */}
            <div>
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 min-h-[44px]">
                  <div className="min-w-0 text-sm font-semibold">Show</div>

                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 hover:bg-slate-50"
                      onClick={() => {
                        setShowMode("all");
                        setSelectedIds(new Set(people.map((p) => p.id)));
                      }}
                    >
                      All
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowMode("onlyUnavailable");

                        const idsWithUnavailable = new Set<string>();

                        for (const p of people) {
                          for (const cell of monthDays.cells) {
                            const dStr = isoDate(cell.date);
                            if (getStatus(p.id, dStr) === "unavailable") {
                              idsWithUnavailable.add(p.id);
                              break; // no need to check more days for this person
                            }
                          }
                        }

                        setSelectedIds(idsWithUnavailable);
                      }}
                    >
                      Unavailable
                    </button>

                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 hover:bg-slate-50"
                      onClick={() => {
                        setShowMode("none");
                        setSelectedIds(new Set());
                      }}
                    >
                      None
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100" />
                <div className="max-h-[70vh] overflow-auto p-2">
                  {people.map((p) => {
                    const checked = selectedIds.has(p.id);
                    const isMe = p.id === currentUserId;
                    return (
                    <label
                      key={p.id}
                      className={`grid grid-cols-[1fr_24px] items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 ${
                        isMe ? "bg-slate-50" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-3 rounded-full" style={{ background: p.color }} aria-hidden />
                          <div className="min-w-0 leading-tight">
                            <div className="truncate text-sm font-medium">
                              {p.name} {isMe ? <span className="text-xs text-slate-500">(you)</span> : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Fixed-width checkbox column */}
                      <div className="flex w-[24px] items-center justify-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(p.id)}
                          className="m-0 h-4 w-4"
                        />
                      </div>
                    </label>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="text-sm font-semibold">Legend</div>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
                    Available
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full bg-rose-500" />
                    Unavailable
                  </div>
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div>
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                {/* Weekday header */}
                <div className="grid grid-cols-7 border-b border-slate-100">
                  {weekdayLabels.map((w) => (
                    <div key={w} className="px-3 py-2 text-xs font-semibold text-slate-600">
                      {w}
                    </div>
                  ))}
                </div>

                {/* Month grid */}
                <div className="grid grid-cols-7">
                  {monthDays.cells.map((cell, idx) => {
                    const dStr = isoDate(cell.date);
                    return (
                      <button
                        key={`${dStr}-${idx}`}
                        onClick={() => onDayClick(cell.date)}
                        disabled={!currentUserId}
                        className={`relative min-h-[120px] border-b border-r border-slate-100 px-2 pb-2 pt-2 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-black/10 ${
                          idx % 7 === 6 ? "border-r-0" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                              cell.isToday ? "bg-[#1a73e8] text-white" : "text-slate-700"
                            } ${cell.inMonth ? "" : "opacity-40"}`}
                            title={dStr}
                          >
                            {cell.date.getDate()}
                          </div>
                        </div>

                        {/* Selected people rows */}
                        <div className="mt-2 space-y-1">
                          {(() => {
                            let peopleToRender: Person[] = [];

                            if (showMode === "none") {
                              peopleToRender = [];
                            } else if (showMode === "all") {
                              peopleToRender = selectedPeople;
                            } else if (showMode === "onlyUnavailable") {
                              peopleToRender = selectedPeople.filter((p) => {
                                const st = getStatus(p.id, dStr);
                                return st === "unavailable";
                              });
                            }

                            if (peopleToRender.length === 0) {
                              return (
                                <div className="text-xs text-slate-400">
                                  {showMode === "all" ? "No people selected" : ""}
                                </div>
                              );
                            }

                            return peopleToRender.map((p) => {
                              const st = getStatus(p.id, dStr);
                              const dot = st === "available" ? "bg-emerald-500" : "bg-rose-500";
                              const isMe = p.id === currentUserId;

                              return (
                                <div key={p.id} className="flex items-center gap-2">
                                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                                  <span
                                    className={`truncate text-xs ${cell.inMonth ? "" : "opacity-60"} ${
                                      isMe ? "font-semibold" : ""
                                    }`}
                                    style={{ color: p.color }}
                                    title={p.name}
                                  >
                                    {p.name}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>

                        {!cell.inMonth && <div className="pointer-events-none absolute inset-0 bg-white/50" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer help */}
              <div className="text-sm">Copyright: Enrico Garaldi, 2026</div>
            </div>
          </div>
        </div>
      </div>
    </PasswordGate>
  );
}

