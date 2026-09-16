begin;
create or replace function public.send_affection(p_couple_id uuid,p_client_id uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d date:=(now() at time zone 'Europe/Madrid')::date; member public.couple_members; event_id uuid; previous public.messages; symbol text;
begin
  if p_kind is null or p_kind not in ('love','kiss','hug','miss_you') then raise exception 'Gesto no válido' using errcode='22023'; end if;
  select * into member from public.couple_members where couple_id=p_couple_id and user_id=auth.uid() for update;
  if member.user_id is null or not public.is_complete_couple(p_couple_id) or p_client_id is null then raise exception 'Pareja no disponible' using errcode='42501'; end if;
  select * into previous from public.messages where sender_id=auth.uid() and client_id=p_client_id;
  if previous.id is not null then
    if previous.couple_id<>p_couple_id or previous.type<>'love' or coalesce(previous.metadata->>'affection','love')<>p_kind then
      raise exception 'Identificador utilizado para otra acción' using errcode='22023';
    end if;
    return jsonb_build_object('sentNow',false,'sentToday',member.last_love_date=d,'streakCount',member.love_streak_count);
  end if;
  if (select count(*) from public.messages where sender_id=auth.uid() and type='love' and created_at>now()-interval '10 seconds')>=10 then
    raise exception 'Espera unos segundos antes de enviar otro gesto' using errcode='22023';
  end if;
  insert into public.love_events(couple_id,user_id,sent_on) values(p_couple_id,auth.uid(),d)
    on conflict(couple_id,user_id,sent_on) do nothing returning id into event_id;
  if event_id is not null then
    member.love_streak_count:=case when member.last_love_date=d-1 then member.love_streak_count+1 else 1 end;
    update public.couple_members set love_streak_count=member.love_streak_count,last_love_date=d where couple_id=p_couple_id and user_id=auth.uid();
  end if;
  symbol:=case p_kind when 'love' then '❤️ Amor' when 'kiss' then '😘 Beso' when 'hug' then '🫂 Abrazo' else '✨ Te echo de menos' end;
  insert into public.messages(couple_id,sender_id,type,text,client_id,metadata)
    values(p_couple_id,auth.uid(),'love',symbol,p_client_id,jsonb_build_object('affection',p_kind));
  return jsonb_build_object('sentNow',true,'sentToday',true,'streakCount',member.love_streak_count);
end $$;
revoke all on function public.send_affection(uuid,uuid,text) from public;
grant execute on function public.send_affection(uuid,uuid,text) to authenticated;

create or replace function public.queue_message_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.type='event' then return new; end if;
  insert into public.notifications(user_id,couple_id,dedupe_key,title,body,kind,data)
    select user_id,new.couple_id,'message:'||new.id,case when new.type='love' then 'Un gesto de tu pareja' else 'Nuevo mensaje' end,
      case when new.type='love' then case new.metadata->>'affection' when 'kiss' then 'Te ha enviado un beso 😘'
        when 'hug' then 'Te ha enviado un abrazo 🫂' when 'miss_you' then 'Te echa de menos ✨' else 'Te ha enviado amor ❤️' end else left(new.text,180) end,
      case when new.type='love' then 'love' else 'chat' end,jsonb_build_object('screen','Chat','messageId',new.id)
      from public.couple_members where couple_id=new.couple_id and user_id<>new.sender_id;
  return new;
end $$;
commit;
