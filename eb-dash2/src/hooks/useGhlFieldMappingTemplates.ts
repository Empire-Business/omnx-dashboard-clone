import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GhlFieldMappingTemplate } from '@/types/ghl-config'

const QUERY_KEY = 'ghl-field-mapping-templates'

async function fetchTemplates(name = 'Empire Default'): Promise<GhlFieldMappingTemplate[]> {
  const { data, error } = await supabase
    .from('ghl_field_mapping_templates')
    .select('*')
    .eq('name', name)
    .order('logical_name', { ascending: true })

  if (error) throw error

  return (data ?? []) as GhlFieldMappingTemplate[]
}

export function useGhlFieldMappingTemplates(name = 'Empire Default') {
  return useQuery({
    queryKey: [QUERY_KEY, name],
    queryFn: () => fetchTemplates(name),
  })
}
