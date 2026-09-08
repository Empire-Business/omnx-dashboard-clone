#!/usr/bin/env node
/**
 * Lead Scoring Script - GHL-Supabase
 * 
 * Calcula scores preditivos para todos os leads baseado em:
 * - A. Fit Demográfico/Firmográfico (25%)
 * - B. Engajamento Comportamental (35%)
 * - C. Progressão de Estágio (25%)
 * - D. Sinais Explícitos (15%)
 * 
 * Output: all-leads-scored.json
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const DATA_DIR = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(__dirname, 'all-leads-scored.json');

// Ficheiros de dados
const FILES = {
  contatos: path.join(DATA_DIR, 'raw_contatos.json'),
  oportunidades: path.join(DATA_DIR, 'raw_oportunidades.json'),
  comunicacoes: path.join(DATA_DIR, 'raw_comunicacoes.json'),
  vendas_fechamento: path.join(DATA_DIR, 'raw_vendas_fechamento.json'),
};

// Domínios considerados pessoais (não corporativos)
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.com.br', 'hotmail.com', 'hotmail.com.br',
  'outlook.com', 'outlook.com.br', 'live.com', 'msn.com', 'icloud.com',
  'aol.com', 'terra.com.br', 'uol.com.br', 'bol.com.br', 'ig.com.br',
  'protonmail.com', 'proton.me', 'mail.com', 'ymail.com', 'icloud.com'
]);

// ============================================================================
// HELPERS DE DATA
// ============================================================================

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(date1, date2) {
  if (!date1 || !date2) return null;
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  if (!d1 || !d2) return null;
  const diffMs = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function daysSince(dateStr, referenceDate = new Date()) {
  if (!dateStr) return null;
  const d = parseDate(dateStr);
  if (!d) return null;
  const diffMs = referenceDate.getTime() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================================
// HELPERS DE TAGS
// ============================================================================

function parseTags(tagsStr) {
  if (!tagsStr) return [];
  return tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

function hasTag(tags, tagName) {
  const tagList = parseTags(tags);
  return tagList.some(t => t.toLowerCase() === tagName.toLowerCase() || t.includes(tagName.toLowerCase()));
}

function hasFnTag(tags) {
  const tagList = parseTags(tags);
  return tagList.some(t => t.startsWith('[fn]') || t.startsWith('[fn'));
}

// ============================================================================
// HELPERS DE EMAIL
// ============================================================================

function getEmailDomain(email) {
  if (!email) return null;
  const parts = email.toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : null;
}

function isCorporateEmail(email) {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return !PERSONAL_EMAIL_DOMAINS.has(domain);
}

// ============================================================================
// HELPERS DE FONTE DE TRÁFEGO
// ============================================================================

function getTrafficSourceScore(utmSource, utmMedium) {
  if (!utmSource && !utmMedium) return 1; // Unknown
  
  const source = (utmSource || '').toLowerCase();
  const medium = (utmMedium || '').toLowerCase();
  
  // Paid sources
  if (source.includes('google') || source.includes('gclid') || 
      source.includes('facebook') || source.includes('fb-') ||
      source.includes('instagram') || source.includes('meta') ||
      medium === 'cpc' || medium === 'paid') {
    return 5;
  }
  
  // Organic high-intent
  if (source.includes('org') || source.includes('indication') ||
      source.includes('social-selling') || medium === 'organic') {
    return 4;
  }
  
  // Referral
  if (medium === 'referral' || source.includes('referral')) {
    return 3;
  }
  
  // Direct
  if (!utmSource || source === 'direct' || medium === 'none' || medium === 'not set') {
    return 2;
  }
  
  return 1; // Unknown
}

// ============================================================================
// HELPERS DE PIPELINE
// ============================================================================

function getPipelineScore(pipelineName) {
  if (!pipelineName) return 1;
  
  const name = pipelineName.toLowerCase();
  
  if (name.includes('sql') && (name.includes('vendas') || name.includes('sales'))) {
    return 5;
  }
  if (name.includes('mql') && !name.includes('nmql')) {
    return 4;
  }
  if (name.includes('nmql')) {
    return 3;
  }
  if (name.includes('qualif')) {
    return 2;
  }
  if (name.includes('open') || name.includes('primeiro')) {
    return 1;
  }
  
  return 1;
}

function getStageScore(opp) {
  // Check for closed won
  if (opp.status === 'won' || opp.data_fechado) return 4;
  
  // Check for meeting realized
  if (opp.data_realizacao_vendas || opp.data_reuniao_realizada) return 4;
  
  // Check for meeting scheduled
  if (opp.data_agendamento_vendas || opp.data_agendamento_reuniao || opp.data_reuniao_agendada) return 3;
  
  // Check for negotiation
  if (opp.data_negociacao) return 3;
  
  // Check for qualification
  if (opp.data_qualificado || opp.data_conectado) return 2;
  
  // Open/first contact
  if (opp.data_lead_recebido) return 1;
  
  return 0;
}

// ============================================================================
// CÁLCULO DE FEATURES
// ============================================================================

function calculateDemographicScore(contato, oportunidades) {
  let score = 0;
  const details = {};
  
  // A1. Email Type (0-5)
  const emailScore = isCorporateEmail(contato.email) ? 5 : 
                     (getEmailDomain(contato.email) ? 3 : 1);
  score += Math.min(5, emailScore);
  details.email_type_score = Math.min(5, emailScore);
  details.is_corporate_email = isCorporateEmail(contato.email);
  
  // A2. Traffic Source (0-5)
  const trafficScore = getTrafficSourceScore(contato.utm_source, contato.utm_medium);
  score += Math.min(5, trafficScore);
  details.traffic_source_score = Math.min(5, trafficScore);
  
  // A3. Campaign Quality (0-5) - default to 3 (medium)
  const campaignScore = 3; // Without historical data, assume medium
  score += Math.min(5, campaignScore);
  details.campaign_quality_score = Math.min(5, campaignScore);
  
  // A4. Pipeline Stage (0-5)
  const bestOpp = oportunidades
    .filter(o => o.contato_id === contato.id)
    .sort((a, b) => {
      const scoreA = getPipelineScore(a.pipeline_name);
      const scoreB = getPipelineScore(b.pipeline_name);
      return scoreB - scoreA;
    })[0];
  
  const pipelineScore = bestOpp ? getPipelineScore(bestOpp.pipeline_name) : 1;
  score += Math.min(5, pipelineScore);
  details.pipeline_score = Math.min(5, pipelineScore);
  details.best_pipeline = bestOpp?.pipeline_name || null;
  
  return { score: Math.min(20, score), details };
}

function calculateBehavioralScore(contato, oportunidades, comunicacoes) {
  let score = 0;
  const details = {};
  
  const contatoId = contato.id;
  
  // B1. Total Communications (0-7)
  const comms = comunicacoes.filter(c => c.contato_id === contatoId);
  const totalComms = comms.length;
  
  let commScore = 0;
  if (totalComms >= 15) commScore = 7;
  else if (totalComms >= 10) commScore = 6;
  else if (totalComms >= 7) commScore = 5;
  else if (totalComms >= 4) commScore = 4;
  else if (totalComms >= 2) commScore = 3;
  else if (totalComms === 1) commScore = 2;
  else commScore = 0;
  
  score += commScore;
  details.total_communications = totalComms;
  details.communication_score = commScore;
  
  // B2. Inbound Ratio (0-6)
  // Considera mensagens que parecem responses (direction 'inbound' ou conversation initiations)
  // Simplificado: mensagens do lead para nós são inbound
  const inboundMsgs = comms.filter(c => 
    c.direction === 'inbound' || 
    (c.ghl_source && c.ghl_source.includes('reply'))
  ).length;
  
  const inboundRatio = totalComms > 0 ? (inboundMsgs / totalComms) * 100 : 0;
  
  let inboundScore = 0;
  if (inboundRatio >= 60) inboundScore = 6;
  else if (inboundRatio >= 40) inboundScore = 5;
  else if (inboundRatio >= 25) inboundScore = 4;
  else if (inboundRatio >= 15) inboundScore = 3;
  else if (inboundRatio >= 5) inboundScore = 2;
  else if (inboundRatio > 0) inboundScore = 1;
  
  score += inboundScore;
  details.inbound_ratio = Math.round(inboundRatio);
  details.inbound_score = inboundScore;
  
  // B3. Time to First Response (0-6)
  const firstContact = [...comms]
    .sort((a, b) => new Date(a.data_comunicacao) - new Date(b.data_comunicacao))[0];
  
  let firstResponseScore = 0;
  if (firstContact && contato.date_created) {
    const leadDate = parseDate(contato.date_created);
    const firstContactDate = parseDate(firstContact.data_comunicacao);
    
    if (leadDate && firstContactDate) {
      const hoursToResponse = (firstContactDate.getTime() - leadDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursToResponse <= 1) firstResponseScore = 6;
      else if (hoursToResponse <= 4) firstResponseScore = 5;
      else if (hoursToResponse <= 12) firstResponseScore = 4;
      else if (hoursToResponse <= 24) firstResponseScore = 3;
      else if (hoursToResponse <= 72) firstResponseScore = 2;
      else if (hoursToResponse <= 168) firstResponseScore = 1;
    }
  }
  
  score += firstResponseScore;
  details.first_response_hours = firstContact ? 
    Math.round((parseDate(firstContact.data_comunicacao).getTime() - parseDate(contato.date_created).getTime()) / (1000 * 60 * 60)) : null;
  details.first_response_score = firstResponseScore;
  
  // B4. Meetings Scheduled (0-4)
  const opps = oportunidades.filter(o => o.contato_id === contatoId);
  const meetingsScheduled = opps.filter(o => 
    o.data_agendamento_reuniao || o.data_agendamento_vendas || o.data_reuniao_agendada
  ).length;
  
  let meetingSchedScore = 0;
  if (meetingsScheduled >= 3) meetingSchedScore = 4;
  else if (meetingsScheduled === 2) meetingSchedScore = 3;
  else if (meetingsScheduled === 1) meetingSchedScore = 2;
  
  score += meetingSchedScore;
  details.meetings_scheduled = meetingsScheduled;
  details.meeting_scheduled_score = meetingSchedScore;
  
  // B5. Meetings Realized (0-6)
  const meetingsRealized = opps.filter(o => 
    o.data_realizacao_vendas || o.data_reuniao_realizada
  ).length;
  
  let meetingRealScore = 0;
  if (meetingsRealized >= 3) meetingRealScore = 6;
  else if (meetingsRealized === 2) meetingRealScore = 5;
  else if (meetingsRealized === 1) meetingRealScore = 4;
  else if (meetingsScheduled > 0) meetingRealScore = 2; // Scheduled but not realized
  
  score += meetingRealScore;
  details.meetings_realized = meetingsRealized;
  details.meetings_realized_score = meetingRealScore;
  
  // B6. Call Duration (0-3)
  const calls = comms.filter(c => c.tipo === 'call' || c.channel === 'call');
  const totalCallDuration = calls.reduce((sum, c) => {
    const duration = parseInt(c.phone_call_duration) || 0;
    return sum + duration;
  }, 0);
  
  let callScore = 0;
  if (totalCallDuration >= 1800) callScore = 3; // 30+ minutes
  else if (totalCallDuration >= 600) callScore = 2; // 10-29 minutes
  else if (totalCallDuration >= 60) callScore = 1; // 1-9 minutes
  
  score += callScore;
  details.total_call_seconds = totalCallDuration;
  details.call_duration_score = callScore;
  
  // B7. Read Rate (0-3) - simplified for email
  const emails = comms.filter(c => c.channel === 'email' || c.tipo === 'email');
  const emailsWithTracking = emails.filter(e => e.msg_status);
  const readEmails = emailsWithTracking.filter(e => 
    e.msg_status === 'read' || e.msg_status === 'delivered'
  );
  
  const readRate = emails.length > 0 ? (readEmails.length / emails.length) * 100 : 0;
  
  let readScore = 0;
  if (readRate >= 80) readScore = 3;
  else if (readRate >= 50) readScore = 2;
  else if (readRate > 0) readScore = 1;
  
  score += readScore;
  details.email_read_rate = Math.round(readRate);
  details.read_rate_score = readScore;
  
  return { score: Math.min(35, score), details };
}

function calculateStageProgressionScore(contato, oportunidades) {
  let score = 0;
  const details = {};
  const contatoId = contato.id;
  const opps = oportunidades.filter(o => o.contato_id === contatoId);
  
  if (opps.length === 0 || !contato.date_created) {
    details.days_to_connected = null;
    details.days_to_scheduled = null;
    details.days_to_realized = null;
    details.stages_advanced = 0;
    details.current_stage_score = 0;
    return { score: 0, details };
  }
  
  const leadDate = parseDate(contato.date_created);
  const bestOpp = opps[0]; // Primary opportunity
  
  // C1. Days to Connected (0-6)
  const daysToConnected = bestOpp.data_conectado ? 
    daysBetween(contato.date_created, bestOpp.data_conectado) : null;
  
  let connectedScore = 0;
  if (daysToConnected !== null) {
    if (daysToConnected <= 2) connectedScore = 6;
    else if (daysToConnected <= 7) connectedScore = 5;
    else if (daysToConnected <= 14) connectedScore = 4;
    else if (daysToConnected <= 30) connectedScore = 3;
    else if (daysToConnected <= 60) connectedScore = 2;
    else if (daysToConnected <= 90) connectedScore = 1;
  }
  
  score += connectedScore;
  details.days_to_connected = daysToConnected;
  details.connected_score = connectedScore;
  
  // C2. Days to Meeting Scheduled (0-5)
  const scheduledDate = bestOpp.data_agendamento_reuniao || bestOpp.data_agendamento_vendas || bestOpp.data_reuniao_agendada;
  const daysToScheduled = scheduledDate ? daysBetween(contato.date_created, scheduledDate) : null;
  
  let scheduledScore = 0;
  if (daysToScheduled !== null) {
    if (daysToScheduled <= 7) scheduledScore = 5;
    else if (daysToScheduled <= 14) scheduledScore = 4;
    else if (daysToScheduled <= 30) scheduledScore = 3;
    else if (daysToScheduled <= 60) scheduledScore = 2;
    else if (daysToScheduled <= 90) scheduledScore = 1;
  }
  
  score += scheduledScore;
  details.days_to_scheduled = daysToScheduled;
  details.scheduled_score = scheduledScore;
  
  // C3. Days to Meeting Realized (0-6)
  const realizedDate = bestOpp.data_realizacao_vendas || bestOpp.data_reuniao_realizada;
  const daysToRealized = realizedDate ? daysBetween(contato.date_created, realizedDate) : null;
  
  let realizedScore = 0;
  if (daysToRealized !== null) {
    if (daysToRealized <= 14) realizedScore = 6;
    else if (daysToRealized <= 30) realizedScore = 5;
    else if (daysToRealized <= 60) realizedScore = 4;
    else if (daysToRealized <= 90) realizedScore = 3;
    else realizedScore = 2;
  }
  
  score += realizedScore;
  details.days_to_realized = daysToRealized;
  details.realized_score = realizedScore;
  
  // C4. Stages Advanced (0-4)
  let stagesAdvanced = 0;
  if (bestOpp.data_conectado) stagesAdvanced++;
  if (bestOpp.data_qualificado || bestOpp.data_tentativa_1) stagesAdvanced++;
  if (bestOpp.data_agendamento_reuniao || bestOpp.data_agendamento_vendas) stagesAdvanced++;
  if (bestOpp.data_realizacao_vendas || bestOpp.data_reuniao_realizada) stagesAdvanced++;
  if (bestOpp.data_negociacao || bestOpp.data_fechado) stagesAdvanced++;
  
  let stageAdvScore = 0;
  if (stagesAdvanced >= 5) stageAdvScore = 4;
  else if (stagesAdvanced >= 3) stageAdvScore = 3;
  else if (stagesAdvanced >= 2) stageAdvScore = 2;
  else if (stagesAdvanced >= 1) stageAdvScore = 1;
  
  score += stageAdvScore;
  details.stages_advanced = stagesAdvanced;
  details.stages_advanced_score = stageAdvScore;
  
  // C5. Current Stage Score (0-4)
  const stageScore = getStageScore(bestOpp);
  score += stageScore;
  details.current_stage_score = stageScore;
  
  return { score: Math.min(25, score), details };
}

function calculateExplicitSignalsScore(contato, oportunidades) {
  let score = 0;
  const details = {};
  const tags = contato.tags;
  
  // D1. MQL Tag (0-4)
  const isMql = hasTag(tags, 'mql');
  score += isMql ? 4 : 0;
  details.is_mql = isMql;
  
  // D2. SQL Tag (0-4)
  const isSql = hasTag(tags, 'sql');
  score += isSql ? 4 : 0;
  details.is_sql = isSql;
  
  // D3. [fn] Tag (0-3)
  const hasFn = hasFnTag(tags);
  score += hasFn ? 3 : 0;
  details.has_fn_tag = hasFn;
  
  // D4. SDR Assigned (0-2)
  const hasSdr = !!(contato.owner_name || contato.owner_id || 
    (oportunidades.find(o => o.contato_id === contato.id && o.sdr_name)));
  score += hasSdr ? 2 : 0;
  details.has_sdr = hasSdr;
  details.sdr_name = contato.owner_name || oportunidades.find(o => o.contato_id === contato.id)?.sdr_name || null;
  
  // D5. Vendas Pipeline (vs Pré-Vendas) (0-2)
  const opps = oportunidades.filter(o => o.contato_id === contato.id);
  const inVendasPipeline = opps.some(o => 
    o.pipeline_name && (o.pipeline_name.toLowerCase().includes('sql') || 
    o.pipeline_name.toLowerCase().includes('vendas'))
  );
  score += inVendasPipeline ? 2 : 0;
  details.in_vendas_pipeline = inVendasPipeline;
  
  return { score: Math.min(15, score), details };
}

// ============================================================================
// CATEGORIZAÇÃO
// ============================================================================

function getCategory(score) {
  // Recalibrated thresholds based on actual data distribution
  // Max observed score ~22, targets: top 10% ~18+, next 15% ~14-17, next 25% ~8-13
  if (score >= 18) return 'hot';
  if (score >= 14) return 'warm';
  if (score >= 8) return 'nurturing';
  return 'cold';
}

function getCategoryLabel(category) {
  const labels = {
    hot: '🔥 HOT (18-22) - Contato Imediato',
    warm: '🌡️ WARM (14-17) - Alta Prioridade',
    nurturing: '🌱 NURTURING (8-13) - Continue Engajamento',
    cold: '❄️ COLD (0-7) - Baixa Prioridade'
  };
  return labels[category] || category;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 Starting Lead Scoring...\n');
  
  // Load data
  console.log('📂 Loading data files...');
  
  const [rawContatos, rawOportunidades, rawComunicacoes, rawVendas] = await Promise.all([
    fs.promises.readFile(FILES.contatos, 'utf-8'),
    fs.promises.readFile(FILES.oportunidades, 'utf-8'),
    fs.promises.readFile(FILES.comunicacoes, 'utf-8'),
    fs.promises.readFile(FILES.vendas_fechamento, 'utf-8'),
  ]);
  
  const contatos = JSON.parse(rawContatos);
  const oportunidades = JSON.parse(rawOportunidades);
  const comunicacoes = JSON.parse(rawComunicacoes);
  const vendasFechamento = JSON.parse(rawVendas);
  
  console.log(`   Contatos: ${contatos.length.toLocaleString()}`);
  console.log(`   Oportunidades: ${oportunidades.length.toLocaleString()}`);
  console.log(`   Comunicações: ${comunicacoes.length.toLocaleString()}`);
  console.log(`   Vendas Fechamento: ${vendasFechamento.length.toLocaleString()}\n`);
  
  // Build buyer set
  const buyerContatoIds = new Set(
    vendasFechamento
      .filter(v => v.data_pagamento_entrada)
      .map(v => v.contato_id)
  );
  
  // Build buyer date map
  const buyerDateMap = {};
  for (const v of vendasFechamento) {
    if (v.data_pagamento_entrada) {
      buyerDateMap[v.contato_id] = v.data_pagamento_entrada;
    }
  }
  
  console.log(`   Buyers identificados: ${buyerContatoIds.size.toLocaleString()}\n`);
  
  // Calculate scores
  console.log('⚙️  Calculating scores...\n');
  
  const scoredContacts = [];
  let processed = 0;
  
  for (const contato of contatos) {
    processed++;
    if (processed % 1000 === 0) {
      console.log(`   Processado: ${processed.toLocaleString()} / ${contatos.length.toLocaleString()}`);
    }
    
    const contatoOpps = oportunidades.filter(o => o.contato_id === contato.id);
    
    // Calculate all score components
    const demographic = calculateDemographicScore(contato, oportunidades);
    const behavioral = calculateBehavioralScore(contato, oportunidades, comunicacoes);
    const stageProgression = calculateStageProgressionScore(contato, oportunidades);
    const explicitSignals = calculateExplicitSignalsScore(contato, oportunidades);
    
    // Calculate final weighted score
    const rawScore = 
      (demographic.score * 0.25) +
      (behavioral.score * 0.35) +
      (stageProgression.score * 0.25) +
      (explicitSignals.score * 0.15);
    
    const scoreFinal = Math.round(rawScore * 100) / 100;
    const category = getCategory(scoreFinal);
    const isBuyer = buyerContatoIds.has(contato.id);
    
    scoredContacts.push({
      contato_id: contato.id,
      nome: contato.nome,
      email: contato.email,
      telefone: contato.telefone,
      score_final: scoreFinal,
      categoria: category,
      categoria_label: getCategoryLabel(category),
      breakdown: {
        fit_demografico: Math.round(demographic.score * 100) / 100,
        engajamento_comportamental: Math.round(behavioral.score * 100) / 100,
        progressao_estagio: Math.round(stageProgression.score * 100) / 100,
        sinais_explicitos: Math.round(explicitSignals.score * 100) / 100,
      },
      feature_details: {
        demografico: demographic.details,
        comportamental: behavioral.details,
        progressao: stageProgression.details,
        sinais: explicitSignals.details,
      },
      is_buyer: isBuyer,
      buyer_confirmed_at: buyerDateMap[contato.id] || null,
      pipeline_name: contato.pipeline_name,
      owner_name: contato.owner_name,
      tags: contato.tags,
      data_lead_recebido: contato.date_created,
      created_at: new Date().toISOString(),
    });
  }
  
  // Sort by score descending
  scoredContacts.sort((a, b) => b.score_final - a.score_final);
  
  // Calculate distribution
  const distribution = {
    hot: scoredContacts.filter(c => c.categoria === 'hot').length,
    warm: scoredContacts.filter(c => c.categoria === 'warm').length,
    nurturing: scoredContacts.filter(c => c.categoria === 'nurturing').length,
    cold: scoredContacts.filter(c => c.categoria === 'cold').length,
  };
  
  // Calculate buyer statistics
  const buyers = scoredContacts.filter(c => c.is_buyer);
  const nonBuyers = scoredContacts.filter(c => !c.is_buyer);
  
  const buyerStats = {
    count: buyers.length,
    avg_score: buyers.length > 0 ? (buyers.reduce((s, c) => s + c.score_final, 0) / buyers.length).toFixed(2) : 0,
    median_score: buyers.length > 0 ? buyers[Math.floor(buyers.length / 2)].score_final.toFixed(2) : 0,
    min_score: buyers.length > 0 ? Math.min(...buyers.map(c => c.score_final)).toFixed(2) : 0,
    max_score: buyers.length > 0 ? Math.max(...buyers.map(c => c.score_final)).toFixed(2) : 0,
    hot_percentage: buyers.length > 0 ? ((buyers.filter(c => c.categoria === 'hot').length / buyers.length) * 100).toFixed(1) : 0,
    warm_or_hot: buyers.length > 0 ? ((buyers.filter(c => c.categoria === 'hot' || c.categoria === 'warm').length / buyers.length) * 100).toFixed(1) : 0,
  };
  
  const nonBuyerStats = {
    count: nonBuyers.length,
    avg_score: nonBuyers.length > 0 ? (nonBuyers.reduce((s, c) => s + c.score_final, 0) / nonBuyers.length).toFixed(2) : 0,
    median_score: nonBuyers.length > 0 ? nonBuyers[Math.floor(nonBuyers.length / 2)].score_final.toFixed(2) : 0,
    hot_percentage: nonBuyers.length > 0 ? ((nonBuyers.filter(c => c.categoria === 'hot').length / nonBuyers.length) * 100).toFixed(1) : 0,
    warm_or_hot: nonBuyers.length > 0 ? ((nonBuyers.filter(c => c.categoria === 'hot' || c.categoria === 'warm').length / nonBuyers.length) * 100).toFixed(1) : 0,
  };
  
  // Output results
  const output = {
    metadata: {
      version: '1.0',
      calculated_at: new Date().toISOString(),
      total_contacts: contatos.length,
      total_buyers: buyers.length,
      total_non_buyers: nonBuyers.length,
      score_distribution: distribution,
      score_distribution_pct: {
        hot: ((distribution.hot / contatos.length) * 100).toFixed(1) + '%',
        warm: ((distribution.warm / contatos.length) * 100).toFixed(1) + '%',
        nurturing: ((distribution.nurturing / contatos.length) * 100).toFixed(1) + '%',
        cold: ((distribution.cold / contatos.length) * 100).toFixed(1) + '%',
      },
      validation: {
        buyer_stats: buyerStats,
        non_buyer_stats: nonBuyerStats,
      },
      weights: {
        fit_demografico: '25%',
        engajamento_comportamental: '35%',
        progressao_estagio: '25%',
        sinais_explicitos: '15%',
      },
    },
    contacts: scoredContacts,
  };
  
  // Write output
  console.log('\n💾 Writing output file...');
  await fs.promises.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTADO DO SCORING');
  console.log('='.repeat(60));
  console.log(`\nTotal de Leads: ${contatos.length.toLocaleString()}`);
  console.log(`Buyers Confirmados: ${buyers.length.toLocaleString()}`);
  console.log(`\nDistribuição de Scores:`);
  console.log(`  🔥 Hot (18-22):      ${distribution.hot.toLocaleString().padStart(5)} (${((distribution.hot / contatos.length) * 100).toFixed(1)}%)`);
  console.log(`  🌡️  Warm (14-17):     ${distribution.warm.toLocaleString().padStart(5)} (${((distribution.warm / contatos.length) * 100).toFixed(1)}%)`);
  console.log(`  🌱 Nurturing (8-13): ${distribution.nurturing.toLocaleString().padStart(5)} (${((distribution.nurturing / contatos.length) * 100).toFixed(1)}%)`);
  console.log(`  ❄️  Cold (0-7):      ${distribution.cold.toLocaleString().padStart(5)} (${((distribution.cold / contatos.length) * 100).toFixed(1)}%)`);
  
  console.log(`\n📈 Validação contra Buyers:`);
  console.log(`  Buyers avg score:    ${buyerStats.avg_score}`);
  console.log(`  Non-buyers avg score: ${nonBuyerStats.avg_score}`);
  console.log(`  Buyers in Hot:        ${buyerStats.hot_percentage}%`);
  console.log(`  Non-buyers in Hot:    ${nonBuyerStats.hot_percentage}%`);
  
  console.log(`\n✅ Output guardado em: ${OUTPUT_FILE}`);
  console.log('='.repeat(60));
  
  // Show top 10 hot leads
  console.log('\n🔥 TOP 10 HOT LEADS:');
  console.log('-'.repeat(80));
  scoredContacts.slice(0, 10).forEach((c, i) => {
    const buyerTag = c.is_buyer ? ' [BUYER]' : '';
    console.log(`${(i+1).toString().padStart(2)}. ${c.nome.padEnd(30)} Score: ${c.score_final.toFixed(2)}${buyerTag}`);
  });
  
  // Show some buyers with low scores (anomalies)
  const lowScoringBuyers = buyers.filter(c => c.score_final < 50).slice(0, 5);
  if (lowScoringBuyers.length > 0) {
    console.log('\n⚠️  BUYERS COM SCORES BAIXOS (Anomalias):');
    console.log('-'.repeat(80));
    lowScoringBuyers.forEach((c, i) => {
      console.log(`${(i+1).toString().padStart(2)}. ${c.nome.padEnd(30)} Score: ${c.score_final.toFixed(2)}`);
    });
  }
}

main().catch(console.error);
