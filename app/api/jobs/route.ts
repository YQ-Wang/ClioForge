import { z } from 'zod';
import { authenticate, failure, jsonBody, HttpError } from '@/lib/server';
import { jobInput } from '@/lib/workbench-inputs';
import { createJob, controlJob, dispatchJob, jobById } from '@/lib/jobs';
const control = z.object({
  action: z.enum(['pause', 'resume', 'cancel', 'retry']),
  id: z.uuid(),
  new_id: z.uuid().optional(),
});
export async function POST(request: Request) {
  try {
    const { store, settings } = await authenticate(request);
    if (!settings.JOB_QUEUE) throw new HttpError(503, '后台队列尚未配置。');
    const raw = await jsonBody(request);
    let job;
    if ('action' in raw) {
      const input = control.parse(raw);
      if (input.action === 'retry') {
        const previous = await jobById(store.db, input.id, store.owner);
        if (
          !previous ||
          !['failed', 'uncertain'].includes(previous.status) ||
          !input.new_id
        )
          throw new HttpError(409, '只能为失败或未确认的任务新建重试。');
        job = await createJob(store, {
          ...previous,
          effort: previous.model_snapshot.effort,
          id: input.new_id,
        });
      } else job = await controlJob(store, input.id, input.action);
    } else job = await createJob(store, jobInput.parse(raw));
    if (job?.status === 'queued') {
      try {
        await dispatchJob(settings, job.id);
      } catch {
        return Response.json(
          { job, notice: '任务已持久保存，正在等待调度器重新投递。' },
          { status: 202 },
        );
      }
    }
    return Response.json({ job }, { status: 202 });
  } catch (error) {
    return failure(error);
  }
}
