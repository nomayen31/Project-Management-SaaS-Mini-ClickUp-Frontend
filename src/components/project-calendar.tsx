"use client";

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { tasksApi } from "@/lib/projects-api";

const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayFormat = new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const iso = (value: Date) => value.toISOString().slice(0, 10);
const daysAfter = (date: Date, offset: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset));

function monthStart() {
  const today = new Date();
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
}

export function ProjectCalendar({ workspaceId, projectId, taskHref }: {
  workspaceId: string; projectId: string; taskHref: (id: string) => string;
}) {
  const [month, setMonth] = useState(monthStart);
  const year = month.getUTCFullYear();
  const currentMonth = month.getUTCMonth();
  const first = daysAfter(month, -month.getUTCDay());
  const days = Array.from({ length: 42 }, (_, index) => daysAfter(first, index));
  const from = iso(first);
  const to = iso(days[41]);
  const list = useInfiniteQuery({
    queryKey: ["projects", workspaceId, projectId, "calendar", from, to],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => tasksApi.list(workspaceId, projectId, `from=${from}&to=${to}&sort=due&page=${pageParam}&limit=50`, signal),
    getNextPageParam: (page) => page.page < page.pages ? page.page + 1 : undefined,
    retry: false,
  });

  const tasks = [...new Map(list.data?.pages.flatMap((page) => page.items).map((task) => [task.id, task])).values()];
  function changeMonth(offset: number) { setMonth(new Date(Date.UTC(year, currentMonth + offset, 1))); }

  return <section className="workspace-panel" aria-label="Task calendar">
    <div className="calendar-header">
      <h2 aria-live="polite">{monthFormat.format(month)}</h2>
      <div className="workspace-actions">
        <Button onClick={() => changeMonth(-1)}>Previous month</Button>
        <Button onClick={() => setMonth(monthStart())}>Today</Button>
        <Button onClick={() => changeMonth(1)}>Next month</Button>
      </div>
    </div>
    {list.isPending && <p role="status">Loading scheduled tasks…</p>}
    {list.isError && <p role="alert">Could not load the calendar. <Button onClick={() => void list.refetch()}>Try again</Button></p>}
    {list.isSuccess && tasks.length === 0 && <p>No scheduled tasks in this date range.</p>}
    <div className="calendar-scroll" tabIndex={0} role="region" aria-label="Scrollable month grid">
      <table className="calendar-grid">
        <thead><tr>{weekday.map((name) => <th scope="col" key={name}>{name}</th>)}</tr></thead>
        <tbody>
          {Array.from({ length: 6 }, (_, week) => <tr key={iso(days[week * 7])}>
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const date = iso(day);
              const scheduled = tasks.filter((task) => {
                const start = (task.startDate ?? task.dueDate)?.slice(0, 10);
                const end = (task.dueDate ?? task.startDate)?.slice(0, 10);
                return start && end && start <= date && end >= date;
              });
              return <td key={date} data-outside={day.getUTCMonth() !== currentMonth}>
                <time dateTime={date} aria-label={dayFormat.format(day)}>{day.getUTCDate()}</time>
                {scheduled.length > 0 && <ul>{scheduled.map((task) => <li key={task.id}><Link href={taskHref(task.id)}>{task.title}</Link></li>)}</ul>}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    {list.hasNextPage && <Button disabled={list.isFetching} onClick={() => void list.fetchNextPage()}>Load more scheduled tasks</Button>}
  </section>;
}
