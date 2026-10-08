import { withSupabase } from 'npm:@supabase/server@1.5.3';
import type { Database } from '../_shared/database.types.ts';

type MaintenanceResult = {
  removedStories: number;
  removedAccounts: number;
  removedMedia: number;
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
        removedMedia: 0,
        errors: [],
      };

      try {
        const { error: checkinError } = await admin.from('daily_checkins').delete()
          .lte('expires_at', new Date().toISOString());
        if (checkinError) throw checkinError;
      } catch (error) {
        result.errors.push(`No se pudieron limpiar los check-ins: ${errorMessage(error)}`);
      }
      try {
        const { data: count, error } = await admin.rpc('claim_story_cleanup', { p_limit: 100 });
        if (error) throw error;
        result.removedStories = count ?? 0;
      } catch (error) { result.errors.push(errorMessage(error)); }
      try {
        const { data: abandoned, error: loadError } = await admin.from('media_assets')
          .select('id').neq('purpose', 'story').is('published_at', null).lte('expires_at', new Date().toISOString()).limit(100);
        if (loadError) throw loadError;
        if (abandoned?.length) {
          const { error } = await admin.from('media_assets').delete().in('id', abandoned.map(row => row.id))
            .is('published_at', null).lte('expires_at', new Date().toISOString());
          if (error) throw error;
        }
        const { data: jobs, error: jobsError } = await admin.from('media_deletions')
          .select('id,bucket_id,object_path').order('id').limit(100);
        if (jobsError) throw jobsError;
        for (const job of jobs ?? []) {
          try {
          const { error } = await admin.storage.from(job.bucket_id).remove([job.object_path]);
          if (error) throw error;
          const { error: deleteError } = await admin.from('media_deletions').delete().eq('id', job.id);
          if (deleteError) throw deleteError;
          result.removedMedia += 1;
          } catch (error) { result.errors.push(`Archivo ${job.id}: ${errorMessage(error)}`); }
        }
      } catch (error) {
        result.errors.push(`No se pudieron limpiar los archivos compartidos: ${errorMessage(error)}`);
      }

      try {
        const { data: requests, error } = await admin
          .from('account_deletion_requests')
          .select('user_id')
          .limit(10);
        if (error) throw error;
        for (const account of requests ?? []) {
          // Remove references first; the SQL trigger queues Storage work durably.
          const { data: stories, error: storiesError } = await admin.from('stories')
            .select('id').eq('author_id', account.user_id).limit(100);
          if (storiesError) throw storiesError;
          if (stories?.length) {
            const { error } = await admin.from('stories').delete().in('id', stories.map(row => row.id));
            if (error) throw error;
            continue;
          }
          const { data: assets, error: assetsError } = await admin.from('media_assets')
            .select('id').eq('author_id', account.user_id).limit(100);
          if (assetsError) throw assetsError;
          if (assets?.length) {
            const { error } = await admin.from('media_assets').delete().in('id', assets.map(row => row.id));
            if (error) throw error;
            continue;
          }
          const { count: pendingMedia, error: pendingError } = await admin.from('media_deletions')
            .select('id', { count: 'exact', head: true }).eq('author_id', account.user_id);
          if (pendingError) throw pendingError;
          if (pendingMedia) continue;
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
