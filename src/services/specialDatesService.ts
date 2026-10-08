import { supabase } from '../supabase/client';
import { watchQuery } from './realtimeService';
import { nextSpecialDate } from '../utils/specialDateUtils';
import { clearLocalReminders, syncLocalNotifications } from './localNotificationSync';

export function watchSpecialDates(coupleId, handlers) {
  return watchQuery({
    channelName: `special-dates-${coupleId}`,
    table: 'special_dates',
    filter: `couple_id=eq.${coupleId}`,
    async load() {
      const { data, error } = await supabase
        .from('special_dates')
        .select('id,title,date,recurring,notify_days_before,created_at')
        .eq('couple_id', coupleId)
        .order('date', { ascending: true });
      if (error) throw error;
      return data
        .map((specialDate) => ({
          ...specialDate,
          nextOccurrence: nextSpecialDate(specialDate.date, specialDate.recurring),
        }))
        .sort((left, right) => left.nextOccurrence.getTime() - right.nextOccurrence.getTime());
    },
    ...handlers,
  });
}

export async function createSpecialDate({ title, date, recurring, notifyDaysBefore }) {
  const { error } = await supabase.rpc('create_special_date', {
    p_title: title.trim(),
    p_date: date,
    p_recurring: recurring,
    p_notify_days_before: notifyDaysBefore,
  });
  if (error) throw error;
  void syncLocalNotifications().catch(() => {});
}

export async function deleteSpecialDate(dateId) {
  const { error } = await supabase.rpc('delete_special_date', { p_date_id: dateId });
  if (error) throw error;
  await clearLocalReminders();
  void syncLocalNotifications().catch(() => {});
}
