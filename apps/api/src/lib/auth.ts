import { betterAuth, APIError } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma.js'

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  plugins: [
    // Exposes /api/auth/admin/* (list/ban/unban/set-role/revoke-sessions) gated on
    // role — reuses our existing ADMIN/EDITOR/VIEWER enum instead of a separate one.
    admin({ defaultRole: 'EDITOR', adminRoles: ['ADMIN'] }),
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh if older than 1 day
  },
  user: {
    additionalFields: {
      // Without this, better-auth strips the Prisma `role` column from
      // session.user since it isn't part of its core user schema — role
      // checks on the API would silently see `undefined` for everyone.
      role: {
        type: 'string',
        required: false,
        defaultValue: 'EDITOR',
        input: false, // never settable from signup/update-user requests
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Gate self-service sign-up behind ALLOW_SIGNUP so a random visitor can't
        // create an account and get full EDITOR access to every page. The very
        // first account (workspace owner) is always allowed through and promoted
        // to ADMIN. A pending invite for this email also bypasses ALLOW_SIGNUP —
        // so an invited person can still create an account on a closed instance —
        // but NEVER grants the invite's role here. Matching by email alone isn't
        // proof of anything (email ownership isn't verified at signup), so the
        // elevated role is only ever granted by POST /api/invites/:token/redeem,
        // which requires presenting the actual unguessable token. Every account
        // created through this hook starts at the default EDITOR role with zero
        // workspace memberships, so it has no access to anything until an admin
        // (or a redeemed invite) grants some.
        async before(user) {
          // Atomic claim: a plain `count(User) === 0` check-then-act would let
          // two concurrent signups on a fresh instance both see "no users yet"
          // and both become ADMIN. This single INSERT ... ON CONFLICT is
          // serialized by Postgres's own unique-index insert handling, so only
          // one request can ever win the claim.
          const claim = await prisma.$queryRaw<Array<{ claimed: boolean }>>`
            INSERT INTO "SystemState" (id, "firstAdminClaimed")
            VALUES (1, true)
            ON CONFLICT (id) DO UPDATE SET "firstAdminClaimed" = true
            WHERE "SystemState"."firstAdminClaimed" = false
            RETURNING true AS claimed
          `

          if (claim.length > 0) {
            return { data: { ...user, role: 'ADMIN' } }
          }

          if (process.env.ALLOW_SIGNUP !== 'true') {
            const hasPendingInvite = await prisma.invite.findFirst({
              where: { email: user.email, usedAt: null },
              select: { id: true },
            })
            if (!hasPendingInvite) {
              throw new APIError('FORBIDDEN', {
                message: 'Public sign-up is disabled. Ask a workspace admin to invite you.',
              })
            }
          }

          return { data: { ...user, role: 'EDITOR' } }
        },
      },
    },
  },
  trustedOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
})

export type Auth = typeof auth
