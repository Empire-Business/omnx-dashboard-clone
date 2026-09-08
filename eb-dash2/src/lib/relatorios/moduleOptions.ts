// Módulos do relatório semanal — correspondem 1:1 às 9 tabelas weekly_*
// (weekly_trafego, weekly_aquisicao, weekly_organico, weekly_prevendas,
// weekly_vendas, weekly_recuperacao, weekly_sdr, weekly_closer, weekly_metas).
//
// Fonte de verdade única — antes existiam duas listas divergentes
// (AutomationForm.tsx tinha os 9, RelatoriosPage.tsx só tinha 5), o que
// fazia o filtro de módulo do relatório não oferecer Aquisição/SDR/Closer/
// Metas mesmo esses dados existindo.
export const REPORT_MODULE_OPTIONS = [
  { value: 'trafego', label: 'Tráfego' },
  { value: 'aquisicao', label: 'Aquisição' },
  { value: 'organico', label: 'Orgânico' },
  { value: 'prevendas', label: 'Pré-Vendas' },
  { value: 'vendas', label: 'Vendas' },
  { value: 'recuperacao', label: 'Recuperação' },
  { value: 'sdr', label: 'SDR' },
  { value: 'closer', label: 'Closer' },
  { value: 'metas', label: 'Metas' },
] as const

export type ReportModule = (typeof REPORT_MODULE_OPTIONS)[number]['value']
