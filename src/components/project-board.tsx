"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { collaborationRefresh } from "@/lib/collaboration-api";
import { tasksApi, taskStatuses, type Task } from "@/lib/projects-api";
import { WorkspaceRequestError } from "@/lib/workspaces-api";

type Status = Task["status"];
type Move = { id: string; status: Status; beforeId: string | null };
type DropTarget = { status: Status; title?: string; index?: number; nextId?: string; moreAfter?: boolean };
const statusNames: Record<Status, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", DONE: "Done" };

type ViewProps = { workspaceId: string; projectId: string; taskHref: (id: string) => string };
type BoardProps = ViewProps & { editable: boolean };

export function ProjectBoard({ workspaceId, projectId, taskHref, editable }: BoardProps) {
  const cache = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = useMutation({
    mutationFn: (input: Move) => tasksApi.move(workspaceId, projectId, input.id, input.status, input.beforeId),
    onSettled: () => cache.invalidateQueries({ queryKey: ["projects", workspaceId, projectId] }),
  });

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!editable || move.isPending || !over || active.id === over.id) return;
    const source = active.data.current as DropTarget | undefined;
    const target = over.data.current as DropTarget | undefined;
    if (!source || !target) return;
    const movingDown = source.status === target.status && source.index !== undefined &&
      target.index !== undefined && source.index < target.index;
    if (movingDown && !target.nextId && target.moreAfter) return;
    move.mutate({
      id: String(active.id),
      status: target.status,
      beforeId: target.index === undefined ? null : movingDown ? target.nextId ?? null : String(over.id),
    });
  }

  return <section className="workspace-panel" aria-label="Kanban board">
    <h2>Board</h2>
    {move.isPending && <p role="status">Saving task position…</p>}
    {move.isError && <p role="alert">{move.error instanceof WorkspaceRequestError ? move.error.message : "The task could not be moved. Try again."}</p>}
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd} accessibility={{
      announcements: {
        onDragStart: ({ active }) => `Picked up ${active.data.current?.title ?? "task"}.`,
        onDragOver: ({ over }) => {
          const target = over?.data.current as DropTarget | undefined;
          return target ? `Over ${target.title ?? statusNames[target.status]}.` : "Outside a task column.";
        },
        onDragEnd: ({ over }) => over ? "Task dropped." : "Task was not moved.",
        onDragCancel: () => "Task move canceled.",
      },
    }}>
      <div className="board-grid">
        {taskStatuses.map((status) => <BoardColumn key={status} {...{ workspaceId, projectId, taskHref, status, editable }}
          busy={move.isPending} move={(input) => move.mutate(input)} />)}
      </div>
    </DndContext>
  </section>;
}

function BoardColumn({ workspaceId, projectId, taskHref, status, editable, busy, move }: BoardProps & {
  status: Status; busy: boolean; move: (input: Move) => void;
}) {
  const column = useDroppable({ id: `column-${status}`, data: { status }, disabled: !editable || busy });
  const list = useInfiniteQuery({
    queryKey: ["projects", workspaceId, projectId, "board", status],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => tasksApi.list(workspaceId, projectId, `sort=board&status=${status}&page=${pageParam}`, signal),
    getNextPageParam: (page) => page.page < page.pages ? page.page + 1 : undefined,
    retry: false,
    refetchInterval: collaborationRefresh,
  });
  // A move can shift tasks between pages while a refetch runs.
  const items = [...new Map(list.data?.pages.flatMap((page) => page.items).map((task) => [task.id, task])).values()];

  return <section ref={column.setNodeRef} className="board-column" data-over={column.isOver} aria-label={statusNames[status]}>
    <h3><span className="board-status" data-status={status} />{statusNames[status]}{list.data && <span className="board-count">{list.data.pages[0].total}</span>}</h3>
    {list.isPending && <p role="status">Loading tasks…</p>}
    {list.isError && <Button onClick={() => void list.refetch()}>Retry loading {statusNames[status]}</Button>}
    {list.isSuccess && items.length === 0 && <p className="board-empty">No tasks</p>}
    <SortableContext items={items.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
      <ul className="board-cards">
        {items.map((task, index) => <BoardCard key={task.id} task={task} index={index} nextId={items[index + 1]?.id} moreAfter={list.hasNextPage}
          href={taskHref(task.id)} editable={editable} busy={busy}
          move={move} upId={items[index - 1]?.id}
          downId={items[index + 1] && (!list.hasNextPage || items[index + 2]) ? items[index + 2]?.id ?? null : undefined} />)}
      </ul>
    </SortableContext>
    {list.hasNextPage && <Button disabled={list.isFetching} onClick={() => void list.fetchNextPage()}>Load more</Button>}
  </section>;
}

function BoardCard({ task, index, nextId, moreAfter, href, editable, busy, move, upId, downId }: {
  task: Task; index: number; nextId?: string; moreAfter: boolean; href: string; editable: boolean; busy: boolean;
  move: (input: Move) => void; upId?: string; downId?: string | null;
}) {
  const sortable = useSortable({
    id: task.id, data: { status: task.status, title: task.title, index, nextId, moreAfter }, disabled: { draggable: !editable || busy, droppable: !editable || busy },
  });
  const completed = task.subtasks.filter(({ completed }) => completed).length;

  return <li ref={sortable.setNodeRef} className="board-card" data-dragging={sortable.isDragging}
    style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}>
    <div className="board-card-heading">
      <Link href={href}>{task.title}</Link>
      {editable && <button type="button" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners}
        className="board-handle" aria-label={`Drag ${task.title}`} disabled={busy}><GripVertical size={16} /></button>}
    </div>
    <div className="board-meta"><span className="board-priority" data-priority={task.priority}>{task.priority.toLowerCase()}</span>
      {task.dueDate && <time dateTime={task.dueDate.slice(0, 10)}>Due {task.dueDate.slice(0, 10)}</time>}
      {task.subtasks.length > 0 && <span>{completed}/{task.subtasks.length} subtasks</span>}
    </div>
    {task.labels.length > 0 && <ul className="board-meta" aria-label="Labels">{task.labels.map((label) => <li className="workspace-role" key={label}>{label}</li>)}</ul>}
    {task.participants.length > 0 && <p className="board-people">{task.participants.map(({ user }) => user.name).join(", ")}</p>}
    {editable && <div className="board-actions">
      <select aria-label={`Move ${task.title} to column`} value={task.status} disabled={busy} onChange={(event) => {
        move({ id: task.id, status: event.target.value as Status, beforeId: null });
      }}>{taskStatuses.map((status) => <option key={status} value={status}>{statusNames[status]}</option>)}</select>
      <button type="button" aria-label={`Move ${task.title} up`} disabled={busy || !upId}
        onClick={() => { if (upId) move({ id: task.id, status: task.status, beforeId: upId }); }}><ArrowUp size={15} /></button>
      <button type="button" aria-label={`Move ${task.title} down`} disabled={busy || downId === undefined}
        onClick={() => { if (downId !== undefined) move({ id: task.id, status: task.status, beforeId: downId }); }}><ArrowDown size={15} /></button>
    </div>}
  </li>;
}
