-- Endurecimiento tras el aviso del revisor de seguridad de Supabase. Ejecutar después de 003.
-- Las funciones auxiliares solo las necesitan usuarios con sesión (las políticas RLS y los RPC de la app);
-- el rol anónimo no debe poder llamarlas. Los 7 avisos «authenticated» que quedan son intencionados:
-- cada función comprueba auth.uid() internamente.
revoke execute on function public.can_express_interest(uuid), public.close_my_request(uuid), public.company_revealed_to_me(uuid),
  public.interest_accepted_for_owner(uuid), public.is_admin(), public.owns_opportunity(uuid), public.respond_interest(uuid, boolean) from anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated; -- solo lo ejecuta el trigger de alta
