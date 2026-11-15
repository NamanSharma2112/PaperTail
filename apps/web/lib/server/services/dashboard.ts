import "server-only";
import type { Db } from "../db";
import { one, rows } from "./common";
import { recentActivity } from "./records";

export async function dashboard(db: Db, userId: string) {
  const totals = await one<Record<string, number>>(
    db,
    `select
       (select count(*)::int from papers where created_by = $1) as papers,
       (select count(*)::int from projects where status in ('planning','in_progress','blocked')) as active_projects,
       (select count(*)::int from projects) as projects,
       (select count(*)::int from experiment_runs) as runs,
       (select count(*)::int from experiment_runs where status = 'completed') as completed_runs,
       (select count(*)::int from experiment_runs where status = 'failed') as failed_runs,
       (select count(*)::int from discrepancies where resolution_status in ('open','investigating')) as open_discrepancies`,
    [userId],
  );
  // Projects that need a look, with the reason. Real conditions only.
  const attention = await rows<{ id: string; title: string; reason: string }>(
    db,
    `select id, title, reason from (
       select p.id, p.title, 'Has failed runs since the last completed one' as reason, 1 as pri from projects p
        where exists (select 1 from experiment_runs r where r.project_id = p.id and r.status = 'failed'
                        and r.created_at > coalesce((select max(created_at) from experiment_runs c where c.project_id = p.id and c.status = 'completed'), 'epoch'))
       union all
       select p.id, p.title, 'High-severity discrepancy still open', 2 from projects p
        where exists (select 1 from discrepancies d where d.project_id = p.id and d.severity in ('high','critical') and d.resolution_status in ('open','investigating'))
       union all
       select p.id, p.title, 'Runs recorded but no published result to compare with', 3 from projects p
        where exists (select 1 from experiment_runs r where r.project_id = p.id) and not exists (select 1 from reported_metrics m where m.project_id = p.id)
       union all
       select p.id, p.title, 'Running for more than 24 hours', 4 from projects p
        where exists (select 1 from experiment_runs r where r.project_id = p.id and r.status = 'running' and r.started_at < now() - interval '24 hours')
     ) x order by pri limit 8`,
  );
  const recentRuns = await rows(
    db,
    `select r.id, r.name, r.status, r.run_group, r.project_id, p.title as project_title, coalesce(r.completed_at, r.started_at, r.created_at) as at
       from experiment_runs r join projects p on p.id = r.project_id order by coalesce(r.completed_at, r.started_at, r.created_at) desc limit 8`,
  );
  return { totals, attention, recentRuns, activity: await recentActivity(db, undefined, 12) };
}
