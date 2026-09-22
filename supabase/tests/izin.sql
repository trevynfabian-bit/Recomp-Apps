-- Hak tabel untuk peran `authenticated`. Di Supabase ini diberikan otomatis
-- untuk tabel baru lewat default privileges; di sini diberikan eksplisit agar
-- uji RLS benar-benar menguji RLS, bukan kegagalan GRANT.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
