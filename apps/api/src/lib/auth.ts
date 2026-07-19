import { betterAuth, APIError } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma.js'

// better-auth's create hooks don't share context between `before` and `after`
// for the same signup request, so this in-memory map bridges "which invite (if
// any) actually granted this role" from before() to after() — see the create
// hook below. Requests for the same email can't race each other in a way that
// matters here since email uniqueness on User already serializes them.
const pendingInviteClaims = new Map<string, string>()

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
        // to ADMIN. A pending invite (matched by email) bypasses ALLOW_SIGNUP and
        // sets the role the admin picked when generating the invite link.
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

          const invite = await prisma.invite.findFirst({
            where: { email: user.email, usedAt: null },
          })

          if (invite) {
            pendingInviteClaims.set(user.email, invite.id)
            return { data: { ...user, role: invite.role } }
          }

          if (process.env.ALLOW_SIGNUP !== 'true') {
            throw new APIError('FORBIDDEN', {
              message: 'Public sign-up is disabled. Ask a workspace admin to invite you.',
            })
          }

          return { data: { ...user, role: 'EDITOR' } }
        },
        // Marks the invite consumed now that the user record actually exists —
        // creation could still fail after `before` (e.g. duplicate email), so
        // this must not happen until we know the account was really created.
        // Only consumes the invite that actually granted this role (tracked
        // via pendingInviteClaims) — a signup that got in through the
        // first-admin or open-signup path must not silently burn an unrelated
        // pending invite for the same email.
        async after(user) {
          const inviteId = pendingInviteClaims.get(user.email)
          if (!inviteId) return
          pendingInviteClaims.delete(user.email)
          await prisma.invite.updateMany({
            where: { id: inviteId, usedAt: null },
            data: { usedAt: new Date(), usedById: user.id },
          })
        },
      },
    },
  },
  trustedOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
})

export type Auth = typeof auth
