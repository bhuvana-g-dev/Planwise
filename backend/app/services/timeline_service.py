"""Deterministic timeline & task-dependency logic."""
from __future__ import annotations

from datetime import date, timedelta

from app.models.plan import Task, TaskStatus


def recalc_deadlines(tasks: list[Task], old_event_date: date,
                     new_event_date: date) -> list[Task]:
    """Shift each task's due date by the same delta the event date moved.

    Completed tasks are NOT moved (their work is already done). Returns new
    Task objects (does not mutate inputs).
    """
    delta = new_event_date - old_event_date
    out: list[Task] = []
    for t in tasks:
        nt = t.model_copy(deep=True)
        if t.status != TaskStatus.done and t.due_date is not None:
            nt.due_date = t.due_date + delta
        out.append(nt)
    return out


def find_overdue_tasks(tasks: list[Task], as_of: date) -> list[Task]:
    """Tasks that are not done and whose due date is before `as_of`."""
    return [
        t for t in tasks
        if t.status != TaskStatus.done
        and t.due_date is not None
        and t.due_date < as_of
    ]


def detect_dependency_conflicts(tasks: list[Task]) -> list[str]:
    """Return human-readable dependency inconsistencies.

    Rules enforced:
    - A task marked `ready`/`in_progress`/`done` must have all prerequisites done.
    - Dependencies must reference existing tasks.
    - No circular dependencies.
    - A dependent task's due date must not precede a prerequisite's due date.
    """
    conflicts: list[str] = []
    by_id = {t.id: t for t in tasks}

    for t in tasks:
        for dep in t.depends_on:
            if dep not in by_id:
                conflicts.append(f"Task '{t.name}' depends on unknown task '{dep}'")
                continue
            prereq = by_id[dep]
            if t.status in (TaskStatus.ready, TaskStatus.in_progress, TaskStatus.done) \
                    and prereq.status != TaskStatus.done:
                conflicts.append(
                    f"Task '{t.name}' is '{t.status.value}' but prerequisite "
                    f"'{prereq.name}' is not done"
                )
            if t.due_date and prereq.due_date and t.due_date < prereq.due_date:
                conflicts.append(
                    f"Task '{t.name}' is due before its prerequisite '{prereq.name}'"
                )

    conflicts.extend(_detect_cycles(by_id))
    return conflicts


def _detect_cycles(by_id: dict[str, Task]) -> list[str]:
    WHITE, GREY, BLACK = 0, 1, 2
    color = {tid: WHITE for tid in by_id}
    cycles: list[str] = []

    def visit(tid: str, stack: list[str]) -> None:
        color[tid] = GREY
        stack.append(tid)
        for dep in by_id[tid].depends_on:
            if dep not in by_id:
                continue
            if color[dep] == GREY:
                cycle = " -> ".join(stack[stack.index(dep):] + [dep])
                cycles.append(f"Circular dependency: {cycle}")
            elif color[dep] == WHITE:
                visit(dep, stack)
        stack.pop()
        color[tid] = BLACK

    for tid in by_id:
        if color[tid] == WHITE:
            visit(tid, [])
    return cycles


def recompute_task_readiness(tasks: list[Task]) -> list[Task]:
    """Set blocked/ready for not-started tasks based on prerequisite completion."""
    by_id = {t.id: t for t in tasks}
    out: list[Task] = []
    for t in tasks:
        nt = t.model_copy(deep=True)
        if nt.status in (TaskStatus.not_started, TaskStatus.blocked, TaskStatus.ready):
            prereqs_done = all(
                by_id.get(d) and by_id[d].status == TaskStatus.done
                for d in nt.depends_on
            )
            nt.status = TaskStatus.ready if prereqs_done else (
                TaskStatus.blocked if nt.depends_on else TaskStatus.ready
            )
        out.append(nt)
    return out


def default_task_offsets(event_date: date) -> dict[str, date]:
    """Reasonable default lead times before the event (used by generator)."""
    return {
        "venue": event_date - timedelta(days=30),
        "catering": event_date - timedelta(days=21),
        "decorations": event_date - timedelta(days=14),
        "invitations": event_date - timedelta(days=21),
        "activities": event_date - timedelta(days=10),
        "logistics": event_date - timedelta(days=7),
    }
