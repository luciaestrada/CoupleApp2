import { withSupabase } from 'npm:@supabase/server@1.5.3';
import type { Database } from '../_shared/database.types.ts';

type MaintenanceResult = {
  removedStories: number;
  removedAccounts: number;
  errors: string[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resultResponse(result: MaintenanceResult, failureStatus = 500) {
  return Response.json(result, {
    status: result.errors.length > 0 ? failureStatus : 200,
  });
}

export default {
  fetch: withSupabase<Database>(
    { auth: 'secret' },
    async (request, context) => {
      if (request.method !== 'POST') {
        return Response.json(
          { error: 'Método no permitido' },
          { status: 405, headers: { Allow: 'POST' } },
        );
      }

      const admin = context.supabaseAdmin;
      const result: MaintenanceResult = {
        removedStories: 0,
        removedAccounts: 0,
        errors: [],
      };

      try {
        const { data: expiredStories, error: storiesError } = await admin
          .from('stories')
          .select('id,image_path')
          .lte('expires_at', new Date().toISOString())
          .order('expires_at')
          .limit(100);
        if (storiesError) throw storiesError;

        const storiesToRemove = expiredStories ?? [];
        if (storiesToRemove.length > 0) {
          const paths = storiesToRemove.map((story) => story.image_path);
          const ids = storiesToRemove.map((story) => story.id);
          const { error: removeError } = await admin.storage
            .from('stories')
            .remove(paths);
          if (removeError) throw removeError;

          const { error: deleteError } = await admin
            .from('stories')
            .delete()
            .in('id', ids);
          if (deleteError) throw deleteError;
          result.removedStories = ids.length;
        }
      } catch (error) {
        result.errors.push(
          `No se pudieron limpiar las historias: ${errorMessage(error)}`,
        );
      }

      try {
        const { data: requests, error } = await admin
          .from('account_deletion_requests')
          .select('user_id')
          .limit(10);
        if (error) throw error;
        for (const account of requests ?? []) {
          const { data: stories, error: storiesError } = await admin
            .from('stories')
            .select('id,image_path')
            .eq('author_id', account.user_id)
            .limit(100);
          if (storiesError) throw storiesError;
          if (stories?.length) {
            const { error } = await admin.storage
              .from('stories')
              .remove(stories.map((row) => row.image_path));
            if (error) throw error;
            const { error: rowError } = await admin
              .from('stories')
              .delete()
              .in(
                'id',
                stories.map((row) => row.id),
              );
            if (rowError) throw rowError;
            continue;
          }
          const { data: avatars, error: avatarError } = await admin.storage
            .from('avatars')
            .list(account.user_id, { limit: 100 });
          if (avatarError) throw avatarError;
          if (avatars?.length) {
            const { error } = await admin.storage
              .from('avatars')
              .remove(avatars.map((row) => `${account.user_id}/${row.name}`));
            if (error) throw error;
            continue;
          }
          const { data: couples, error: couplesError } = await admin
            .from('couples')
            .select('id')
            .eq('created_by', account.user_id);
          if (couplesError) throw couplesError;
          let ready = true;
          for (const couple of couples ?? []) {
            const { count, error } = await admin
              .from('stories')
              .select('id', { count: 'exact', head: true })
              .eq('couple_id', couple.id);
            if (error) throw error;
            if (count) {
              ready = false;
              break;
            }
            const { count: members, error: membersError } = await admin
              .from('couple_members')
              .select('user_id', { count: 'exact', head: true })
              .eq('couple_id', couple.id);
            if (membersError) throw membersError;
            if (members) {
              ready = false;
              break;
            }
            const { error: deleteError } = await admin
              .from('couples')
              .delete()
              .eq('id', couple.id);
            if (deleteError) throw deleteError;
          }
          if (!ready) continue;
          const { error: deleteError } = await admin.auth.admin.deleteUser(
            account.user_id,
          );
          if (deleteError) throw deleteError;
          result.removedAccounts += 1;
        }
      } catch (error) {
        result.errors.push(errorMessage(error));
      }
      return resultResponse(result);
    },
  ),
};
