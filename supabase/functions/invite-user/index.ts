// Edge Function: invite-user
// Convida um usuário para o workspace e opcionalmente vincula ao ghl_users.
//
// POST body:
// {
//   "email": string,
//   "workspaceId": string,
//   "workspaceRole": "admin" | "member",
//   "ghlUserId"?: string,          // UUID de ghl_users (não o ghl_id)
//   "permissions"?: Array<{ module_key: string; can_view: boolean; can_edit: boolean }>
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { createRequestId, logSafeError, publicError } from '../_shared/safe-error.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const requestId = createRequestId()
    // Admin client — usa service role para inviteUserByEmail
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verificar autenticação do chamador via token JWT
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (!caller || authError) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verificar que o chamador é admin/owner no workspace
    const body = await req.json() as {
      email: string
      workspaceId: string
      workspaceRole: 'admin' | 'member'
      ghlUserId?: string
      permissions?: Array<{ module_key: string; can_view: boolean; can_edit: boolean }>
    }

    const { email, workspaceId, workspaceRole, ghlUserId, permissions } = body

    if (!email || !workspaceId || !workspaceRole) {
      return new Response(JSON.stringify({ error: 'email, workspaceId e workspaceRole são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerMembership } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', caller.id)
      .eq('is_active', true)
      .maybeSingle()

    let authorized = !!callerMembership && ['admin', 'owner'].includes(callerMembership.role)

    // Fallback: dono/admin de uma AGENCIA que tem esta sub-conta ATIVA tambem
    // pode convidar (ex.: primeiro admin de um workspace novo, onde o caller
    // ainda nao tem linha em workspace_members). NAO chamar as RPCs
    // is_agency_admin/can_access_workspace_via_agency via supabaseAdmin aqui:
    // elas dependem de auth.uid(), que e NULL no client service_role.
    if (!authorized) {
      const { data: agencyWorkspace } = await supabaseAdmin
        .from('agency_workspaces')
        .select('agency_id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .maybeSingle()

      if (agencyWorkspace?.agency_id) {
        const { data: agencyMembership } = await supabaseAdmin
          .from('agency_members')
          .select('role')
          .eq('agency_id', agencyWorkspace.agency_id)
          .eq('user_id', caller.id)
          .eq('is_active', true)
          .maybeSingle()

        authorized = !!agencyMembership && ['owner', 'admin'].includes(agencyMembership.role)
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Somente admins podem convidar usuários' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Garante que o workspace tenha apps e permissões default configurados
    // (trigger pode não ter rodado ou workspace pode ser anterior à migration)
    const { error: setupError } = await supabaseAdmin.rpc('setup_workspace_apps_and_permissions', {
      p_workspace_id: workspaceId,
    })
    if (setupError) {
      logSafeError('invite-user:setup-workspace-apps', requestId, setupError)
    }

    // 1. Verificar se o usuário já existe antes de convidar
    let newUserId: string

    const { data: existingList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = existingList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existingUser) {
      newUserId = existingUser.id
      // Se ainda não confirmou o email, gerar link e enviar via Resend
      if (!existingUser.email_confirmed_at) {
        const redirectTo = `${Deno.env.get('INVITE_REDIRECT_URL') ?? 'https://ceo.omnx.pro'}/reset-password`
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { redirectTo },
        })

        if (linkError) {
          logSafeError('invite-user:generate-link', requestId, linkError)
        } else {
          const actionLink = linkData?.properties?.action_link
          const resendKey = Deno.env.get('RESEND_API_KEY_DASHBOARD')
          if (actionLink && resendKey) {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'OMNX <noreply@omnx.pro>',
                to: [email],
                subject: 'Você foi convidado para o painel',
                html: `
                  <p>Olá,</p>
                  <p>Você foi convidado para acessar o painel da OMNX.</p>
                  <p>Clique no botão abaixo para definir sua senha:</p>
                  <a href="${actionLink}" style="display:inline-block;padding:12px 24px;background:#0D1829;color:white;text-decoration:none;border-radius:6px;font-family:sans-serif;">
                    Definir senha e acessar
                  </a>
                  <p style="color:#888;font-size:12px;margin-top:24px;">Se você não esperava este convite, pode ignorar este email.</p>
                `,
              }),
            })
            if (res.ok) {
              console.log('[invite-user] convite enviado', { request_id: requestId })
            } else {
              await res.text()
              console.error('[invite-user] envio de convite recusado', { request_id: requestId, status: res.status })
            }
          }
        }
      }
    } else {
      // Convidar pelo email (cria novo usuário)
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        { redirectTo: `${Deno.env.get('INVITE_REDIRECT_URL') ?? 'https://ceo.omnx.pro'}/reset-password` }
      )

      if (inviteError) {
        logSafeError('invite-user:invite', requestId, inviteError)
        return new Response(JSON.stringify({ error: 'Não foi possível enviar o convite.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      newUserId = inviteData.user.id
    }

    // 2. Criar workspace_members
    const { error: memberError } = await supabaseAdmin
      .from('workspace_members')
      .upsert({
        workspace_id: workspaceId,
        user_id: newUserId,
        role: workspaceRole,
        invited_by: caller.id,
        is_active: true,
      }, { onConflict: 'workspace_id,user_id' })

    if (memberError) {
      logSafeError('invite-user:create-membership', requestId, memberError)
      return new Response(JSON.stringify({ error: 'Não foi possível concluir o convite.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Inserir permissões de módulo
    if (permissions && permissions.length > 0) {
      // Remover permissões anteriores para este usuário neste workspace
      await supabaseAdmin
        .from('dashboard_user_permissions')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', newUserId)

      const toInsert = permissions
        .filter(p => p.can_view)
        .map(p => ({
          workspace_id: workspaceId,
          user_id: newUserId,
          module_key: p.module_key,
          can_view: p.can_view,
          can_edit: p.can_edit,
          granted_by: caller.id,
        }))

      if (toInsert.length > 0) {
        const { error: permError } = await supabaseAdmin
          .from('dashboard_user_permissions')
          .insert(toInsert)
        if (permError) {
          logSafeError('invite-user:permissions', requestId, permError)
        }
      }
    }

    // 4. Vincular ghl_users.auth_user_id se informado
    if (ghlUserId) {
      const { error: ghlError } = await supabaseAdmin
        .from('ghl_users')
        .update({ auth_user_id: newUserId })
        .eq('id', ghlUserId)
      if (ghlError) {
        logSafeError('invite-user:link-ghl-user', requestId, ghlError)
      }
    }

    return new Response(JSON.stringify({ user_id: newUserId, email }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const requestId = createRequestId()
    logSafeError('invite-user', requestId, err)
    return publicError('internal_error', requestId, 500, corsHeaders)
  }
})
