-- Remove coluna órfã: não é mais populada pelo backend e hoje não possui dados úteis.
ALTER TABLE public.contatos
DROP COLUMN IF EXISTS hashtags;
