import {
  executePreparation,
  recoverPreparations,
} from '../lib/material-preparation';
import { retryObjectCleanup } from '../lib/object-cleanup';
import { cleanRestoreFiles } from '../lib/project-purge';
import { processAccountDeletions } from '../lib/account-deletion';
import { executeJob, recoverAndDispatch, type JobsEnv } from '../lib/jobs';
import { executeMissionTask, recoverMissions } from '../lib/platform/execute';
import { checkWatches } from '../lib/watches';
export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
  async queue(
    batch: MessageBatch<{ id: string; kind?: 'mission' | 'preparation' }>,
    env: JobsEnv,
  ) {
    for (const message of batch.messages) {
      if (
        !message.body ||
        typeof message.body.id !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(message.body.id)
      ) {
        message.ack();
        continue;
      }
      try {
        if (message.body.kind === 'preparation')
          await executePreparation(env, message.body.id);
        else if (message.body.kind === 'mission')
          await executeMissionTask(env, message.body.id);
        else await executeJob(env, message.body.id);
        message.ack();
      } catch {
        message.retry({ delaySeconds: 60 });
      }
    }
  },
  async scheduled(_event: ScheduledController, env: JobsEnv) {
    if (env.FILES) {
      await processAccountDeletions(env.DB, env.FILES);
      await cleanRestoreFiles(env.DB, env.FILES);
      await retryObjectCleanup(env.DB, env.FILES);
    }
    await recoverAndDispatch(env);
    await checkWatches(env);
    await recoverMissions(env);
    await recoverPreparations(env);
  },
} satisfies ExportedHandler<
  JobsEnv,
  { id: string; kind?: 'mission' | 'preparation' }
>;
