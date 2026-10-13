begin;

create or replace function public.get_published_book_chunks_json(
  p_book_id uuid,
  p_language text,
  p_source_version integer default 1
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('chunk_index', c.chunk_index, 'content', c.content)
      order by c.chunk_index
    ),
    '[]'::jsonb
  )
  from public.book_chunks c
  where c.book_id = p_book_id
    and c.language = p_language
    and c.source_version = p_source_version
    and c.status = 'published';
$$;

create or replace function public.get_sacred_reference_nodes_json(
  p_book_id uuid,
  p_language text,
  p_source_version integer default 1
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'node_key', n.node_key,
        'node_type', n.node_type,
        'title', n.title,
        'ordinal', n.ordinal,
        'depth', n.depth,
        'start_chunk_index', n.start_chunk_index,
        'end_chunk_index', n.end_chunk_index,
        'metadata', n.metadata
      )
      order by n.ordinal, n.node_key
    ),
    '[]'::jsonb
  )
  from public.book_structure_nodes n
  where n.book_id = p_book_id
    and n.language = p_language
    and n.source_version = p_source_version;
$$;

revoke all on function public.get_published_book_chunks_json(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.get_sacred_reference_nodes_json(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.get_published_book_chunks_json(uuid,text,integer) to service_role;
grant execute on function public.get_sacred_reference_nodes_json(uuid,text,integer) to service_role;

commit;
